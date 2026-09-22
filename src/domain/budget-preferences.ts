export const BUDGET_AMOUNT_VIEW_COOKIE = 'better-budget-amount-view-v1';

export type BudgetAmountView = 'planned' | 'available';

export const DEFAULT_BUDGET_AMOUNT_VIEW: BudgetAmountView = 'available';

export function parseBudgetAmountView(
    value: string | null | undefined
): BudgetAmountView {
    return value === 'planned' || value === 'available'
        ? value
        : DEFAULT_BUDGET_AMOUNT_VIEW;
}

export const ASSISTANT_PREFERENCE_COOKIE = 'better-budget-assistant-v1';

/** Better Buddy is on for a device unless that device turned it off. */
export function parseAssistantPreference(
    value: string | null | undefined
): boolean {
    return value !== 'off';
}
