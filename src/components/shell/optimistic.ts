import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';
import { applyPlanPatch } from '@/components/shell/optimistic-patches/plans';
import { applyTransactionPatch } from '@/components/shell/optimistic-patches/transactions';
import { applyIncomePatch } from '@/components/shell/optimistic-patches/income';
import { applyStructurePatch } from '@/components/shell/optimistic-patches/structure';
import { applyMonthPatch } from '@/components/shell/optimistic-patches/month-operations';
import { applyBillReminderPatch } from '@/components/shell/optimistic-patches/bill-reminders';
import type {
    AdjustAllocation,
    PatchOf
} from '@/components/shell/optimistic-patches/context';

type Patch<K extends BudgetMutation['type']> = (
    next: MonthSnapshot,
    input: PatchOf<K>,
    adjustAllocation: AdjustAllocation
) => void;

/**
 * The optimistic patch family for each mutation type. A mapped `Record`
 * rather than a switch, so a new mutation type must name its patch.
 */
const patches: { [K in BudgetMutation['type']]: Patch<K> } = {
    updatePlan: applyPlanPatch,
    movePlannedAmount: applyPlanPatch,
    toggleCarryover: applyPlanPatch,
    addTransaction: applyTransactionPatch,
    transferBetweenItems: applyTransactionPatch,
    updateTransaction: applyTransactionPatch,
    deleteTransaction: applyTransactionPatch,
    undoDeleteTransaction: applyTransactionPatch,
    restoreTransactions: applyTransactionPatch,
    addIncomePlan: applyIncomePatch,
    updateIncomePlan: applyIncomePatch,
    addIncomeReceipt: applyIncomePatch,
    updateIncomeReceipt: applyIncomePatch,
    deleteIncomeReceipt: applyIncomePatch,
    deleteIncomePlan: applyIncomePatch,
    addCategory: applyStructurePatch,
    addItem: applyStructurePatch,
    renameCategory: applyStructurePatch,
    renameItem: applyStructurePatch,
    archiveCategory: applyStructurePatch,
    archiveItem: applyStructurePatch,
    deleteCategory: applyStructurePatch,
    deleteItem: applyStructurePatch,
    reorderCategories: applyStructurePatch,
    reorderItems: applyStructurePatch,
    updateBillReminder: applyBillReminderPatch,
    setBillDueOverride: applyBillReminderPatch,
    updateMonthNote: applyMonthPatch,
    clearPlannedAmounts: applyMonthPatch,
    copyPreviousMonth: applyMonthPatch,
    resetBudget: applyMonthPatch
};

export function optimisticSnapshot(
    snapshot: MonthSnapshot,
    input: BudgetMutation
): MonthSnapshot {
    const next = structuredClone(snapshot);
    const adjustAllocation = (monthlyItemId: string, amountCents: bigint) => {
        for (const category of next.categories) {
            const item = category.items.find(
                (candidate) => candidate.id === monthlyItemId
            );

            if (!item) continue;
            item.permanentlyDeletable = false;
            category.permanentlyDeletable = false;
            item.spentCents = cents(BigInt(item.spentCents) + amountCents);
            item.availableCents = cents(
                BigInt(item.availableCents) - amountCents
            );
            category.availableCents = cents(
                BigInt(category.availableCents) - amountCents
            );
        }
    };

    (patches[input.type] as Patch<BudgetMutation['type']>)(
        next,
        input,
        adjustAllocation
    );

    return next;
}
