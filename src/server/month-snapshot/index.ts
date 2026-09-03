import 'server-only';
import { cents, monthLabel, shiftMonth, type MonthKey } from '@/domain/money';
import { monthDate } from '@/domain/calendar';
import { leftToBudget } from '@/domain/budget-calculations';
import type { MonthSnapshot } from '@/domain/types';
import { getDatabase } from '@/db';
import {
    buildCarryoverChains,
    deriveBalances,
    sumSpendByMonthlyItem
} from './carryover';
import { buildActivity, buildCategories, rollUpReceipts } from './assemble';
import {
    loadHistoricalPlanRows,
    loadPreviousMonthProbe,
    loadSplitRows,
    loadTargetMonthRows
} from './queries';

export async function getMonthSnapshot(
    monthKey: MonthKey,
    householdId: string
): Promise<MonthSnapshot> {
    const db = await getDatabase();
    const targetDate = monthDate(monthKey);
    const previousDate = monthDate(shiftMonth(monthKey, -1));
    const { monthRows, previousMonthHasCopyableContent } =
        await loadPreviousMonthProbe(db, householdId, targetDate, previousDate);
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
    const {
        activeCategoryRows,
        targetPlanRows,
        currentIncomeRows,
        currentReceiptRows,
        currentTransactionRows
    } = await loadTargetMonthRows(db, householdId, targetMonthId, targetDate);
    const targetDefinitionIds = targetPlanRows.map((plan) => plan.itemId);
    const historicalPlanRows = await loadHistoricalPlanRows(
        db,
        householdId,
        targetDate,
        targetDefinitionIds
    );
    const planRows = buildCarryoverChains(
        targetPlanRows,
        historicalPlanRows,
        monthKey,
        targetDate
    );
    const relevantMonthlyItemIds = planRows.map((plan) => plan.monthlyId);
    const splitRows = await loadSplitRows(db, relevantMonthlyItemIds);
    const calculated = deriveBalances(
        planRows,
        sumSpendByMonthlyItem(splitRows)
    );
    const { receiptTotalsByPlan, receiptsByPlan } =
        rollUpReceipts(currentReceiptRows);
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
    const activity = buildActivity({
        planRows,
        splitRows,
        currentTransactionRows,
        currentReceiptRows,
        targetDate
    });
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
        categories: buildCategories(
            activeCategoryRows,
            planRows,
            calculated,
            targetDate
        ),
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
