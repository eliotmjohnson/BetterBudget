import type { MonthKey } from './money';

export const APP_TIME_ZONE = 'America/Chicago';

const appDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

export function defaultDateForMonth(
    monthKey: MonthKey | string,
    now = new Date()
): string {
    const parts = appDateFormatter.formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    const currentMonthKey = `${year}-${month}`;

    return monthKey === currentMonthKey
        ? `${currentMonthKey}-${day}`
        : `${monthKey}-01`;
}
