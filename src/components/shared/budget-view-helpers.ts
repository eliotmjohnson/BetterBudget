import { formatCurrency } from '@/domain/money';
import type { BudgetMutation } from '@/server/mutation-schema';

export type Mutate = (input: BudgetMutation) => void;

export const money = (value: string) =>
    formatCurrency(value).replace('.00', '');
