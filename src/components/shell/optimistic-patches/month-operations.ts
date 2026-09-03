import type { MonthSnapshot } from '@/domain/types';
import type { PatchOf } from './context';

type Input = PatchOf<
    | 'updateMonthNote'
    | 'clearPlannedAmounts'
    | 'copyPreviousMonth'
    | 'resetBudget'
    | 'undoDeleteTransaction'
>;

export function applyMonthPatch(next: MonthSnapshot, input: Input): void {
    switch (input.type) {
        case 'updateMonthNote':
            next.note = input.note || null;
            next.version += 1;
            break;
        case 'clearPlannedAmounts':
        case 'copyPreviousMonth':
        case 'resetBudget':
        case 'undoDeleteTransaction':
            break;
    }
}
