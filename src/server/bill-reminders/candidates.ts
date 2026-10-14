import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from '@/db/schema';
import {
    billReminderDue,
    isBillLeadDays,
    type BillReminderDecision
} from '@/domain/bill-reminders';
import { monthDate } from '@/domain/calendar';
import { cents, shiftMonth, type Cents, type MonthKey } from '@/domain/money';

export interface BillReminderCandidate {
    householdId: string;
    budgetItemId: string;
    name: string;
    monthKey: MonthKey;
    plannedCents: Cents;
    decision: BillReminderDecision;
}

interface MonthlyRow {
    id: string;
    budgetItemId: string;
    month: string;
    billDueDayOverride: number | null;
    plannedCents: bigint;
}

const archivedIn = (archivedFromMonth: string | null, monthKey: MonthKey) =>
    archivedFromMonth !== null && archivedFromMonth <= monthDate(monthKey);

function loadEnabledBills(db: AppDb) {
    return db
        .select({
            id: budgetItems.id,
            name: budgetItems.name,
            dueDay: budgetItems.billDueDay,
            leadDays: budgetItems.billLeadDays,
            archivedFromMonth: budgetItems.archivedFromMonth,
            categoryArchivedFromMonth: categories.archivedFromMonth,
            householdId: categories.householdId
        })
        .from(budgetItems)
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(eq(budgetItems.billReminderEnabled, true));
}

async function loadPaidMonthlyItemIds(
    db: AppDb,
    monthlyItemIds: string[]
): Promise<Set<string>> {
    if (monthlyItemIds.length === 0) return new Set();
    const rows = await db
        .selectDistinct({ id: transactionSplits.monthlyItemId })
        .from(transactionSplits)
        .innerJoin(
            transactions,
            eq(transactionSplits.transactionId, transactions.id)
        )
        .where(
            and(
                inArray(transactionSplits.monthlyItemId, monthlyItemIds),
                eq(transactions.kind, 'expense'),
                isNull(transactions.deletedAt)
            )
        );

    return new Set(rows.map((row) => row.id));
}

/**
 * Every enabled bill that needs an alert on `today`, across the previous,
 * current, and next month. A bill takes part in a month when the month has
 * its plan row, or, for a month nobody has created yet, when the month before
 * it does.
 */
export async function loadBillReminderCandidates(
    db: AppDb,
    today: string
): Promise<BillReminderCandidate[]> {
    const bills = await loadEnabledBills(db);

    if (bills.length === 0) return [];
    const currentMonth = today.slice(0, 7) as MonthKey;
    const monthKeys = [-1, 0, 1].map((delta) =>
        shiftMonth(currentMonth, delta)
    );
    const dates = [-2, -1, 0, 1].map((delta) =>
        monthDate(shiftMonth(currentMonth, delta))
    );
    const householdIds = [...new Set(bills.map((bill) => bill.householdId))];
    const [existingMonths, monthlyRows] = await Promise.all([
        db
            .select({
                householdId: budgetMonths.householdId,
                month: budgetMonths.month
            })
            .from(budgetMonths)
            .where(
                and(
                    inArray(budgetMonths.householdId, householdIds),
                    inArray(budgetMonths.month, dates)
                )
            ),
        db
            .select({
                id: monthlyBudgetItems.id,
                budgetItemId: monthlyBudgetItems.budgetItemId,
                month: budgetMonths.month,
                billDueDayOverride: monthlyBudgetItems.billDueDayOverride,
                plannedCents: monthlyBudgetItems.plannedCents
            })
            .from(monthlyBudgetItems)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetItems.monthId, budgetMonths.id)
            )
            .where(
                and(
                    inArray(
                        monthlyBudgetItems.budgetItemId,
                        bills.map((bill) => bill.id)
                    ),
                    inArray(budgetMonths.month, dates)
                )
            )
    ]);
    const monthExists = new Set(
        existingMonths.map((row) => `${row.householdId}:${row.month}`)
    );
    const rowsByKey = new Map<string, MonthlyRow>(
        monthlyRows.map((row) => [`${row.budgetItemId}:${row.month}`, row])
    );
    const paid = await loadPaidMonthlyItemIds(
        db,
        monthlyRows.map((row) => row.id)
    );
    const candidates: BillReminderCandidate[] = [];

    for (const bill of bills) {
        if (bill.dueDay === null || !isBillLeadDays(bill.leadDays)) continue;

        for (const monthKey of monthKeys) {
            if (
                archivedIn(bill.archivedFromMonth, monthKey) ||
                archivedIn(bill.categoryArchivedFromMonth, monthKey)
            )
                continue;
            const row = rowsByKey.get(`${bill.id}:${monthDate(monthKey)}`);
            const created = monthExists.has(
                `${bill.householdId}:${monthDate(monthKey)}`
            );
            const previousRow = rowsByKey.get(
                `${bill.id}:${monthDate(shiftMonth(monthKey, -1))}`
            );
            const planRow = created ? row : previousRow;

            if (!planRow) continue;
            const decision = billReminderDue(today, {
                monthKey,
                dueDay: row?.billDueDayOverride ?? bill.dueDay,
                leadDays: bill.leadDays,
                paid: row !== undefined && paid.has(row.id)
            });

            if (decision)
                candidates.push({
                    householdId: bill.householdId,
                    budgetItemId: bill.id,
                    name: bill.name,
                    monthKey,
                    plannedCents: cents(planRow.plannedCents),
                    decision
                });
        }
    }

    return candidates;
}
