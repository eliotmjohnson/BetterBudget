import 'server-only';
import { asc, eq } from 'drizzle-orm';
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
import { APP_VERSION } from '@/domain/app-info';
import { APP_TIME_ZONE } from '@/domain/calendar';
import { APP_CURRENCY } from '@/domain/money';
import {
    BACKUP_FORMAT,
    BACKUP_FORMAT_VERSION,
    type BackupFile,
    type BackupMonth
} from './schema';

type CategoryIcon = BackupFile['categories'][number]['icon'];

const toMonthKey = (date: string | null) => date?.slice(0, 7) ?? null;
const toIso = (date: Date | null) => date?.toISOString() ?? null;

function groupBy<T>(rows: T[], key: (row: T) => string) {
    const groups = new Map<string, T[]>();

    for (const row of rows) {
        const id = key(row);

        groups.set(id, [...(groups.get(id) ?? []), row]);
    }

    return groups;
}

async function readHouseholdRows(householdId: string) {
    const db = await getDatabase();

    return Promise.all([
        db
            .select()
            .from(categories)
            .where(eq(categories.householdId, householdId))
            .orderBy(asc(categories.sortOrder)),
        db
            .select({ item: budgetItems })
            .from(budgetItems)
            .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
            .where(eq(categories.householdId, householdId))
            .orderBy(asc(budgetItems.sortOrder)),
        db
            .select()
            .from(budgetMonths)
            .where(eq(budgetMonths.householdId, householdId))
            .orderBy(asc(budgetMonths.month)),
        db
            .select({ link: monthlyBudgetCategories })
            .from(monthlyBudgetCategories)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetCategories.monthId, budgetMonths.id)
            )
            .where(eq(budgetMonths.householdId, householdId)),
        db
            .select({ item: monthlyBudgetItems })
            .from(monthlyBudgetItems)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetItems.monthId, budgetMonths.id)
            )
            .where(eq(budgetMonths.householdId, householdId)),
        db
            .select({ plan: incomePlans })
            .from(incomePlans)
            .innerJoin(budgetMonths, eq(incomePlans.monthId, budgetMonths.id))
            .where(eq(budgetMonths.householdId, householdId))
            .orderBy(asc(incomePlans.sortOrder)),
        db
            .select({ receipt: incomeReceipts })
            .from(incomeReceipts)
            .innerJoin(
                incomePlans,
                eq(incomeReceipts.incomePlanId, incomePlans.id)
            )
            .innerJoin(budgetMonths, eq(incomePlans.monthId, budgetMonths.id))
            .where(eq(budgetMonths.householdId, householdId))
            .orderBy(asc(incomeReceipts.receivedOn)),
        db
            .select({ transaction: transactions })
            .from(transactions)
            .innerJoin(budgetMonths, eq(transactions.monthId, budgetMonths.id))
            .where(eq(budgetMonths.householdId, householdId))
            .orderBy(asc(transactions.occurredOn), asc(transactions.createdAt)),
        db
            .select({
                transactionId: transactionSplits.transactionId,
                budgetItemId: monthlyBudgetItems.budgetItemId,
                amountCents: transactionSplits.amountCents
            })
            .from(transactionSplits)
            .innerJoin(
                monthlyBudgetItems,
                eq(transactionSplits.monthlyItemId, monthlyBudgetItems.id)
            )
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetItems.monthId, budgetMonths.id)
            )
            .where(eq(budgetMonths.householdId, householdId))
    ]);
}

/** Builds the complete household backup, including archived definitions and soft-deleted activity. */
export async function exportHousehold(
    householdId: string
): Promise<BackupFile> {
    const [
        categoryRows,
        itemRows,
        monthRows,
        linkRows,
        monthlyItemRows,
        planRows,
        receiptRows,
        transactionRows,
        splitRows
    ] = await readHouseholdRows(householdId);
    const linksByMonth = groupBy(linkRows, (row) => row.link.monthId);
    const itemsByMonth = groupBy(monthlyItemRows, (row) => row.item.monthId);
    const plansByMonth = groupBy(planRows, (row) => row.plan.monthId);
    const receiptsByPlan = groupBy(
        receiptRows,
        (row) => row.receipt.incomePlanId
    );
    const transactionsByMonth = groupBy(
        transactionRows,
        (row) => row.transaction.monthId
    );
    const splitsByTransaction = groupBy(splitRows, (row) => row.transactionId);
    const months: BackupMonth[] = monthRows.map((month) => ({
        month: month.month.slice(0, 7) as BackupMonth['month'],
        note: month.note,
        categoryIds: (linksByMonth.get(month.id) ?? []).map(
            (row) => row.link.categoryId
        ),
        items: (itemsByMonth.get(month.id) ?? []).map(({ item }) => ({
            budgetItemId: item.budgetItemId,
            plannedCents: item.plannedCents.toString(),
            carryoverEnabled: item.carryoverEnabled
        })),
        incomePlans: (plansByMonth.get(month.id) ?? []).map(({ plan }) => ({
            id: plan.id,
            name: plan.name,
            icon: plan.icon as CategoryIcon,
            tone: plan.tone,
            expectedCents: plan.expectedCents.toString(),
            sortOrder: plan.sortOrder,
            receipts: (receiptsByPlan.get(plan.id) ?? []).map(
                ({ receipt }) => ({
                    id: receipt.id,
                    receivedOn: receipt.receivedOn,
                    amountCents: receipt.amountCents.toString(),
                    note: receipt.note,
                    deletedAt: toIso(receipt.deletedAt),
                    createdAt: receipt.createdAt.toISOString()
                })
            )
        })),
        transactions: (transactionsByMonth.get(month.id) ?? []).map(
            ({ transaction }) => ({
                id: transaction.id,
                kind: transaction.kind,
                merchant: transaction.merchant,
                occurredOn: transaction.occurredOn,
                totalCents: transaction.totalCents.toString(),
                note: transaction.note,
                deletedAt: toIso(transaction.deletedAt),
                createdAt: transaction.createdAt.toISOString(),
                splits: (splitsByTransaction.get(transaction.id) ?? []).map(
                    (split) => ({
                        budgetItemId: split.budgetItemId,
                        amountCents: split.amountCents.toString()
                    })
                )
            })
        )
    }));

    return {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        currency: APP_CURRENCY,
        timeZone: APP_TIME_ZONE,
        categories: categoryRows.map((category) => ({
            id: category.id,
            name: category.name,
            icon: category.icon as CategoryIcon,
            tone: category.tone,
            sortOrder: category.sortOrder,
            archivedFromMonth: toMonthKey(category.archivedFromMonth) as
                BackupMonth['month'] | null
        })),
        items: itemRows.map(({ item }) => ({
            id: item.id,
            categoryId: item.categoryId,
            name: item.name,
            sortOrder: item.sortOrder,
            archivedFromMonth: toMonthKey(item.archivedFromMonth) as
                BackupMonth['month'] | null
        })),
        months
    };
}
