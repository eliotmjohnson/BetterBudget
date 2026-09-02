import 'server-only';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { monthLabel, shiftMonth, type MonthKey } from '@/domain/money';
import { splitsMatchTotal } from '@/domain/budget-calculations';
import type { MutationResult } from '@/domain/types';
import { getDatabase, type AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    incomePlans,
    incomeReceipts,
    monthlyBudgetCategories,
    monthlyBudgetItems,
    mutationReceipts,
    transactionSplits,
    transactions
} from '@/db/schema';
import type { BudgetMutation } from './mutation-schema';
import { monthDate } from '@/domain/calendar';
import { getMonthSnapshot } from './month-snapshot';
import {
    MutationFailure,
    throwCategoryMutationFailure,
    throwItemDefinitionMutationFailure,
    throwMonthlyItemMutationFailure,
    throwTransactionMutationFailure
} from './mutation-failures';

async function ensureMonth(
    db: AppDb,
    householdId: string,
    monthKey: MonthKey
): Promise<string> {
    const date = monthDate(monthKey);

    await db
        .insert(budgetMonths)
        .values({ householdId, month: date })
        .onConflictDoNothing();
    const row = await db
        .select({ id: budgetMonths.id })
        .from(budgetMonths)
        .where(
            and(
                eq(budgetMonths.householdId, householdId),
                eq(budgetMonths.month, date)
            )
        )
        .limit(1);

    if (!row[0])
        throw new MutationFailure(
            'not_found',
            'Budget month could not be created.'
        );

    return row[0].id;
}

async function deleteUnusedResetDefinitions(
    db: AppDb,
    householdId: string,
    budgetItemDefinitionIds: string[],
    categoryDefinitionIds: string[]
): Promise<void> {
    const candidateItemIds = [...new Set(budgetItemDefinitionIds)];

    if (candidateItemIds.length > 0) {
        const referencedItems = await db
            .select({ id: monthlyBudgetItems.budgetItemId })
            .from(monthlyBudgetItems)
            .where(inArray(monthlyBudgetItems.budgetItemId, candidateItemIds));
        const referencedItemIds = new Set(
            referencedItems.map((item) => item.id)
        );
        const unusedItemIds = candidateItemIds.filter(
            (itemId) => !referencedItemIds.has(itemId)
        );

        if (unusedItemIds.length > 0)
            await db
                .delete(budgetItems)
                .where(inArray(budgetItems.id, unusedItemIds));
    }

    const candidateCategoryIds = [...new Set(categoryDefinitionIds)];

    if (candidateCategoryIds.length === 0) return;
    const [referencedCategories, remainingItems] = await Promise.all([
        db
            .select({ id: monthlyBudgetCategories.categoryId })
            .from(monthlyBudgetCategories)
            .where(
                inArray(
                    monthlyBudgetCategories.categoryId,
                    candidateCategoryIds
                )
            ),
        db
            .select({ id: budgetItems.categoryId })
            .from(budgetItems)
            .where(inArray(budgetItems.categoryId, candidateCategoryIds))
    ]);
    const retainedCategoryIds = new Set([
        ...referencedCategories.map((category) => category.id),
        ...remainingItems.map((item) => item.id)
    ]);
    const unusedCategoryIds = candidateCategoryIds.filter(
        (categoryId) => !retainedCategoryIds.has(categoryId)
    );

    if (unusedCategoryIds.length > 0)
        await db
            .delete(categories)
            .where(
                and(
                    eq(categories.householdId, householdId),
                    inArray(categories.id, unusedCategoryIds)
                )
            );
}

async function recordMutationReceipt(
    db: AppDb,
    householdId: string,
    input: BudgetMutation
): Promise<void> {
    await db.insert(mutationReceipts).values({
        householdId,
        clientMutationId: input.clientMutationId,
        operation: input.type,
        month: monthDate(input.monthKey),
        result: { ok: true }
    });
}

