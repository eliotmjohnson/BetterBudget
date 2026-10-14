import { z } from 'zod';

export const APP_CURRENCY = 'USD';
export const APP_LOCALE = 'en-US';

/** The largest single amount a person can enter: $99,999,999.99. */
export const MAX_ENTRY_CENTS = 9_999_999_999n;

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

/**
 * Parses a non-negative dollar amount such as `12`, `$1,234.5`, or `0.99`
 * into exact cents, or returns null when the text is not a plain amount.
 */
export function parseDollarsToCents(value: string): Cents | null {
    const match = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(
        value.trim()
    );

    if (!match) return null;
    const whole = BigInt((match[1] ?? '0').replaceAll(',', ''));
    const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));

    return cents(whole * 100n + fraction);
}

/**
 * Reads search text such as `12`, `$12.5`, or `-1,234.56` as an inclusive
 * cents range at the precision typed: `12` spans $12.00–$12.99, `12.5` spans
 * $12.50–$12.59, and `12.34` is exact. Returns null for non-amount text.
 */
export function parseAmountSearch(
    value: string
): { minCents: bigint; maxCents: bigint } | null {
    const match =
        /^[-+−]?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{0,2}))?$/.exec(
            value.trim()
        );

    if (!match) return null;
    const whole = BigInt((match[1] ?? '0').replaceAll(',', '')) * 100n;
    const fractionDigits = match[2] ?? '';
    const minCents = whole + BigInt(fractionDigits.padEnd(2, '0'));
    const span = [99n, 9n, 0n][fractionDigits.length] ?? 0n;

    return { minCents, maxCents: minCents + span };
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
