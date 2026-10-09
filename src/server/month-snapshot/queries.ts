import 'server-only';
import {
    and,
    asc,
    desc,
    eq,
    gt,
    gte,
    inArray,
    isNull,
    lt,
    or,
    sql
} from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    incomePlans,
    incomeReceipts,
    monthlyBudgetCategories,
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from '@/db/schema';

export async function loadPreviousMonthProbe(
    db: AppDb,
    householdId: string,
    targetDate: string,
    previousDate: string
) {
    const [
        monthRows,
        previousCategoryRows,
        previousPlanRows,
        previousIncomeRows
    ] = await Promise.all([
        db
            .select()
            .from(budgetMonths)
            .where(
                and(
                    eq(budgetMonths.householdId, householdId),
                    eq(budgetMonths.month, targetDate)
                )
            )
            .limit(1),
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
    const previousMonthHasCopyableContent =
        previousCategoryRows.length > 0 ||
        previousPlanRows.length > 0 ||
        previousIncomeRows.length > 0;

    return { monthRows, previousMonthHasCopyableContent };
}

export async function loadTargetMonthRows(
    db: AppDb,
    householdId: string,
    targetMonthId: string,
    targetDate: string
) {
    const [
        activeCategoryRows,
        targetPlanRows,
        currentIncomeRows,
        currentReceiptRows,
        currentTransactionRows
    ] = await Promise.all([
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
                    or(
                        isNull(categories.archivedAt),
                        gt(categories.archivedFromMonth, targetDate)
                    )
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
                itemVersion: budgetItems.version,
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
                    eq(budgetMonths.month, targetDate),
                    or(
                        isNull(categories.archivedAt),
                        gt(categories.archivedFromMonth, targetDate)
                    ),
                    or(
                        isNull(budgetItems.archivedAt),
                        gt(budgetItems.archivedFromMonth, targetDate)
                    )
                )
            )
            .orderBy(asc(categories.sortOrder), asc(budgetItems.sortOrder)),
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
            )
    ]);

    return {
        activeCategoryRows,
        targetPlanRows,
        currentIncomeRows,
        currentReceiptRows,
        currentTransactionRows
    };
}

/**
 * Earlier months only, and only what carryover derivation reads; the target
 * month's own rows come from `loadTargetMonthRows`.
 */
export async function loadHistoricalPlanRows(
    db: AppDb,
    householdId: string,
    targetDate: string,
    targetDefinitionIds: string[]
) {
    return targetDefinitionIds.length > 0
        ? await db
              .select({
                  monthlyId: monthlyBudgetItems.id,
                  month: budgetMonths.month,
                  plannedCents: monthlyBudgetItems.plannedCents,
                  carryoverEnabled: monthlyBudgetItems.carryoverEnabled,
                  itemId: monthlyBudgetItems.budgetItemId
              })
              .from(monthlyBudgetItems)
              .innerJoin(
                  budgetMonths,
                  eq(monthlyBudgetItems.monthId, budgetMonths.id)
              )
              .where(
                  and(
                      eq(budgetMonths.householdId, householdId),
                      lt(budgetMonths.month, targetDate),
                      inArray(
                          monthlyBudgetItems.budgetItemId,
                          targetDefinitionIds
                      )
                  )
              )
              .orderBy(
                  asc(monthlyBudgetItems.budgetItemId),
                  asc(budgetMonths.month)
              )
        : [];
}

export async function loadSplitRows(
    db: AppDb,
    relevantMonthlyItemIds: string[]
) {
    return relevantMonthlyItemIds.length > 0
        ? await db
              .select({
                  monthlyItemId: transactionSplits.monthlyItemId,
                  transactionId: transactions.id,
                  kind: transactions.kind,
                  amountCents: transactionSplits.amountCents
              })
              .from(transactionSplits)
              .innerJoin(
                  transactions,
                  eq(transactionSplits.transactionId, transactions.id)
              )
              .where(
                  and(
                      inArray(
                          transactionSplits.monthlyItemId,
                          relevantMonthlyItemIds
                      ),
                      isNull(transactions.deletedAt)
                  )
              )
        : [];
}

/**
 * Net spending per monthly item of the given definitions in months from
 * `fromDate` up to but excluding `beforeDate`, with refunds subtracted, summed
 * by the database so carryover history never sends individual allocations to
 * Node. Filtering by definition and month range is about twice as fast as an
 * `IN` list of every monthly item id in a long chain.
 */
export async function loadSpendTotals(
    db: AppDb,
    householdId: string,
    definitionIds: string[],
    { fromDate, beforeDate }: { fromDate: string; beforeDate: string }
): Promise<Map<string, bigint>> {
    if (definitionIds.length === 0 || fromDate >= beforeDate) return new Map();
    const rows = await db
        .select({
            monthlyItemId: transactionSplits.monthlyItemId,
            netCents: sql<
                string | bigint
            >`sum(case when ${transactions.kind} = 'refund' then -${transactionSplits.amountCents} else ${transactionSplits.amountCents} end)::bigint`
        })
        .from(transactionSplits)
        .innerJoin(
            transactions,
            eq(transactionSplits.transactionId, transactions.id)
        )
        .innerJoin(
            monthlyBudgetItems,
            eq(transactionSplits.monthlyItemId, monthlyBudgetItems.id)
        )
        .innerJoin(
            budgetMonths,
            eq(monthlyBudgetItems.monthId, budgetMonths.id)
        )
        .where(
            and(
                eq(budgetMonths.householdId, householdId),
                gte(budgetMonths.month, fromDate),
                lt(budgetMonths.month, beforeDate),
                inArray(monthlyBudgetItems.budgetItemId, definitionIds),
                isNull(transactions.deletedAt)
            )
        )
        .groupBy(transactionSplits.monthlyItemId);

    return new Map(
        rows.map((row) => [row.monthlyItemId, BigInt(row.netCents)])
    );
}

export type TargetPlanRow = Awaited<
    ReturnType<typeof loadTargetMonthRows>
>['targetPlanRows'][number];
export type ActiveCategoryRow = Awaited<
    ReturnType<typeof loadTargetMonthRows>
>['activeCategoryRows'][number];
export type ReceiptRow = Awaited<
    ReturnType<typeof loadTargetMonthRows>
>['currentReceiptRows'][number];
export type TransactionRow = Awaited<
    ReturnType<typeof loadTargetMonthRows>
>['currentTransactionRows'][number];
export type IncomePlanRow = Awaited<
    ReturnType<typeof loadTargetMonthRows>
>['currentIncomeRows'][number];
export type HistoricalPlanRow = Awaited<
    ReturnType<typeof loadHistoricalPlanRows>
>[number];
export type SplitRow = Awaited<ReturnType<typeof loadSplitRows>>[number];
