import 'server-only';
import { eq } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetMonths,
    incomePlans,
    incomeReceipts,
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from '@/db/schema';
import { monthDate } from '@/domain/calendar';
import { monthLabel } from '@/domain/money';
import { MutationFailure } from '@/server/mutation-failures';
import type { ResolvedDefinitions } from './import-merge';
import { chunks, nameKey } from './rows';
import type { BackupFile, BackupMonth, BackupSummary } from './schema';

type ActivityContext = {
    definitions: ResolvedDefinitions;
    monthIds: Map<string, string>;
    summary: BackupSummary;
};

const toDate = (value: string | null) => (value ? new Date(value) : null);

async function readExisting(tx: AppDb, householdId: string) {
    return Promise.all([
        tx
            .select({ plan: incomePlans })
            .from(incomePlans)
            .innerJoin(budgetMonths, eq(incomePlans.monthId, budgetMonths.id))
            .where(eq(budgetMonths.householdId, householdId)),
        tx
            .select({ id: incomeReceipts.id })
            .from(incomeReceipts)
            .innerJoin(
                incomePlans,
                eq(incomeReceipts.incomePlanId, incomePlans.id)
            )
            .innerJoin(budgetMonths, eq(incomePlans.monthId, budgetMonths.id))
            .where(eq(budgetMonths.householdId, householdId)),
        tx
            .select({ id: transactions.id })
            .from(transactions)
            .innerJoin(budgetMonths, eq(transactions.monthId, budgetMonths.id))
            .where(eq(budgetMonths.householdId, householdId)),
        tx
            .select({
                id: monthlyBudgetItems.id,
                monthId: monthlyBudgetItems.monthId,
                budgetItemId: monthlyBudgetItems.budgetItemId
            })
            .from(monthlyBudgetItems)
            .innerJoin(
                budgetMonths,
                eq(monthlyBudgetItems.monthId, budgetMonths.id)
            )
            .where(eq(budgetMonths.householdId, householdId))
    ]);
}

type ExistingActivity = Awaited<ReturnType<typeof readExisting>>;

async function mergeIncome(
    tx: AppDb,
    month: BackupMonth,
    monthId: string,
    {
        existingPlans,
        existingReceiptIds,
        summary
    }: {
        existingPlans: ExistingActivity[0];
        existingReceiptIds: Set<string>;
        summary: BackupSummary;
    }
) {
    const monthPlans = existingPlans
        .map(({ plan }) => plan)
        .filter((plan) => plan.monthId === monthId);
    const byId = new Map(monthPlans.map((plan) => [plan.id, plan]));
    const byName = new Map(
        monthPlans.map((plan) => [nameKey(plan.name), plan])
    );
    const offset =
        monthPlans.length === 0
            ? 0
            : Math.max(...monthPlans.map((plan) => plan.sortOrder)) + 1;
    const takenPlanIds = new Set(existingPlans.map(({ plan }) => plan.id));
    const receipts: (typeof incomeReceipts.$inferInsert)[] = [];

    for (const plan of month.incomePlans) {
        const match = byId.get(plan.id) ?? byName.get(nameKey(plan.name));
        const planId =
            match?.id ??
            (takenPlanIds.has(plan.id) ? crypto.randomUUID() : plan.id);

        if (!match)
            await tx.insert(incomePlans).values({
                id: planId,
                monthId,
                name: plan.name,
                icon: plan.icon,
                tone: plan.tone,
                expectedCents: BigInt(plan.expectedCents),
                sortOrder: offset + plan.sortOrder
            });
        for (const receipt of plan.receipts)
            if (!existingReceiptIds.has(receipt.id))
                receipts.push({
                    id: receipt.id,
                    incomePlanId: planId,
                    receivedOn: receipt.receivedOn,
                    amountCents: BigInt(receipt.amountCents),
                    note: receipt.note,
                    deletedAt: toDate(receipt.deletedAt),
                    createdAt: toDate(receipt.createdAt ?? null) ?? undefined
                });
    }
    for (const batch of chunks(receipts))
        await tx.insert(incomeReceipts).values(batch);
    summary.addedReceipts += receipts.length;
}

function assertLiveInMonth(
    month: BackupMonth,
    transaction: BackupMonth['transactions'][number],
    budgetItemId: string,
    definitions: ResolvedDefinitions
) {
    const archivedFrom = definitions.itemArchivedFrom.get(budgetItemId) ?? null;

    if (
        transaction.deletedAt === null &&
        archivedFrom !== null &&
        archivedFrom <= monthDate(month.month)
    )
        throw new MutationFailure(
            'validation',
            `${monthLabel(month.month)} has spending on an item deleted here. Use Replace to restore it.`
        );
}

function resolveSplits(
    month: BackupMonth,
    monthId: string,
    transaction: BackupMonth['transactions'][number],
    {
        definitions,
        monthlyItemIds
    }: {
        definitions: ResolvedDefinitions;
        monthlyItemIds: Map<string, string>;
    }
): (typeof transactionSplits.$inferInsert)[] {
    return transaction.splits.map((split) => {
        const budgetItemId =
            definitions.itemIds.get(split.budgetItemId) ?? split.budgetItemId;
        const monthlyItemId = monthlyItemIds.get(`${monthId}:${budgetItemId}`);

        assertLiveInMonth(month, transaction, budgetItemId, definitions);
        if (!monthlyItemId)
            throw new MutationFailure(
                'validation',
                `${monthLabel(month.month)} has a transaction split to an item not in that month.`
            );

        return {
            transactionId: transaction.id,
            monthlyItemId,
            amountCents: BigInt(split.amountCents)
        };
    });
}

/** Adds income plans, receipts, and transactions whose ids the household does not already hold. */
export async function mergeActivity(
    tx: AppDb,
    householdId: string,
    file: BackupFile,
    { definitions, monthIds, summary }: ActivityContext
) {
    const [existingPlans, receiptRows, transactionRows, monthlyItemRows] =
        await readExisting(tx, householdId);
    const existingReceiptIds = new Set(receiptRows.map((row) => row.id));
    const existingTransactionIds = new Set(
        transactionRows.map((row) => row.id)
    );
    const monthlyItemIds = new Map(
        monthlyItemRows.map((row) => [
            `${row.monthId}:${row.budgetItemId}`,
            row.id
        ])
    );
    const transactionValues: (typeof transactions.$inferInsert)[] = [];
    const splitValues: (typeof transactionSplits.$inferInsert)[] = [];

    for (const month of file.months) {
        const monthId = monthIds.get(monthDate(month.month));

        if (!monthId) continue;
        await mergeIncome(tx, month, monthId, {
            existingPlans,
            existingReceiptIds,
            summary
        });
        for (const transaction of month.transactions) {
            if (existingTransactionIds.has(transaction.id)) continue;
            transactionValues.push({
                id: transaction.id,
                monthId,
                kind: transaction.kind,
                merchant: transaction.merchant,
                occurredOn: transaction.occurredOn,
                totalCents: BigInt(transaction.totalCents),
                note: transaction.note,
                deletedAt: toDate(transaction.deletedAt),
                createdAt: toDate(transaction.createdAt ?? null) ?? undefined
            });
            splitValues.push(
                ...resolveSplits(month, monthId, transaction, {
                    definitions,
                    monthlyItemIds
                })
            );
        }
    }
    for (const batch of chunks(transactionValues))
        await tx.insert(transactions).values(batch);
    for (const batch of chunks(splitValues))
        await tx.insert(transactionSplits).values(batch);
    summary.addedTransactions += transactionValues.length;
}
