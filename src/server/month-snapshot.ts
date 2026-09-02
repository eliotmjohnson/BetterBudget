import 'server-only';
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import {
    cents,
    monthLabel,
    shiftMonth,
    type Cents,
    type MonthKey
} from '@/domain/money';
import { monthDate } from '@/domain/calendar';
import { availableBalance, leftToBudget } from '@/domain/budget-calculations';
import type {
    ActivityEntry,
    BudgetCategoryView,
    BudgetItemView,
    IncomeReceiptView,
    MonthSnapshot
} from '@/domain/types';
import { getDatabase } from '@/db';
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

export async function getMonthSnapshot(
    monthKey: MonthKey,
    householdId: string
): Promise<MonthSnapshot> {
    const db = await getDatabase();
    const targetDate = monthDate(monthKey);
    const previousDate = monthDate(shiftMonth(monthKey, -1));
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
    const currentMonth = monthRows[0];

    if (!currentMonth)
        return {
            householdId,
            monthId: null,
            monthKey,
            label: monthLabel(monthKey),
            canCopyPreviousMonth: previousMonthHasCopyableContent,
            version: 0,
            note: null,
            summary: {
                expectedIncomeCents: cents(0),
                receivedIncomeCents: cents(0),
                plannedCents: cents(0),
                spentCents: cents(0),
                leftToBudgetCents: cents(0)
            },
            categories: [],
            incomePlans: [],
            activity: []
        };

    const targetMonthId = currentMonth.id;
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
    const targetDefinitionIds = targetPlanRows.map((plan) => plan.itemId);
    const historicalPlanRows =
        targetDefinitionIds.length > 0
            ? await db
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
                  .innerJoin(
                      categories,
                      eq(budgetItems.categoryId, categories.id)
                  )
                  .where(
                      and(
                          eq(budgetMonths.householdId, householdId),
                          lte(budgetMonths.month, targetDate),
                          inArray(budgetItems.id, targetDefinitionIds)
                      )
                  )
                  .orderBy(asc(budgetItems.id), asc(budgetMonths.month))
            : [];
    const historicalPlansByDefinition = new Map<
        string,
        typeof historicalPlanRows
    >();

    for (const plan of historicalPlanRows) {
        const plans = historicalPlansByDefinition.get(plan.itemId) ?? [];

        plans.push(plan);
        historicalPlansByDefinition.set(plan.itemId, plans);
    }
    const planRows = targetPlanRows.flatMap((targetPlan) => {
        const history =
            historicalPlansByDefinition.get(targetPlan.itemId) ?? [];
        const targetIndex = history.findLastIndex(
            (plan) => plan.month === targetDate
        );

        if (targetIndex < 0) return [];
        const chain = [history[targetIndex]!];
        let nextMonth = monthKey;

        for (let index = targetIndex - 1; index >= 0; index -= 1) {
            const plan = history[index]!;
            const expectedMonth = shiftMonth(nextMonth, -1);

            if (
                plan.month.slice(0, 7) !== expectedMonth ||
                !plan.carryoverEnabled
            )
                break;
            chain.unshift(plan);
            nextMonth = expectedMonth;
        }

        return chain;
    });
    const relevantMonthlyItemIds = planRows.map((plan) => plan.monthlyId);
    const splitRows =
        relevantMonthlyItemIds.length > 0
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
            definitionVersion: row.itemVersion,
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

    for (const split of splitRows) {
        const plan = planLookup.get(split.monthlyItemId);

        if (!plan || plan.month !== targetDate) continue;
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
                subtitle: splitInfo?.itemNames.join(', ') || 'Budget item',
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
