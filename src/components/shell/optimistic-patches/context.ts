import type { BudgetMutation } from '@/server/mutation-schema';

export type PatchOf<T extends BudgetMutation['type']> = Extract<
    BudgetMutation,
    { type: T }
>;

/** Applies an expense/refund split to the item, category, and month totals. */
export type AdjustAllocation = (
    monthlyItemId: string,
    amountCents: bigint
) => void;
