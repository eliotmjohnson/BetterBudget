import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { monthLabel, shiftMonth, type MonthKey } from '@/domain/money';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    incomePlans,
    incomeReceipts,
    monthlyBudgetCategories,
    monthlyBudgetItems,
    transactions
} from '@/db/schema';
import { monthDate } from '@/domain/calendar';
import { MutationFailure } from '@/server/mutation-failures';
import type { MutationContext } from './context';

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

export async function updateMonthNote({
    tx,
    monthId,
    input
}: MutationContext<'updateMonthNote'>): Promise<void> {
    await tx
        .update(budgetMonths)
        .set({
            note: input.note || null,
            version: sql`${budgetMonths.version} + 1`,
            updatedAt: new Date()
        })
        .where(eq(budgetMonths.id, monthId));
}

async function assertCopyTargetEmpty(
    tx: AppDb,
    householdId: string,
    monthId: string
): Promise<void> {
    const [targetCategories, targetPlans, targetTransactions, targetIncome] =
        await Promise.all([
            tx
                .select({ id: monthlyBudgetCategories.id })
                .from(monthlyBudgetCategories)
                .innerJoin(
                    categories,
                    eq(monthlyBudgetCategories.categoryId, categories.id)
                )
                .where(
                    and(
                        eq(monthlyBudgetCategories.monthId, monthId),
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
                    eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
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
}

async function loadCopySource(
    tx: AppDb,
    householdId: string,
    previousKey: MonthKey,
    missingSourceMessage: string
) {
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
        throw new MutationFailure('not_found', missingSourceMessage);
    const [sourceCategories, sourcePlans, sourceIncome] = await Promise.all([
        tx
            .select({
                categoryId: monthlyBudgetCategories.categoryId
            })
            .from(monthlyBudgetCategories)
            .innerJoin(
                categories,
                eq(monthlyBudgetCategories.categoryId, categories.id)
            )
            .where(
                and(
                    eq(monthlyBudgetCategories.monthId, previousMonth.id),
                    eq(categories.householdId, householdId),
                    isNull(categories.archivedAt)
                )
            ),
        tx
            .select({
                budgetItemId: monthlyBudgetItems.budgetItemId,
                plannedCents: monthlyBudgetItems.plannedCents,
                carryoverEnabled: monthlyBudgetItems.carryoverEnabled
            })
            .from(monthlyBudgetItems)
            .innerJoin(
                budgetItems,
                eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
            )
            .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
            .where(
                and(
                    eq(monthlyBudgetItems.monthId, previousMonth.id),
                    eq(categories.householdId, householdId),
                    isNull(categories.archivedAt),
                    isNull(budgetItems.archivedAt)
                )
            ),
        tx
            .select()
            .from(incomePlans)
            .where(eq(incomePlans.monthId, previousMonth.id))
    ]);

    if (
        sourceCategories.length === 0 &&
        sourcePlans.length === 0 &&
        sourceIncome.length === 0
    )
        throw new MutationFailure('not_found', missingSourceMessage);

    return { sourceCategories, sourcePlans, sourceIncome };
}

export async function copyPreviousMonth({
    tx,
    householdId,
    monthId,
    input
}: MutationContext<'copyPreviousMonth'>): Promise<void> {
    await assertCopyTargetEmpty(tx, householdId, monthId);
    const previousKey = shiftMonth(input.monthKey, -1);
    const missingSourceMessage = `${monthLabel(previousKey)} does not have a budget to copy yet.`;
    const { sourceCategories, sourcePlans, sourceIncome } =
        await loadCopySource(
            tx,
            householdId,
            previousKey,
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
}

export async function clearPlannedAmounts({
    tx,
    monthId
}: MutationContext<'clearPlannedAmounts'>): Promise<void> {
    await tx
        .update(monthlyBudgetItems)
        .set({
            plannedCents: 0n,
            version: sql`${monthlyBudgetItems.version} + 1`,
            updatedAt: new Date()
        })
        .where(eq(monthlyBudgetItems.monthId, monthId));
}

export async function resetBudget({
    tx,
    householdId,
    monthId
}: MutationContext<'resetBudget'>): Promise<void> {
    const [monthIncomePlans, monthItemDefinitions, monthCategoryDefinitions] =
        await Promise.all([
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
                    eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
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
                    eq(monthlyBudgetCategories.categoryId, categories.id)
                )
                .where(
                    and(
                        eq(monthlyBudgetCategories.monthId, monthId),
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
    await tx.delete(transactions).where(eq(transactions.monthId, monthId));
    await tx.delete(incomePlans).where(eq(incomePlans.monthId, monthId));
    await tx
        .delete(monthlyBudgetItems)
        .where(eq(monthlyBudgetItems.monthId, monthId));
    await tx
        .delete(monthlyBudgetCategories)
        .where(eq(monthlyBudgetCategories.monthId, monthId));
    await deleteUnusedResetDefinitions(
        tx,
        householdId,
        monthItemDefinitions.map((item) => item.id),
        [
            ...monthCategoryDefinitions.map((category) => category.id),
            ...monthItemDefinitions.map((item) => item.categoryId)
        ]
    );
    await tx.delete(budgetMonths).where(eq(budgetMonths.id, monthId));
}
