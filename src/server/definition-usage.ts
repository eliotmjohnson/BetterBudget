import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
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
    const monthlyRows = await db
        .select({
            monthlyId: monthlyBudgetItems.id,
            itemId: monthlyBudgetItems.budgetItemId,
            month: budgetMonths.month
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
        );
    const splitRows =
        monthlyRows.length > 0
            ? await db
                  .select({
                      monthlyItemId: transactionSplits.monthlyItemId,
                      deletedAt: transactions.deletedAt
                  })
                  .from(transactionSplits)
                  .innerJoin(
                      transactions,
                      eq(transactionSplits.transactionId, transactions.id)
                  )
                  .where(
                      inArray(
                          transactionSplits.monthlyItemId,
                          monthlyRows.map((row) => row.monthlyId)
                      )
                  )
            : [];
    const monthlyById = new Map(monthlyRows.map((row) => [row.monthlyId, row]));

    for (const row of monthlyRows) {
        const entry = usage.get(row.itemId);

        if (entry && row.month !== targetDate)
            entry.permanentlyDeletable = false;
    }
    for (const split of splitRows) {
        const row = monthlyById.get(split.monthlyItemId);
        const entry = row ? usage.get(row.itemId) : undefined;

        if (!row || !entry) continue;
        entry.permanentlyDeletable = false;
        if (split.deletedAt === null && row.month > targetDate)
            entry.hasLaterActivity = true;
    }

    return usage;
}

export async function loadDeletableCategoryIds(
    db: AppDb,
    householdId: string,
    targetDate: string,
    categoryIds: string[]
): Promise<Set<string>> {
    if (categoryIds.length === 0) return new Set();
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
            .select({
                categoryId: monthlyBudgetCategories.categoryId,
                month: budgetMonths.month
            })
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
    ]);
    const itemUsage = await loadItemUsage(
        db,
        householdId,
        targetDate,
        itemRows.map((row) => row.id)
    );
    const deletable = new Set(categoryIds);

    for (const row of participationRows)
        if (row.month !== targetDate) deletable.delete(row.categoryId);
    for (const row of itemRows)
        if (!itemUsage.get(row.id)?.permanentlyDeletable)
            deletable.delete(row.categoryId);

    return deletable;
}
