import { ordinalDay } from '@/domain/bill-reminders';
import type { BudgetItemView } from '@/domain/types';

export function BillDueTag({ item }: { item: BudgetItemView }) {
    const dueDay = item.billDueDayOverride ?? item.billDueDay;

    if (!item.billReminderEnabled || dueDay === null) return null;

    return <span className='bill-due-tag'>Due the {ordinalDay(dueDay)}</span>;
}
