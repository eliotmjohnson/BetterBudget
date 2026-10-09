import 'server-only';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    monthlyBudgetCategories,
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from '@/db/schema';

export interface ItemUsage {
    hasLaterActivity: boolean;
    permanentlyDeletable: boolean;
}

/**
 * Answers both flags in one grouped query: each monthly row probes the split
 * index with `EXISTS` instead of returning every allocation ever made, so the
 * cost follows the number of months an item spans rather than its history of
 * transactions.
 */
export async function loadItemUsage(
    db: AppDb,
    householdId: string,
    targetDate: string,
    itemIds: string[]
): Promise<Map<string, ItemUsage>> {
    const usage = new Map<string, ItemUsage>(
        itemIds.map((id) => [
            id,
            { hasLaterActivity: false, permanentlyDeletable: true }
        ])
    );

    if (itemIds.length === 0) return usage;
    const anyAllocation = db
        .select({ one: sql`1` })
        .from(transactionSplits)
        .where(eq(transactionSplits.monthlyItemId, monthlyBudgetItems.id));
    const liveAllocation = db
        .select({ one: sql`1` })
        .from(transactionSplits)
        .innerJoin(
            transactions,
            eq(transactionSplits.transactionId, transactions.id)
        )
        .where(
            and(
                eq(transactionSplits.monthlyItemId, monthlyBudgetItems.id),
                isNull(transactions.deletedAt)
            )
        );
    const rows = await db
        .select({
            itemId: monthlyBudgetItems.budgetItemId,
            budgetedInOtherMonth: sql<boolean>`bool_or(${budgetMonths.month} <> ${targetDate})`,
            allocated: sql<boolean>`bool_or(${exists(anyAllocation)})`,
            hasLaterActivity: sql<boolean>`bool_or(${budgetMonths.month} > ${targetDate} and ${exists(liveAllocation)})`
        })
        .from(monthlyBudgetItems)
        .innerJoin(
            budgetMonths,
            eq(monthlyBudgetItems.monthId, budgetMonths.id)
        )
        .where(
            and(
                eq(budgetMonths.householdId, householdId),
                inArray(monthlyBudgetItems.budgetItemId, itemIds)
            )
        )
        .groupBy(monthlyBudgetItems.budgetItemId);

    for (const row of rows)
        usage.set(row.itemId, {
            hasLaterActivity: row.hasLaterActivity === true,
            permanentlyDeletable:
                row.budgetedInOtherMonth !== true && row.allocated !== true
        });

    return usage;
}

export interface CategoryUsage {
    deletableCategoryIds: Set<string>;
    itemUsage: Map<string, ItemUsage>;
}

/**
 * Also returns the usage of every item in the given categories, archived ones
 * included, so a caller that needs both reads item history once.
 */
export async function loadCategoryUsage(
    db: AppDb,
    householdId: string,
    targetDate: string,
    categoryIds: string[]
): Promise<CategoryUsage> {
    if (categoryIds.length === 0)
        return { deletableCategoryIds: new Set(), itemUsage: new Map() };
    const [itemRows, participationRows] = await Promise.all([
        db
            .select({ id: budgetItems.id, categoryId: budgetItems.categoryId })
            .from(budgetItems)
            .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
            .where(
                and(
                    eq(categories.householdId, householdId),
                    inArray(budgetItems.categoryId, categoryIds)
                )
            ),
        db
            .select({ categoryId: monthlyBudgetCategories.categoryId })
            .from(monthlyBudgetCategories)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetCategories.monthId, budgetMonths.id)
            )
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    inArray(monthlyBudgetCategories.categoryId, categoryIds)
                )
            )
            .groupBy(monthlyBudgetCategories.categoryId)
            .having(sql`bool_or(${budgetMonths.month} <> ${targetDate})`)
    ]);
    const itemUsage = await loadItemUsage(
        db,
        householdId,
        targetDate,
        itemRows.map((row) => row.id)
    );
    const deletableCategoryIds = new Set(categoryIds);

    for (const row of participationRows)
        deletableCategoryIds.delete(row.categoryId);
    for (const row of itemRows)
        if (!itemUsage.get(row.id)?.permanentlyDeletable)
            deletableCategoryIds.delete(row.categoryId);

    return { deletableCategoryIds, itemUsage };
}

export async function loadDeletableCategoryIds(
    db: AppDb,
    householdId: string,
    targetDate: string,
    categoryIds: string[]
): Promise<Set<string>> {
    return (await loadCategoryUsage(db, householdId, targetDate, categoryIds))
        .deletableCategoryIds;
}