export async function applyBudgetMutation(
    input: BudgetMutation,
    householdId: string
): Promise<MutationResult> {
    const db = await getDatabase();
    const duplicate = await db
        .select({ id: mutationReceipts.id })
        .from(mutationReceipts)
        .where(
            and(
                eq(mutationReceipts.householdId, householdId),
                eq(mutationReceipts.clientMutationId, input.clientMutationId)
            )
        )
        .limit(1);

    if (duplicate[0])
        return {
            ok: true,
            snapshot: await getMonthSnapshot(input.monthKey, householdId),
            clientMutationId: input.clientMutationId
        };

    try {
        await db.transaction(async (tx) => {
            const noOpWhenMonthIsMissing =
                input.type === 'clearPlannedAmounts' ||
                input.type === 'resetBudget' ||
                (input.type === 'updateMonthNote' && input.note.length === 0);

            if (noOpWhenMonthIsMissing) {
                const existingMonth = await tx
                    .select({ id: budgetMonths.id })
                    .from(budgetMonths)
                    .where(
                        and(
                            eq(budgetMonths.householdId, householdId),
                            eq(budgetMonths.month, monthDate(input.monthKey))
                        )
                    )
                    .limit(1);

                if (!existingMonth[0]) {
                    await recordMutationReceipt(
                        tx as AppDb,
                        householdId,
                        input
                    );

                    return;
                }
            }
            const monthId = await ensureMonth(
                tx as AppDb,
                householdId,
                input.monthKey
            );

            if (
                input.type === 'addTransaction' &&
                !input.occurredOn.startsWith(`${input.monthKey}-`)
            )
                throw new MutationFailure(
                    'validation',
                    'Add the transaction from its destination month.'
                );
            if (
                'receivedOn' in input &&
                !input.receivedOn.startsWith(`${input.monthKey}-`)
            )
                throw new MutationFailure(
                    'validation',
                    'Income must be recorded in the selected month.'
                );
            switch (input.type) {
                case 'updatePlan': {
                    const updated = await tx
                        .update(monthlyBudgetItems)
                        .set({
                            plannedCents: BigInt(input.plannedCents),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(monthlyBudgetItems.id, input.monthlyItemId),
                                eq(monthlyBudgetItems.monthId, monthId),
                                eq(
                                    monthlyBudgetItems.version,
                                    input.expectedVersion
                                )
                            )
                        )
                        .returning({ id: monthlyBudgetItems.id });

                    if (!updated[0])
                        await throwMonthlyItemMutationFailure(
                            tx as AppDb,
                            monthId,
                            input.monthlyItemId
                        );
                    break;
                }
                case 'toggleCarryover': {
                    const updated = await tx
                        .update(monthlyBudgetItems)
                        .set({
                            carryoverEnabled: input.enabled,
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(monthlyBudgetItems.id, input.monthlyItemId),
                                eq(monthlyBudgetItems.monthId, monthId),
                                eq(
                                    monthlyBudgetItems.version,
                                    input.expectedVersion
                                )
                            )
                        )
                        .returning({ id: monthlyBudgetItems.id });

                    if (!updated[0])
                        await throwMonthlyItemMutationFailure(
                            tx as AppDb,
                            monthId,
                            input.monthlyItemId
                        );
                    break;
                }
                case 'addTransaction': {
                    const total = BigInt(input.totalCents);

                    if (!splitsMatchTotal(input.totalCents, input.splits))
                        throw new MutationFailure(
                            'split_mismatch',
                            'Split amounts must equal the transaction total.'
                        );
                    const allowed = await tx
                        .select({ id: monthlyBudgetItems.id })
                        .from(monthlyBudgetItems)
                        .where(eq(monthlyBudgetItems.monthId, monthId));
                    const allowedIds = new Set(allowed.map((row) => row.id));

                    if (
                        input.splits.some(
                            (split) => !allowedIds.has(split.monthlyItemId)
                        )
                    )
                        throw new MutationFailure(
                            'validation',
                            'Choose budget items from this month.'
                        );
                    const id = crypto.randomUUID();

                    await tx.insert(transactions).values({
                        id,
                        monthId,
                        kind: input.kind,
                        merchant: input.merchant,
                        occurredOn: input.occurredOn,
                        totalCents: total,
                        note: input.note
                    });
                    await tx.insert(transactionSplits).values(
                        input.splits.map((split) => ({
                            transactionId: id,
                            monthlyItemId: split.monthlyItemId,
                            amountCents: BigInt(split.amountCents)
                        }))
                    );
                    break;
                }
                case 'updateTransaction': {
                    const total = BigInt(input.totalCents);

                    if (!splitsMatchTotal(input.totalCents, input.splits))
                        throw new MutationFailure(
                            'split_mismatch',
                            'Split amounts must equal the transaction total.'
                        );
                    const sourcePlans = await tx
                        .select({
                            id: monthlyBudgetItems.id,
                            budgetItemId: monthlyBudgetItems.budgetItemId
                        })
                        .from(monthlyBudgetItems)
                        .where(
                            and(
                                eq(monthlyBudgetItems.monthId, monthId),
                                inArray(
                                    monthlyBudgetItems.id,
                                    input.splits.map(
                                        (split) => split.monthlyItemId
                                    )
                                )
                            )
                        );

                    if (sourcePlans.length !== input.splits.length)
                        throw new MutationFailure(
                            'validation',
                            'Choose budget items from this month.'
                        );
                    const destinationKey = input.occurredOn.slice(
                        0,
                        7
                    ) as MonthKey;
                    const destinationMonthId =
                        destinationKey === input.monthKey
                            ? monthId
                            : await ensureMonth(
                                  tx as AppDb,
                                  householdId,
                                  destinationKey
                              );
                    let normalizedSplits = input.splits;

                    if (destinationMonthId !== monthId) {
                        const destinationPlans = await tx
                            .select({
                                id: monthlyBudgetItems.id,
                                budgetItemId: monthlyBudgetItems.budgetItemId
                            })
                            .from(monthlyBudgetItems)
                            .where(
                                and(
                                    eq(
                                        monthlyBudgetItems.monthId,
                                        destinationMonthId
                                    ),
                                    inArray(
                                        monthlyBudgetItems.budgetItemId,
                                        sourcePlans.map(
                                            (plan) => plan.budgetItemId
                                        )
                                    )
                                )
                            );
                        const destinationByDefinition = new Map(
                            destinationPlans.map((plan) => [
                                plan.budgetItemId,
                                plan.id
                            ])
                        );
                        const sourceByMonthlyId = new Map(
                            sourcePlans.map((plan) => [
                                plan.id,
                                plan.budgetItemId
                            ])
                        );

                        normalizedSplits = input.splits.map((split) => ({
                            ...split,
                            monthlyItemId:
                                destinationByDefinition.get(
                                    sourceByMonthlyId.get(
                                        split.monthlyItemId
                                    ) ?? ''
                                ) ?? ''
                        }));
                        if (
                            normalizedSplits.some(
                                (split) => !split.monthlyItemId
                            )
                        )
                            throw new MutationFailure(
                                'validation',
                                'The destination month needs matching budget items before this transaction can move.'
                            );
                    }
                    const updated = await tx
                        .update(transactions)
                        .set({
                            monthId: destinationMonthId,
                            kind: input.kind,
                            merchant: input.merchant,
                            occurredOn: input.occurredOn,
                            totalCents: total,
                            note: input.note,
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(transactions.id, input.transactionId),
                                eq(transactions.monthId, monthId),
                                eq(transactions.version, input.expectedVersion),
                                isNull(transactions.deletedAt)
                            )
                        )
                        .returning({ id: transactions.id });

                    if (!updated[0])
                        await throwTransactionMutationFailure(
                            tx as AppDb,
                            monthId,
                            input.transactionId
                        );
                    await tx
                        .delete(transactionSplits)
                        .where(
                            eq(
                                transactionSplits.transactionId,
                                input.transactionId
                            )
                        );
                    await tx.insert(transactionSplits).values(
                        normalizedSplits.map((split) => ({
                            transactionId: input.transactionId,
                            monthlyItemId: split.monthlyItemId,
                            amountCents: BigInt(split.amountCents)
                        }))
                    );
                    break;
                }
                case 'deleteTransaction': {
                    const updated = await tx
                        .update(transactions)
                        .set({
                            deletedAt: new Date(),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(transactions.id, input.transactionId),
                                eq(transactions.monthId, monthId),
                                eq(transactions.version, input.expectedVersion),
                                isNull(transactions.deletedAt)
                            )
                        )
                        .returning({ id: transactions.id });

                    if (!updated[0])
                        await throwTransactionMutationFailure(
                            tx as AppDb,
                            monthId,
                            input.transactionId
                        );
                    break;
                }
                case 'undoDeleteTransaction': {
                    const updated = await tx
                        .update(transactions)
                        .set({
                            deletedAt: null,
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(transactions.id, input.transactionId),
                                eq(transactions.monthId, monthId),
                                eq(transactions.version, input.expectedVersion),
                                isNotNull(transactions.deletedAt)
                            )
                        )
                        .returning({ id: transactions.id });

                    if (!updated[0])
                        await throwTransactionMutationFailure(
                            tx as AppDb,
                            monthId,
                            input.transactionId
                        );
                    break;
                }
                case 'addIncomePlan': {
                    const existing = await tx
                        .select({ sortOrder: incomePlans.sortOrder })
                        .from(incomePlans)
                        .where(eq(incomePlans.monthId, monthId));
                    const nextOrder =
                        Math.max(0, ...existing.map((row) => row.sortOrder)) +
                        10;

                    await tx.insert(incomePlans).values({
                        monthId,
                        name: input.name,
                        icon: input.icon,
                        tone: input.tone,
                        expectedCents: BigInt(input.expectedCents),
                        sortOrder: nextOrder
                    });
                    break;
                }
                case 'updateIncomePlan': {
                    const updated = await tx
                        .update(incomePlans)
                        .set({
                            name: input.name,
                            icon: input.icon,
                            tone: input.tone,
                            expectedCents: BigInt(input.expectedCents),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(incomePlans.id, input.incomePlanId),
                                eq(incomePlans.monthId, monthId),
                                eq(incomePlans.version, input.expectedVersion)
                            )
                        )
                        .returning({ id: incomePlans.id });

                    if (updated[0]) break;
                    const existing = await tx
                        .select({ id: incomePlans.id })
                        .from(incomePlans)
                        .where(
                            and(
                                eq(incomePlans.id, input.incomePlanId),
                                eq(incomePlans.monthId, monthId)
                            )
                        )
                        .limit(1);

                    if (!existing[0])
                        throw new MutationFailure(
                            'not_found',
                            'That income source no longer exists.'
                        );

                    throw new MutationFailure(
                        'conflict',
                        'This income source changed on another device. The latest version has been loaded.'
                    );
                }
                case 'addIncomeReceipt': {
                    const plan = await tx
                        .select({ id: incomePlans.id })
                        .from(incomePlans)
                        .where(
                            and(
                                eq(incomePlans.id, input.incomePlanId),
                                eq(incomePlans.monthId, monthId)
                            )
                        )
                        .limit(1);

                    if (!plan[0])
                        throw new MutationFailure(
                            'validation',
                            'Choose an income source from this month.'
                        );
                    await tx.insert(incomeReceipts).values({
                        incomePlanId: input.incomePlanId,
                        receivedOn: input.receivedOn,
                        amountCents: BigInt(input.amountCents),
                        note: input.note
                    });
                    break;
                }
                case 'deleteIncomeReceipt': {
                    const receipt = await tx
                        .select({ version: incomeReceipts.version })
                        .from(incomeReceipts)
                        .innerJoin(
                            incomePlans,
                            eq(incomeReceipts.incomePlanId, incomePlans.id)
                        )
                        .where(
                            and(
                                eq(incomeReceipts.id, input.incomeReceiptId),
                                eq(incomePlans.monthId, monthId),
                                isNull(incomeReceipts.deletedAt)
                            )
                        )
                        .limit(1);

                    if (!receipt[0])
                        throw new MutationFailure(
                            'not_found',
                            'That received-income transaction no longer exists.'
                        );
                    if (receipt[0].version !== input.expectedVersion)
                        throw new MutationFailure(
                            'conflict',
                            'This income transaction changed on another device. The latest version has been loaded.'
                        );
                    await tx
                        .update(incomeReceipts)
                        .set({
                            deletedAt: new Date(),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(eq(incomeReceipts.id, input.incomeReceiptId));
                    break;
                }
                case 'deleteIncomePlan': {
                    const plan = await tx
                        .select({ version: incomePlans.version })
                        .from(incomePlans)
                        .where(
                            and(
                                eq(incomePlans.id, input.incomePlanId),
                                eq(incomePlans.monthId, monthId)
                            )
                        )
                        .limit(1);

                    if (!plan[0])
                        throw new MutationFailure(
                            'not_found',
                            'That income source no longer exists.'
                        );
                    if (plan[0].version !== input.expectedVersion)
                        throw new MutationFailure(
                            'conflict',
                            'This income source changed on another device. The latest version has been loaded.'
                        );
                    const activeReceipt = await tx
                        .select({ id: incomeReceipts.id })
                        .from(incomeReceipts)
                        .where(
                            and(
                                eq(
                                    incomeReceipts.incomePlanId,
                                    input.incomePlanId
                                ),
                                isNull(incomeReceipts.deletedAt)
                            )
                        )
                        .limit(1);

                    if (activeReceipt[0])
                        throw new MutationFailure(
                            'validation',
                            'Delete this source’s received-income transactions first.'
                        );
                    await tx
                        .delete(incomeReceipts)
                        .where(
                            eq(incomeReceipts.incomePlanId, input.incomePlanId)
                        );
                    await tx
                        .delete(incomePlans)
                        .where(
                            and(
                                eq(incomePlans.id, input.incomePlanId),
                                eq(incomePlans.monthId, monthId)
                            )
                        );
                    break;
                }
                case 'addCategory': {
                    const existing = await tx
                        .select({ sortOrder: categories.sortOrder })
                        .from(categories)
                        .where(eq(categories.householdId, householdId));
                    const tones = [
                        'yellow',
                        'coral',
                        'blue',
                        'mint',
                        'lilac'
                    ] as const;
                    const [category] = await tx
                        .insert(categories)
                        .values({
                            householdId,
                            name: input.name,
                            icon: input.icon ?? 'sparkles',
                            tone:
                                input.tone ??
                                tones[existing.length % tones.length]!,
                            sortOrder:
                                Math.max(
                                    0,
                                    ...existing.map((row) => row.sortOrder)
                                ) + 10
                        })
                        .returning({ id: categories.id });

                    if (!category)
                        throw new MutationFailure(
                            'not_found',
                            'Budget category could not be created.'
                        );
                    await tx.insert(monthlyBudgetCategories).values({
                        monthId,
                        categoryId: category.id
                    });
                    break;
                }
                case 'addItem': {
                    const category = await tx
                        .select({ id: categories.id })
                        .from(categories)
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId)
                            )
                        )
                        .limit(1);

                    if (!category[0])
                        throw new MutationFailure(
                            'not_found',
                            'Category not found.'
                        );
                    await tx
                        .insert(monthlyBudgetCategories)
                        .values({
                            monthId,
                            categoryId: input.categoryId
                        })
                        .onConflictDoNothing();
                    const existing = await tx
                        .select({ sortOrder: budgetItems.sortOrder })
                        .from(budgetItems)
                        .where(eq(budgetItems.categoryId, input.categoryId));
                    const [item] = await tx
                        .insert(budgetItems)
                        .values({
                            categoryId: input.categoryId,
                            name: input.name,
                            sortOrder:
                                Math.max(
                                    0,
                                    ...existing.map((row) => row.sortOrder)
                                ) + 10
                        })
                        .returning({ id: budgetItems.id });

                    if (!item)
                        throw new MutationFailure(
                            'not_found',
                            'Budget item could not be created.'
                        );
                    await tx.insert(monthlyBudgetItems).values({
                        monthId,
                        budgetItemId: item.id,
                        plannedCents: BigInt(input.plannedCents)
                    });
                    break;
                }
                case 'renameCategory': {
                    const updated = await tx
                        .update(categories)
                        .set({
                            name: input.name,
                            ...(input.icon ? { icon: input.icon } : {}),
                            ...(input.tone ? { tone: input.tone } : {}),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId),
                                eq(categories.version, input.expectedVersion)
                            )
                        )
                        .returning({ id: categories.id });

                    if (!updated[0])
                        await throwCategoryMutationFailure(
                            tx as AppDb,
                            householdId,
                            input.categoryId
                        );
                    break;
                }
                case 'renameItem': {
                    const updated = await tx
                        .update(budgetItems)
                        .set({
                            name: input.name,
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(budgetItems.id, input.itemId),
                                eq(budgetItems.version, input.expectedVersion),
                                inArray(
                                    budgetItems.categoryId,
                                    tx
                                        .select({ id: categories.id })
                                        .from(categories)
                                        .where(
                                            eq(
                                                categories.householdId,
                                                householdId
                                            )
                                        )
                                )
                            )
                        )
                        .returning({ id: budgetItems.id });

                    if (!updated[0])
                        await throwItemDefinitionMutationFailure(
                            tx as AppDb,
                            householdId,
                            input.itemId
                        );
                    break;
                }
                case 'archiveCategory': {
                    const updated = await tx
                        .update(categories)
                        .set({
                            archivedAt: new Date(),
                            archivedFromMonth: monthDate(input.monthKey),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId),
                                eq(categories.version, input.expectedVersion)
                            )
                        )
                        .returning({ id: categories.id });

                    if (!updated[0])
                        await throwCategoryMutationFailure(
                            tx as AppDb,
                            householdId,
                            input.categoryId
                        );
                    break;
                }
                case 'archiveItem': {
                    const updated = await tx
                        .update(budgetItems)
                        .set({
                            archivedAt: new Date(),
                            archivedFromMonth: monthDate(input.monthKey),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(budgetItems.id, input.itemId),
                                eq(budgetItems.version, input.expectedVersion),
                                inArray(
                                    budgetItems.categoryId,
                                    tx
                                        .select({ id: categories.id })
                                        .from(categories)
                                        .where(
                                            eq(
                                                categories.householdId,
                                                householdId
                                            )
                                        )
                                )
                            )
                        )
                        .returning({ id: budgetItems.id });

                    if (!updated[0])
                        await throwItemDefinitionMutationFailure(
                            tx as AppDb,
                            householdId,
                            input.itemId
                        );
                    break;
                }
                case 'deleteCategory': {
                    const owned = await tx
                        .select({ id: categories.id })
                        .from(categories)
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId)
                            )
                        )
                        .limit(1);

                    if (!owned[0])
                        throw new MutationFailure(
                            'not_found',
                            'That category is not here.'
                        );
                    const definitions = await tx
                        .select({ id: budgetItems.id })
                        .from(budgetItems)
                        .where(eq(budgetItems.categoryId, input.categoryId));
                    const used = definitions.length
                        ? await tx
                              .select({ id: monthlyBudgetItems.id })
                              .from(monthlyBudgetItems)
                              .where(
                                  inArray(
                                      monthlyBudgetItems.budgetItemId,
                                      definitions.map(
                                          (definition) => definition.id
                                      )
                                  )
                              )
                              .limit(1)
                        : [];

                    if (used[0])
                        throw new MutationFailure(
                            'validation',
                            'This category has budget history and can only be archived.'
                        );
                    await tx
                        .delete(budgetItems)
                        .where(eq(budgetItems.categoryId, input.categoryId));
                    const deleted = await tx
                        .delete(categories)
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId),
                                eq(categories.version, input.expectedVersion)
                            )
                        )
                        .returning({ id: categories.id });

                    if (!deleted[0])
                        await throwCategoryMutationFailure(
                            tx as AppDb,
                            householdId,
                            input.categoryId
                        );
                    break;
                }
                case 'deleteItem': {
                    const owned = await tx
                        .select({ id: budgetItems.id })
                        .from(budgetItems)
                        .innerJoin(
                            categories,
                            eq(budgetItems.categoryId, categories.id)
                        )
                        .where(
                            and(
                                eq(budgetItems.id, input.itemId),
                                eq(categories.householdId, householdId)
                            )
                        )
                        .limit(1);

                    if (!owned[0])
                        throw new MutationFailure(
                            'not_found',
                            'That budget item is not here.'
                        );
                    const used = await tx
                        .select({ id: monthlyBudgetItems.id })
                        .from(monthlyBudgetItems)
                        .where(
                            eq(monthlyBudgetItems.budgetItemId, input.itemId)
                        )
                        .limit(1);

                    if (used[0])
                        throw new MutationFailure(
                            'validation',
                            'This item has budget history and can only be archived.'
                        );
                    const deleted = await tx
                        .delete(budgetItems)
                        .where(
                            and(
                                eq(budgetItems.id, input.itemId),
                                eq(budgetItems.version, input.expectedVersion)
                            )
                        )
                        .returning({ id: budgetItems.id });

                    if (!deleted[0])
                        await throwItemDefinitionMutationFailure(
                            tx as AppDb,
                            householdId,
                            input.itemId
                        );
                    break;
                }
                case 'reorderCategories': {
                    const existing = await tx
                        .select({ id: categories.id })
                        .from(monthlyBudgetCategories)
                        .innerJoin(
                            categories,
                            eq(
                                monthlyBudgetCategories.categoryId,
                                categories.id
                            )
                        )
                        .where(
                            and(
                                eq(monthlyBudgetCategories.monthId, monthId),
                                eq(categories.householdId, householdId),
                                isNull(categories.archivedAt)
                            )
                        );

                    if (
                        existing.length !== input.categoryIds.length ||
                        input.categoryIds.some(
                            (id) => !existing.some((row) => row.id === id)
                        )
                    )
                        throw new MutationFailure(
                            'conflict',
                            'Budget organization changed. Refresh and try again.'
                        );
                    for (const [index, id] of input.categoryIds.entries())
                        await tx
                            .update(categories)
                            .set({
                                sortOrder: (index + 1) * 10,
                                updatedAt: new Date()
                            })
                            .where(eq(categories.id, id));
                    break;
                }
                case 'reorderItems': {
                    const existing = await tx
                        .select({ id: budgetItems.id })
                        .from(monthlyBudgetItems)
                        .innerJoin(
                            budgetItems,
                            eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
                        )
                        .innerJoin(
                            categories,
                            eq(budgetItems.categoryId, categories.id)
                        )
                        .where(
                            and(
                                eq(monthlyBudgetItems.monthId, monthId),
                                eq(budgetItems.categoryId, input.categoryId),
                                eq(categories.householdId, householdId),
                                isNull(budgetItems.archivedAt)
                            )
                        );

                    if (
                        existing.length !== input.itemIds.length ||
                        input.itemIds.some(
                            (id) => !existing.some((row) => row.id === id)
                        )
                    )
                        throw new MutationFailure(
                            'conflict',
                            'Budget organization changed. Refresh and try again.'
                        );
                    for (const [index, id] of input.itemIds.entries())
                        await tx
                            .update(budgetItems)
                            .set({
                                sortOrder: (index + 1) * 10,
                                updatedAt: new Date()
                            })
                            .where(eq(budgetItems.id, id));
                    break;
                }
                case 'updateMonthNote':
                    await tx
                        .update(budgetMonths)
                        .set({
                            note: input.note || null,
                            version: sql`${budgetMonths.version} + 1`,
                            updatedAt: new Date()
                        })
                        .where(eq(budgetMonths.id, monthId));
                    break;
                case 'copyPreviousMonth': {
                    const [
                        targetCategories,
                        targetPlans,
                        targetTransactions,
                        targetIncome
                    ] = await Promise.all([
                        tx
                            .select({ id: monthlyBudgetCategories.id })
                            .from(monthlyBudgetCategories)
                            .innerJoin(
                                categories,
                                eq(
                                    monthlyBudgetCategories.categoryId,
                                    categories.id
                                )
                            )
                            .where(
                                and(
                                    eq(
                                        monthlyBudgetCategories.monthId,
                                        monthId
                                    ),
                                    eq(categories.householdId, householdId),
                                    isNull(categories.archivedAt)
                                )
                            )
                            .limit(1),
                        tx
                            .select({ id: monthlyBudgetItems.id })
                            .from(monthlyBudgetItems)
                            .innerJoin(
                                budgetItems,
                                eq(
                                    monthlyBudgetItems.budgetItemId,
                                    budgetItems.id
                                )
                            )
                            .innerJoin(
                                categories,
                                eq(budgetItems.categoryId, categories.id)
                            )
                            .where(
                                and(
                                    eq(monthlyBudgetItems.monthId, monthId),
                                    eq(categories.householdId, householdId),
                                    isNull(categories.archivedAt),
                                    isNull(budgetItems.archivedAt)
                                )
                            )
                            .limit(1),
                        tx
                            .select({ id: transactions.id })
                            .from(transactions)
                            .where(
                                and(
                                    eq(transactions.monthId, monthId),
                                    isNull(transactions.deletedAt)
                                )
                            )
                            .limit(1),
                        tx
                            .select({ id: incomePlans.id })
                            .from(incomePlans)
                            .where(eq(incomePlans.monthId, monthId))
                            .limit(1)
                    ]);

                    if (
                        targetCategories[0] ||
                        targetPlans[0] ||
                        targetTransactions[0] ||
                        targetIncome[0]
                    )
                        throw new MutationFailure(
                            'target_not_empty',
                            'Copy is available only before this month has structure, a plan, or activity.'
                        );
                    const previousKey = shiftMonth(input.monthKey, -1);
                    const missingSourceMessage = `${monthLabel(previousKey)} does not have a budget to copy yet.`;
                    const previous = await tx
                        .select({ id: budgetMonths.id })
                        .from(budgetMonths)
                        .where(
                            and(
                                eq(budgetMonths.householdId, householdId),
                                eq(budgetMonths.month, monthDate(previousKey))
                            )
                        )
                        .limit(1);
                    const previousMonth = previous[0];

                    if (!previousMonth)
                        throw new MutationFailure(
                            'not_found',
                            missingSourceMessage
                        );
                    const [sourceCategories, sourcePlans, sourceIncome] =
                        await Promise.all([
                            tx
                                .select({
                                    categoryId:
                                        monthlyBudgetCategories.categoryId
                                })
                                .from(monthlyBudgetCategories)
                                .innerJoin(
                                    categories,
                                    eq(
                                        monthlyBudgetCategories.categoryId,
                                        categories.id
                                    )
                                )
                                .where(
                                    and(
                                        eq(
                                            monthlyBudgetCategories.monthId,
                                            previousMonth.id
                                        ),
                                        eq(categories.householdId, householdId),
                                        isNull(categories.archivedAt)
                                    )
                                ),
                            tx
                                .select({
                                    budgetItemId:
                                        monthlyBudgetItems.budgetItemId,
                                    plannedCents:
                                        monthlyBudgetItems.plannedCents,
                                    carryoverEnabled:
                                        monthlyBudgetItems.carryoverEnabled
                                })
                                .from(monthlyBudgetItems)
                                .innerJoin(
                                    budgetItems,
                                    eq(
                                        monthlyBudgetItems.budgetItemId,
                                        budgetItems.id
                                    )
                                )
                                .innerJoin(
                                    categories,
                                    eq(budgetItems.categoryId, categories.id)
                                )
                                .where(
                                    and(
                                        eq(
                                            monthlyBudgetItems.monthId,
                                            previousMonth.id
                                        ),
                                        eq(categories.householdId, householdId),
                                        isNull(categories.archivedAt),
                                        isNull(budgetItems.archivedAt)
                                    )
                                ),
                            tx
                                .select()
                                .from(incomePlans)
                                .where(
                                    eq(incomePlans.monthId, previousMonth.id)
                                )
                        ]);

                    if (
                        sourceCategories.length === 0 &&
                        sourcePlans.length === 0 &&
                        sourceIncome.length === 0
                    )
                        throw new MutationFailure(
                            'not_found',
                            missingSourceMessage
                        );

                    if (sourceCategories.length > 0)
                        await tx.insert(monthlyBudgetCategories).values(
                            sourceCategories.map((category) => ({
                                monthId,
                                categoryId: category.categoryId
                            }))
                        );
                    if (sourcePlans.length > 0)
                        await tx.insert(monthlyBudgetItems).values(
                            sourcePlans.map((plan) => ({
                                monthId,
                                budgetItemId: plan.budgetItemId,
                                plannedCents: plan.plannedCents,
                                carryoverEnabled: plan.carryoverEnabled
                            }))
                        );
                    if (sourceIncome.length > 0)
                        await tx.insert(incomePlans).values(
                            sourceIncome.map((plan) => ({
                                monthId,
                                name: plan.name,
                                icon: plan.icon,
                                tone: plan.tone,
                                expectedCents: plan.expectedCents,
                                sortOrder: plan.sortOrder
                            }))
                        );
                    break;
                }
                case 'clearPlannedAmounts':
                    await tx
                        .update(monthlyBudgetItems)
                        .set({
                            plannedCents: 0n,
                            version: sql`${monthlyBudgetItems.version} + 1`,
                            updatedAt: new Date()
                        })
                        .where(eq(monthlyBudgetItems.monthId, monthId));
                    break;
                case 'resetBudget': {
                    const [
                        monthIncomePlans,
                        monthItemDefinitions,
                        monthCategoryDefinitions
                    ] = await Promise.all([
                        tx
                            .select({ id: incomePlans.id })
                            .from(incomePlans)
                            .where(eq(incomePlans.monthId, monthId)),
                        tx
                            .select({
                                id: budgetItems.id,
                                categoryId: budgetItems.categoryId
                            })
                            .from(monthlyBudgetItems)
                            .innerJoin(
                                budgetItems,
                                eq(
                                    monthlyBudgetItems.budgetItemId,
                                    budgetItems.id
                                )
                            )
                            .innerJoin(
                                categories,
                                eq(budgetItems.categoryId, categories.id)
                            )
                            .where(
                                and(
                                    eq(monthlyBudgetItems.monthId, monthId),
                                    eq(categories.householdId, householdId)
                                )
                            ),
                        tx
                            .select({ id: categories.id })
                            .from(monthlyBudgetCategories)
                            .innerJoin(
                                categories,
                                eq(
                                    monthlyBudgetCategories.categoryId,
                                    categories.id
                                )
                            )
                            .where(
                                and(
                                    eq(
                                        monthlyBudgetCategories.monthId,
                                        monthId
                                    ),
                                    eq(categories.householdId, householdId)
                                )
                            )
                    ]);

                    if (monthIncomePlans.length > 0)
                        await tx.delete(incomeReceipts).where(
                            inArray(
                                incomeReceipts.incomePlanId,
                                monthIncomePlans.map((plan) => plan.id)
                            )
                        );
                    await tx
                        .delete(transactions)
                        .where(eq(transactions.monthId, monthId));
                    await tx
                        .delete(incomePlans)
                        .where(eq(incomePlans.monthId, monthId));
                    await tx
                        .delete(monthlyBudgetItems)
                        .where(eq(monthlyBudgetItems.monthId, monthId));
                    await tx
                        .delete(monthlyBudgetCategories)
                        .where(eq(monthlyBudgetCategories.monthId, monthId));
                    await deleteUnusedResetDefinitions(
                        tx as AppDb,
                        householdId,
                        monthItemDefinitions.map((item) => item.id),
                        [
                            ...monthCategoryDefinitions.map(
                                (category) => category.id
                            ),
                            ...monthItemDefinitions.map(
                                (item) => item.categoryId
                            )
                        ]
                    );
                    await tx
                        .delete(budgetMonths)
                        .where(eq(budgetMonths.id, monthId));
                    break;
                }
            }
            await recordMutationReceipt(tx as AppDb, householdId, input);
        });

        return {
            ok: true,
            snapshot: await getMonthSnapshot(input.monthKey, householdId),
            clientMutationId: input.clientMutationId
        };
    } catch (error) {
        const committed = await db
            .select({ id: mutationReceipts.id })
            .from(mutationReceipts)
            .where(
                and(
                    eq(mutationReceipts.householdId, householdId),
                    eq(
                        mutationReceipts.clientMutationId,
                        input.clientMutationId
                    )
                )
            )
            .limit(1);

        if (committed[0])
            return {
                ok: true,
                snapshot: await getMonthSnapshot(input.monthKey, householdId),
                clientMutationId: input.clientMutationId
            };
        const snapshot = await getMonthSnapshot(input.monthKey, householdId);

        if (error instanceof MutationFailure)
            return {
                ok: false,
                code: error.code,
                message: error.message,
                snapshot
            };
        console.error(error);

        return {
            ok: false,
            code: 'validation',
            message:
                'That change could not be saved. Your latest data has been restored.',
            snapshot
        };
    }
}

export async function getMutationStatus(
    clientMutationId: string,
    monthKey: MonthKey,
    householdId: string
) {
    const db = await getDatabase();
    const receipt = await db
        .select({ id: mutationReceipts.id })
        .from(mutationReceipts)
        .where(
            and(
                eq(mutationReceipts.householdId, householdId),
                eq(mutationReceipts.clientMutationId, clientMutationId)
            )
        )
        .limit(1);

    return receipt[0]
        ? {
              committed: true,
              snapshot: await getMonthSnapshot(monthKey, householdId)
          }
        : { committed: false as const };
}
