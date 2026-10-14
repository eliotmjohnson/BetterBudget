import 'server-only';
import { isBillLeadDays } from '@/domain/bill-reminders';
import { cents, type Cents } from '@/domain/money';
import type {
    ActivityEntry,
    BudgetCategoryView,
    BudgetItemView,
    DeletedTransactionEntry,
    IncomeReceiptView
} from '@/domain/types';
import type { ItemUsage } from '@/server/definition-usage';
import type { DerivedBalance } from './carryover';
import type {
    ActiveCategoryRow,
    DeletedTransactions,
    ReceiptRow,
    SplitRow,
    TargetPlanRow,
    TransactionRow
} from './queries';

export function buildCategories(
    activeCategoryRows: ActiveCategoryRow[],
    targetPlanRows: TargetPlanRow[],
    calculated: Map<string, DerivedBalance>,
    {
        itemUsage,
        deletableCategoryIds
    }: {
        itemUsage: Map<string, ItemUsage>;
        deletableCategoryIds: Set<string>;
    }
): BudgetCategoryView[] {
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
                version: category.version,
                permanentlyDeletable: deletableCategoryIds.has(category.id)
            }
        ])
    );

    for (const row of targetPlanRows) {
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
            billReminderEnabled: row.billReminderEnabled,
            billDueDay: row.billDueDay,
            billLeadDays: isBillLeadDays(row.billLeadDays)
                ? row.billLeadDays
                : 3,
            billDueDayOverride: row.billDueDayOverride,
            version: row.monthlyVersion,
            hasLaterActivity:
                itemUsage.get(row.itemId)?.hasLaterActivity ?? false,
            permanentlyDeletable:
                itemUsage.get(row.itemId)?.permanentlyDeletable ?? false
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
                version: row.categoryVersion,
                permanentlyDeletable: deletableCategoryIds.has(row.categoryId)
            });
        }
    }

    return [...categoryMap.values()];
}

export interface ActivityInput {
    targetPlanRows: TargetPlanRow[];
    splitRows: SplitRow[];
    currentTransactionRows: TransactionRow[];
    currentReceiptRows: ReceiptRow[];
}

interface SplitInfo {
    itemNames: string[];
    tone: ActivityEntry['tone'];
    allocations: Array<{ monthlyItemId: string; amountCents: Cents }>;
}

/**
 * Each transaction's allocations to the month's live items, in budget order.
 * Allocations to items deleted for the month are left out.
 */
function splitInfoByTransaction(
    targetPlanRows: TargetPlanRow[],
    splitRows: Pick<
        SplitRow,
        'monthlyItemId' | 'transactionId' | 'amountCents'
    >[]
): Map<string, SplitInfo> {
    const infoByTransaction = new Map<string, SplitInfo>();
    const budgetPosition = new Map(
        targetPlanRows.map((row, position) => [row.monthlyId, position])
    );
    const splitsInBudgetOrder = splitRows
        .filter((split) => budgetPosition.has(split.monthlyItemId))
        .toSorted(
            (a, b) =>
                budgetPosition.get(a.monthlyItemId)! -
                budgetPosition.get(b.monthlyItemId)!
        );

    for (const split of splitsInBudgetOrder) {
        const plan = targetPlanRows[budgetPosition.get(split.monthlyItemId)!]!;
        const existing = infoByTransaction.get(split.transactionId) ?? {
            itemNames: [],
            tone: plan.categoryTone,
            allocations: []
        };

        existing.itemNames.push(plan.itemName);
        existing.allocations.push({
            monthlyItemId: split.monthlyItemId,
            amountCents: cents(split.amountCents)
        });
        infoByTransaction.set(split.transactionId, existing);
    }

    return infoByTransaction;
}

function transactionEntry(
    transaction: TransactionRow,
    splitInfo: SplitInfo | undefined
): ActivityEntry & { type: TransactionRow['kind'] } {
    return {
        id: transaction.id,
        type: transaction.kind,
        title: transaction.merchant,
        subtitle: splitInfo?.itemNames.join(', ') || 'Budget item',
        occurredOn: transaction.occurredOn,
        amountCents: cents(transaction.totalCents),
        tone: splitInfo?.tone ?? 'blue',
        split: (splitInfo?.itemNames.length ?? 0) > 1,
        version: transaction.version,
        note: transaction.note,
        allocations: splitInfo?.allocations ?? []
    };
}

export function buildDeletedTransactions(
    targetPlanRows: TargetPlanRow[],
    { deletedTransactionRows, deletedSplitRows }: DeletedTransactions
): DeletedTransactionEntry[] {
    const infoByTransaction = splitInfoByTransaction(
        targetPlanRows,
        deletedSplitRows
    );
    const splitCounts = Map.groupBy(
        deletedSplitRows,
        (split) => split.transactionId
    );

    return deletedTransactionRows.map((transaction) => {
        const splitInfo = infoByTransaction.get(transaction.id);

        return {
            ...transactionEntry(transaction, splitInfo),
            deletedAt: (transaction.deletedAt ?? new Date(0)).toISOString(),
            needsDestination:
                (splitInfo?.allocations.length ?? 0) !==
                (splitCounts.get(transaction.id)?.length ?? 0)
        };
    });
}

export function buildActivity({
    targetPlanRows,
    splitRows,
    currentTransactionRows,
    currentReceiptRows
}: ActivityInput): ActivityEntry[] {
    const infoByTransaction = splitInfoByTransaction(targetPlanRows, splitRows);
    const expenseActivity: ActivityEntry[] = currentTransactionRows.map(
        (transaction) =>
            transactionEntry(transaction, infoByTransaction.get(transaction.id))
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

    return [...expenseActivity, ...incomeActivity].toSorted((a, b) =>
        b.occurredOn.localeCompare(a.occurredOn)
    );
}

export interface ReceiptRollup {
    receiptTotalsByPlan: Map<string, bigint>;
    receiptsByPlan: Map<string, IncomeReceiptView[]>;
}

export function rollUpReceipts(
    currentReceiptRows: ReceiptRow[]
): ReceiptRollup {
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

    return { receiptTotalsByPlan, receiptsByPlan };
}
