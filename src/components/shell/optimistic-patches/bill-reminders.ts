import type { MonthSnapshot } from '@/domain/types';
import type { PatchOf } from './context';

type Input = PatchOf<'updateBillReminder' | 'setBillDueOverride'>;

export function applyBillReminderPatch(
    next: MonthSnapshot,
    input: Input
): void {
    const items = next.categories.flatMap((category) => category.items);

    switch (input.type) {
        case 'updateBillReminder': {
            const item = items.find(
                (candidate) => candidate.definitionId === input.itemId
            );

            if (!item) break;
            item.billReminderEnabled = input.enabled;
            item.billDueDay = input.dueDay;
            item.billLeadDays = input.leadDays;
            item.definitionVersion += 1;
            break;
        }
        case 'setBillDueOverride': {
            const item = items.find(
                (candidate) => candidate.id === input.monthlyItemId
            );

            if (!item) break;
            item.billDueDayOverride = input.dueDay;
            item.version += 1;
            break;
        }
    }
}
