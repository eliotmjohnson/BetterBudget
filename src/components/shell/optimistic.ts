import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';
import { applyPlanPatch } from '@/components/shell/optimistic-patches/plans';
import { applyTransactionPatch } from '@/components/shell/optimistic-patches/transactions';
import { applyIncomePatch } from '@/components/shell/optimistic-patches/income';
import { applyStructurePatch } from '@/components/shell/optimistic-patches/structure';
import { applyMonthPatch } from '@/components/shell/optimistic-patches/month-operations';

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
            item.spentCents = cents(BigInt(item.spentCents) + amountCents);
            item.availableCents = cents(
                BigInt(item.availableCents) - amountCents
            );
            category.availableCents = cents(
                BigInt(category.availableCents) - amountCents
            );
        }
    };

    switch (input.type) {
        case 'updatePlan':
        case 'toggleCarryover':
            applyPlanPatch(next, input);
            break;
        case 'addTransaction':
        case 'updateTransaction':
        case 'deleteTransaction':
            applyTransactionPatch(next, input, adjustAllocation);
            break;
        case 'addIncomePlan':
        case 'updateIncomePlan':
        case 'addIncomeReceipt':
        case 'deleteIncomeReceipt':
        case 'deleteIncomePlan':
            applyIncomePatch(next, input);
            break;
        case 'addCategory':
        case 'addItem':
        case 'renameCategory':
        case 'renameItem':
        case 'archiveCategory':
        case 'archiveItem':
        case 'deleteCategory':
        case 'deleteItem':
        case 'reorderCategories':
        case 'reorderItems':
            applyStructurePatch(next, input);
            break;
        case 'updateMonthNote':
        case 'clearPlannedAmounts':
        case 'copyPreviousMonth':
        case 'resetBudget':
        case 'undoDeleteTransaction':
            applyMonthPatch(next, input);
            break;
    }

    return next;
}
