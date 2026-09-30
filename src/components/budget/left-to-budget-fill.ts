import type { OperatorBarFill } from '@/components/ui/currency-input/operator-bar';
import { money } from '@/components/shared/budget-view-helpers';
import {
    leftToBudgetWithPlanDraft,
    planFillingLeftToBudget
} from '@/domain/budget-calculations';
import { MAX_ENTRY_CENTS, type Cents } from '@/domain/money';
import type { BudgetItemView } from '@/domain/types';

/**
 * The calculator-bar chip that sets an item's plan so nothing is left to
 * budget: `+` the amount still unbudgeted, or, when the month is over budget,
 * a red `−` the overage, taken back out of this item. It is `null` when the
 * draft already balances the month, or when the plan that balances it would
 * be negative or above `MAX_ENTRY_CENTS`.
 */
export function leftToBudgetFill(
    item: BudgetItemView,
    leftToBudgetCents: string,
    draftPlanCents: string
): (OperatorBarFill & { valueCents: Cents }) | null {
    const remaining = BigInt(
        leftToBudgetWithPlanDraft({
            leftToBudgetCents,
            savedPlanCents: item.plannedCents,
            draftPlanCents
        })
    );
    const valueCents = planFillingLeftToBudget({
        leftToBudgetCents,
        savedPlanCents: item.plannedCents
    });

    if (
        remaining === 0n ||
        BigInt(valueCents) < 0n ||
        BigInt(valueCents) > MAX_ENTRY_CENTS
    )
        return null;
    const amount = money((remaining < 0n ? -remaining : remaining).toString());

    return remaining > 0n
        ? {
              amount: `+${amount}`,
              caption: 'Left to budget',
              label: `Add the ${amount} left to budget to ${item.name}`,
              valueCents
          }
        : {
              amount: `−${amount}`,
              caption: 'Over budget',
              label: `Take the ${amount} over budget out of ${item.name}`,
              tone: 'over',
              valueCents
          };
}
