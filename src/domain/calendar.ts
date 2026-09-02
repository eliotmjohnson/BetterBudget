import type { MonthKey } from './money';

export const APP_TIME_ZONE = 'America/Chicago';

const appDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

export function currentMonthKey(now = new Date()): MonthKey {
    const parts = appDateFormatter.formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';

    return `${year}-${month}` as MonthKey;
}

export function defaultDateForMonth(
    monthKey: MonthKey | string,
    now = new Date()
): string {
    const parts = appDateFormatter.formatToParts(now);
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';

    return monthKey === currentMonthKey(now)
        ? `${currentMonthKey(now)}-${day}`
        : `${monthKey}-01`;
}

export const monthDate = (monthKey: MonthKey | string) => `${monthKey}-01`;
