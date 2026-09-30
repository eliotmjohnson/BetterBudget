import type { CSSProperties } from 'react';
import { formatCurrency } from '@/domain/money';
import type { ActivityEntry } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';

export type Mutate = (input: BudgetMutation) => boolean;
export type MutateConfirmed = (input: BudgetMutation) => Promise<boolean>;

export const money = (value: string) =>
    formatCurrency(value).replace('.00', '');

export const signedMoney = (type: ActivityEntry['type'], amountCents: string) =>
    `${type === 'expense' ? '−' : '+'}${money(amountCents)}`;

/**
 * How a Spent amount reads. Spent is net of refunds and income entries, so a
 * month or item they outweigh has a net inflow, which reads as money added
 * rather than a negative Spent.
 */
export function spentView(spentCents: string) {
    const spent = BigInt(spentCents);
    const added = spent < 0n;

    return {
        added,
        label: added ? 'Added' : 'Spent',
        amount: added ? `+${money((-spent).toString())}` : money(spentCents)
    };
}

export const fitAmountStyle = (text: string) =>
    ({ '--amount-chars': text.length }) as CSSProperties;
