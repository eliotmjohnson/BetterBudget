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

export const fitAmountStyle = (text: string) =>
    ({ '--amount-chars': text.length }) as CSSProperties;
