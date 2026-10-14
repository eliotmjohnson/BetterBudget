import { monthDateRange } from './calendar';
import { APP_LOCALE, type MonthKey } from './money';

export const BILL_LEAD_DAYS = [0, 1, 3, 7] as const;
export type BillLeadDays = (typeof BILL_LEAD_DAYS)[number];
export type BillReminderKind = 'upcoming' | 'overdue';

export const BILL_REMINDER_SEND_HOUR = 9;
export const BILL_OVERDUE_CATCH_UP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isBillLeadDays = (value: number): value is BillLeadDays =>
    (BILL_LEAD_DAYS as readonly number[]).includes(value);

const utcDate = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function addDays(date: string, days: number): string {
    return new Date(utcDate(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
    Math.round((utcDate(to) - utcDate(from)) / DAY_MS);

/** The due date in a month, clamping days 29–31 to its last day. */
export function billDueDate(monthKey: MonthKey, dueDay: number): string {
    const lastDay = Number(monthDateRange(monthKey).last.slice(8));

    return `${monthKey}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}

export interface BillReminderInput {
    monthKey: MonthKey;
    dueDay: number;
    leadDays: BillLeadDays;
    paid: boolean;
}

export interface BillReminderDecision {
    kind: BillReminderKind;
    dueOn: string;
    daysUntilDue: number;
}

/**
 * The alert a bill needs on `today`, if any: an upcoming alert from the lead
 * day through the due day, or one overdue alert during the catch-up window
 * after it. A bill with an expense recorded in its month needs neither.
 */
export function billReminderDue(
    today: string,
    { monthKey, dueDay, leadDays, paid }: BillReminderInput
): BillReminderDecision | null {
    if (paid) return null;
    const dueOn = billDueDate(monthKey, dueDay);
    const daysUntilDue = daysBetween(today, dueOn);

    if (daysUntilDue >= 0 && daysUntilDue <= leadDays)
        return { kind: 'upcoming', dueOn, daysUntilDue };
    if (daysUntilDue < 0 && daysUntilDue >= -BILL_OVERDUE_CATCH_UP_DAYS)
        return { kind: 'overdue', dueOn, daysUntilDue };

    return null;
}

export function ordinalDay(day: number): string {
    const teen = day % 100 >= 11 && day % 100 <= 13;
    const suffix = teen
        ? 'th'
        : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');

    return `${day}${suffix}`;
}

export function formatDueDate(date: string): string {
    return new Intl.DateTimeFormat(APP_LOCALE, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(utcDate(date)));
}

export function billReminderTitle(
    name: string,
    { kind, daysUntilDue }: BillReminderDecision
): string {
    if (kind === 'overdue')
        return daysUntilDue === -1
            ? `${name} was due yesterday`
            : `${name} was due ${-daysUntilDue} days ago`;
    if (daysUntilDue === 0) return `${name} is due today`;

    return daysUntilDue === 1
        ? `${name} is due tomorrow`
        : `${name} is due in ${daysUntilDue} days`;
}
