import 'server-only';
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
    cents,
    monthLabel,
    shiftMonth,
    type Cents,
    type MonthKey
} from '@/domain/money';
import {
    availableBalance,
    leftToBudget,
    splitsMatchTotal
} from '@/domain/budget-calculations';
import type {
    ActivityEntry,
    BudgetCategoryView,
    BudgetItemView,
    IncomeReceiptView,
    MonthSnapshot,
    MutationErrorCode,
    MutationResult
} from '@/domain/types';
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

const monthDate = (monthKey: MonthKey | string) => `${monthKey}-01`;

class MutationFailure extends Error {
    constructor(
        readonly code: MutationErrorCode,
        message: string
    ) {
        super(message);
    }
}

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

export async function getMonthSnapshot(
    monthKey: MonthKey,
    householdId: string
): Promise<MonthSnapshot> {
    const db = await getDatabase();
    const targetMonthId = await ensureMonth(db, householdId, monthKey);
    const targetDate = monthDate(monthKey);
    const previousDate = monthDate(shiftMonth(monthKey, -1));
    const [
        monthRows,
        activeCategoryRows,
        planRows,
        splitRows,
        currentIncomeRows,
        currentReceiptRows,
        currentTransactionRows,
        previousCategoryRows,
        previousPlanRows,
        previousIncomeRows
    ] = await Promise.all([
        db
            .select()
            .from(budgetMonths)
            .where(eq(budgetMonths.id, targetMonthId))
            .limit(1),
        db
            .select({
                id: categories.id,
                name: categories.name,
                icon: categories.icon,
                tone: categories.tone,
                version: categories.version
            })
            .from(monthlyBudgetCategories)
            .innerJoin(
                categories,
                eq(monthlyBudgetCategories.categoryId, categories.id)
            )
            .where(
                and(
                    eq(monthlyBudgetCategories.monthId, targetMonthId),
                    eq(categories.householdId, householdId),
                    isNull(categories.archivedAt)
                )
            )
            .orderBy(asc(categories.sortOrder)),
        db
            .select({
                monthlyId: monthlyBudgetItems.id,
                monthlyVersion: monthlyBudgetItems.version,
                month: budgetMonths.month,
                plannedCents: monthlyBudgetItems.plannedCents,
                carryoverEnabled: monthlyBudgetItems.carryoverEnabled,
                itemId: budgetItems.id,
                itemName: budgetItems.name,
                itemOrder: budgetItems.sortOrder,
                categoryId: categories.id,
                categoryName: categories.name,
                categoryIcon: categories.icon,
                categoryTone: categories.tone,
                categoryOrder: categories.sortOrder,
                categoryVersion: categories.version
            })
            .from(monthlyBudgetItems)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetItems.monthId, budgetMonths.id)
            )
            .innerJoin(
                budgetItems,
                eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
            )
            .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    lte(budgetMonths.month, targetDate),
                    isNull(categories.archivedAt),
                    isNull(budgetItems.archivedAt)
                )
            )
            .orderBy(
                asc(budgetMonths.month),
                asc(categories.sortOrder),
                asc(budgetItems.sortOrder)
            ),
        db
            .select({
                monthlyItemId: transactionSplits.monthlyItemId,
                transactionId: transactions.id,
                transactionVersion: transactions.version,
                month: budgetMonths.month,
                kind: transactions.kind,
                merchant: transactions.merchant,
                occurredOn: transactions.occurredOn,
                amountCents: transactionSplits.amountCents
            })
            .from(transactionSplits)
            .innerJoin(
                transactions,
                eq(transactionSplits.transactionId, transactions.id)
            )
            .innerJoin(budgetMonths, eq(transactions.monthId, budgetMonths.id))
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    lte(budgetMonths.month, targetDate),
                    isNull(transactions.deletedAt)
                )
            ),
        db
            .select()
            .from(incomePlans)
            .where(eq(incomePlans.monthId, targetMonthId))
            .orderBy(asc(incomePlans.sortOrder)),
        db
            .select({
                id: incomeReceipts.id,
                planId: incomePlans.id,
                planName: incomePlans.name,
                planTone: incomePlans.tone,
                receivedOn: incomeReceipts.receivedOn,
                amountCents: incomeReceipts.amountCents,
                note: incomeReceipts.note,
                version: incomeReceipts.version
            })
            .from(incomeReceipts)
            .innerJoin(
                incomePlans,
                eq(incomeReceipts.incomePlanId, incomePlans.id)
            )
            .where(
                and(
                    eq(incomePlans.monthId, targetMonthId),
                    isNull(incomeReceipts.deletedAt)
                )
            )
            .orderBy(
                desc(incomeReceipts.receivedOn),
                desc(incomeReceipts.createdAt)
            ),
        db
            .select({
                id: transactions.id,
                kind: transactions.kind,
                merchant: transactions.merchant,
                occurredOn: transactions.occurredOn,
                totalCents: transactions.totalCents,
                note: transactions.note,
                version: transactions.version
            })
            .from(transactions)
            .where(
                and(
                    eq(transactions.monthId, targetMonthId),
                    isNull(transactions.deletedAt)
                )
            )
            .orderBy(
                desc(transactions.occurredOn),
                desc(transactions.createdAt)
            ),
        db
            .select({ id: monthlyBudgetCategories.id })
            .from(monthlyBudgetCategories)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetCategories.monthId, budgetMonths.id)
            )
            .innerJoin(
                categories,
                eq(monthlyBudgetCategories.categoryId, categories.id)
            )
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    eq(budgetMonths.month, previousDate),
                    isNull(categories.archivedAt)
                )
            )
            .limit(1),
        db
            .select({ id: monthlyBudgetItems.id })
            .from(monthlyBudgetItems)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetItems.monthId, budgetMonths.id)
            )
            .innerJoin(
                budgetItems,
                eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
            )
            .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    eq(budgetMonths.month, previousDate),
                    isNull(categories.archivedAt),
                    isNull(budgetItems.archivedAt)
                )
            )
            .limit(1),
        db
            .select({ id: incomePlans.id })
            .from(incomePlans)
            .innerJoin(budgetMonths, eq(incomePlans.monthId, budgetMonths.id))
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    eq(budgetMonths.month, previousDate)
                )
            )
            .limit(1)
    ]);
    const currentMonth = monthRows[0];

    if (!currentMonth) throw new Error('Month is unavailable');

    const spendByMonthlyItem = new Map<string, bigint>();

    for (const row of splitRows) {
        const direction = row.kind === 'refund' ? -1n : 1n;

        spendByMonthlyItem.set(
            row.monthlyItemId,
            (spendByMonthlyItem.get(row.monthlyItemId) ?? 0n) +
                row.amountCents * direction
        );
    }

    const balancesByDefinition = new Map<
        string,
        { month: string; available: bigint; carryoverEnabled: boolean }
    >();
    const calculated = new Map<
        string,
        { available: bigint; carryIn: bigint; spent: bigint }
    >();

    for (const row of planRows) {
        const previous = balancesByDefinition.get(row.itemId);
        const rowMonthKey = row.month.slice(0, 7) as MonthKey;
        const carryIn =
            previous?.carryoverEnabled &&
            previous?.month === shiftMonth(rowMonthKey, -1)
                ? previous.available
                : 0n;
        const spent = spendByMonthlyItem.get(row.monthlyId) ?? 0n;
        const available = BigInt(
            availableBalance({
                plannedCents: cents(row.plannedCents),
                netSpendingCents: cents(spent),
                carryInCents: cents(carryIn)
            })
        );

        balancesByDefinition.set(row.itemId, {
            month: rowMonthKey,
            available,
            carryoverEnabled: row.carryoverEnabled
        });
        calculated.set(row.monthlyId, { available, carryIn, spent });
    }

    const categoryMap = new Map<string, BudgetCategoryView>(
        activeCategoryRows.map((category) => [
            category.id,
            {
                id: category.id,
                name: category.name,
                icon: category.icon,
                tone: category.tone,
                availableCents: cents(0),
                items: [],
                version: category.version
            }
        ])
    );

    for (const row of planRows.filter((plan) => plan.month === targetDate)) {
        const values = calculated.get(row.monthlyId) ?? {
            available: 0n,
            carryIn: 0n,
            spent: 0n
        };
        const item: BudgetItemView = {
            id: row.monthlyId,
            definitionId: row.itemId,
            name: row.itemName,
            plannedCents: cents(row.plannedCents),
            spentCents: cents(values.spent),
            availableCents: cents(values.available),
            carryInCents: cents(values.carryIn),
            carryoverEnabled: row.carryoverEnabled,
            version: row.monthlyVersion
        };
        const existing = categoryMap.get(row.categoryId);

        if (existing) {
            existing.items.push(item);
            existing.availableCents = cents(
                BigInt(existing.availableCents) + values.available
            );
        } else {
            categoryMap.set(row.categoryId, {
                id: row.categoryId,
                name: row.categoryName,
                icon: row.categoryIcon,
                tone: row.categoryTone,
                availableCents: cents(values.available),
                items: [item],
                version: row.categoryVersion
            });
        }
    }

    const splitInfoByTransaction = new Map<
        string,
        {
            itemNames: string[];
            tone: ActivityEntry['tone'];
            allocations: Array<{ monthlyItemId: string; amountCents: Cents }>;
        }
    >();
    const planLookup = new Map(planRows.map((row) => [row.monthlyId, row]));

    for (const split of splitRows.filter((row) => row.month === targetDate)) {
        const plan = planLookup.get(split.monthlyItemId);

        if (!plan) continue;
        const existing = splitInfoByTransaction.get(split.transactionId) ?? {
            itemNames: [],
            tone: plan.categoryTone,
            allocations: []
        };

        existing.itemNames.push(plan.itemName);
        existing.allocations.push({
            monthlyItemId: split.monthlyItemId,
            amountCents: cents(split.amountCents)
        });
        splitInfoByTransaction.set(split.transactionId, existing);
    }

    const expenseActivity: ActivityEntry[] = currentTransactionRows.map(
        (transaction) => {
            const splitInfo = splitInfoByTransaction.get(transaction.id);
            const split = (splitInfo?.itemNames.length ?? 0) > 1;

            return {
                id: transaction.id,
                type: transaction.kind,
                title: transaction.merchant,
                subtitle: split
                    ? 'Split transaction'
                    : (splitInfo?.itemNames[0] ?? 'Budget item'),
                occurredOn: transaction.occurredOn,
                amountCents: cents(transaction.totalCents),
                tone: splitInfo?.tone ?? 'blue',
                split,
                version: transaction.version,
                note: transaction.note,
                allocations: splitInfo?.allocations ?? []
            };
        }
    );
    const incomeActivity: ActivityEntry[] = currentReceiptRows.map(
        (receipt) => ({
            id: receipt.id,
            type: 'income',
            title: receipt.planName,
            subtitle: 'Income',
            occurredOn: receipt.receivedOn,
            amountCents: cents(receipt.amountCents),
            tone: receipt.planTone,
            split: false,
            version: receipt.version,
            note: receipt.note
        })
    );
    const receiptTotalsByPlan = new Map<string, bigint>();
    const receiptsByPlan = new Map<string, IncomeReceiptView[]>();

    for (const receipt of currentReceiptRows) {
        receiptTotalsByPlan.set(
            receipt.planId,
            (receiptTotalsByPlan.get(receipt.planId) ?? 0n) +
                receipt.amountCents
        );
        const planReceipts = receiptsByPlan.get(receipt.planId) ?? [];

        planReceipts.push({
            id: receipt.id,
            receivedOn: receipt.receivedOn,
            amountCents: cents(receipt.amountCents),
            note: receipt.note,
            version: receipt.version
        });
        receiptsByPlan.set(receipt.planId, planReceipts);
    }
    const expectedIncome = currentIncomeRows.reduce(
        (total, plan) => total + plan.expectedCents,
        0n
    );
    const receivedIncome = currentReceiptRows.reduce(
        (total, receipt) => total + receipt.amountCents,
        0n
    );
    const currentPlans = planRows.filter((row) => row.month === targetDate);
    const planned = currentPlans.reduce(
        (total, plan) => total + plan.plannedCents,
        0n
    );
    const spent = currentPlans.reduce(
        (total, plan) => total + (calculated.get(plan.monthlyId)?.spent ?? 0n),
        0n
    );
    const activity = [...expenseActivity, ...incomeActivity].toSorted((a, b) =>
        b.occurredOn.localeCompare(a.occurredOn)
    );
    const targetHasCopyBlockingContent =
        activeCategoryRows.length > 0 ||
        currentPlans.length > 0 ||
        currentIncomeRows.length > 0 ||
        currentTransactionRows.length > 0;
    const previousMonthHasCopyableContent =
        previousCategoryRows.length > 0 ||
        previousPlanRows.length > 0 ||
        previousIncomeRows.length > 0;

    return {
        householdId,
        monthId: targetMonthId,
        monthKey,
        label: monthLabel(monthKey),
        canCopyPreviousMonth:
            !targetHasCopyBlockingContent && previousMonthHasCopyableContent,
        version: currentMonth.version,
        note: currentMonth.note,
        summary: {
            expectedIncomeCents: cents(expectedIncome),
            receivedIncomeCents: cents(receivedIncome),
            plannedCents: cents(planned),
            spentCents: cents(spent),
            leftToBudgetCents: leftToBudget(
                cents(expectedIncome),
                cents(planned)
            )
        },
        categories: [...categoryMap.values()],
        incomePlans: currentIncomeRows.map((plan) => ({
            id: plan.id,
            name: plan.name,
            icon: plan.icon,
            tone: plan.tone,
            expectedCents: cents(plan.expectedCents),
            receivedCents: cents(receiptTotalsByPlan.get(plan.id) ?? 0n),
            receipts: receiptsByPlan.get(plan.id) ?? [],
            version: plan.version
        })),
        activity
    };
}

