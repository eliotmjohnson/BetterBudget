import { z } from 'zod';

export const APP_CURRENCY = 'USD';
export const APP_LOCALE = 'en-US';

export type Cents = string & { readonly __brand: 'Cents' };
export type MonthKey = string & { readonly __brand: 'MonthKey' };

export const monthKeySchema = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .transform((value) => value as MonthKey);

export function cents(value: bigint | number | string): Cents {
    return BigInt(value).toString() as Cents;
}

export function formatCurrency(
    value: Cents | string,
    options: { sign?: boolean; compact?: boolean } = {}
): string {
    const amount = Number(BigInt(value)) / 100;

    return new Intl.NumberFormat(APP_LOCALE, {
        style: 'currency',
        currency: APP_CURRENCY,
        maximumFractionDigits: options.compact ? 0 : 2,
        minimumFractionDigits: options.compact ? 0 : 2,
        signDisplay: options.sign ? 'always' : 'auto',
        notation: options.compact ? 'compact' : 'standard'
    }).format(amount);
}

export function formatCurrencyInput(value: Cents | string): string {
    const valueCents = BigInt(value || '0');
    const negative = valueCents < 0n;
    const absoluteCents = negative ? -valueCents : valueCents;
    const whole = (absoluteCents / 100n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const fraction = (absoluteCents % 100n).toString().padStart(2, '0');

    return `${negative ? '-' : ''}$${whole}.${fraction}`;
}

export function monthLabel(monthKey: MonthKey | string): string {
    const [year, month] = monthKey.split('-').map(Number);

    return new Intl.DateTimeFormat(APP_LOCALE, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, 1)));
}

export function shiftMonth(
    monthKey: MonthKey | string,
    delta: number
): MonthKey {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1 + delta, 1));

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` as MonthKey;
}
