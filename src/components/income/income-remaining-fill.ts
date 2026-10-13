import type { OperatorBarFill } from '@/components/ui/currency-input/operator-bar';
import { money } from '@/components/shared/budget-view-helpers';
import { receiptFillingIncomeExpected } from '@/domain/budget-calculations';
import { MAX_ENTRY_CENTS, type Cents } from '@/domain/money';
import type { IncomePlanView } from '@/domain/types';

/**
 * The calculator-bar chip that tops a receipt up to whatever of its source's
 * expected amount is still unreceived after the draft, such as `+$600`, and
 * sets the field to the amount that brings the source's received total to its
 * expected amount. `savedReceiptCents` is the edited receipt's saved amount,
 * already counted in the source's received total, or zero for a new receipt.
 * It is `null` once the draft meets or passes what is still expected, or when
 * the filled amount would be above `MAX_ENTRY_CENTS`.
 */
export function incomeRemainingFill(
    plan: IncomePlanView,
    draftCents: string,
    savedReceiptCents = '0'
): (OperatorBarFill & { valueCents: Cents }) | null {
    const valueCents = receiptFillingIncomeExpected({
        expectedCents: plan.expectedCents,
        receivedCents: plan.receivedCents,
        savedReceiptCents
    });
    const remaining = BigInt(valueCents) - BigInt(draftCents || '0');

    if (remaining <= 0n || BigInt(valueCents) > MAX_ENTRY_CENTS) return null;
    const amount = money(remaining.toString());

    return {
        amount: `+${amount}`,
        caption: 'Remaining',
        label: `Add the ${amount} still expected from ${plan.name}`,
        valueCents
    };
}