async function assertVersion(
    db: AppDb,
    table: typeof monthlyBudgetItems | typeof transactions,
    id: string,
    expectedVersion: number
): Promise<void> {
    const rows = await db
        .select({ version: table.version })
        .from(table)
        .where(eq(table.id, id))
        .limit(1);

    if (!rows[0])
        throw new MutationFailure('not_found', 'That item no longer exists.');
    if (rows[0].version !== expectedVersion)
        throw new MutationFailure(
            'conflict',
            'This changed on another device. The latest version has been loaded.'
        );
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
                case 'updatePlan':
                    await assertVersion(
                        tx as AppDb,
                        monthlyBudgetItems,
                        input.monthlyItemId,
                        input.expectedVersion
                    );
                    await tx
                        .update(monthlyBudgetItems)
                        .set({
                            plannedCents: BigInt(input.plannedCents),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(eq(monthlyBudgetItems.id, input.monthlyItemId));
                    break;
                case 'toggleCarryover':
                    await assertVersion(
                        tx as AppDb,
                        monthlyBudgetItems,
                        input.monthlyItemId,
                        input.expectedVersion
                    );
                    await tx
                        .update(monthlyBudgetItems)
                        .set({
                            carryoverEnabled: input.enabled,
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(eq(monthlyBudgetItems.id, input.monthlyItemId));
                    break;
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
                    await assertVersion(
                        tx as AppDb,
                        transactions,
                        input.transactionId,
                        input.expectedVersion
                    );
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
                    await tx
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
                                eq(transactions.monthId, monthId)
                            )
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
                case 'deleteTransaction':
                    await assertVersion(
                        tx as AppDb,
                        transactions,
                        input.transactionId,
                        input.expectedVersion
                    );
                    await tx
                        .update(transactions)
                        .set({
                            deletedAt: new Date(),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(eq(transactions.id, input.transactionId));
                    break;
                case 'undoDeleteTransaction':
                    await tx
                        .update(transactions)
                        .set({ deletedAt: null, updatedAt: new Date() })
                        .where(eq(transactions.id, input.transactionId));
                    break;
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
                case 'renameCategory':
                    await tx
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
                        );
                    break;
                case 'renameItem':
                    await tx
                        .update(budgetItems)
                        .set({
                            name: input.name,
                            version: sql`${budgetItems.version} + 1`,
                            updatedAt: new Date()
                        })
                        .where(eq(budgetItems.id, input.itemId));
                    break;
                case 'archiveCategory':
                    await tx
                        .update(categories)
                        .set({
                            archivedAt: new Date(),
                            version: input.expectedVersion + 1,
                            updatedAt: new Date()
                        })
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId),
                                eq(categories.version, input.expectedVersion)
                            )
                        );
                    break;
                case 'archiveItem':
                    await tx
                        .update(budgetItems)
                        .set({
                            archivedAt: new Date(),
                            version: sql`${budgetItems.version} + 1`,
                            updatedAt: new Date()
                        })
                        .where(eq(budgetItems.id, input.itemId));
                    break;
                case 'deleteCategory': {
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
                    await tx
                        .delete(categories)
                        .where(
                            and(
                                eq(categories.id, input.categoryId),
                                eq(categories.householdId, householdId)
                            )
                        );
                    break;
                }
                case 'deleteItem': {
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
                    await tx
                        .delete(budgetItems)
                        .where(eq(budgetItems.id, input.itemId));
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
                    const monthIncomePlans = await tx
                        .select({ id: incomePlans.id })
                        .from(incomePlans)
                        .where(eq(incomePlans.monthId, monthId));

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
                    await tx
                        .delete(budgetMonths)
                        .where(eq(budgetMonths.id, monthId));
                    break;
                }
            }
            await tx.insert(mutationReceipts).values({
                householdId,
                clientMutationId: input.clientMutationId,
                operation: input.type,
                month: monthDate(input.monthKey),
                result: { ok: true }
            });
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
