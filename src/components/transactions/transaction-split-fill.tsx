'use client';

import type { OperatorBarFill } from '@/components/ui/currency-input/operator-bar';
import { splitFillingRemainder } from '@/domain/budget-calculations';
import { formatCurrency, MAX_ENTRY_CENTS, type Cents } from '@/domain/money';

type SplitFill = OperatorBarFill & { valueCents: Cents };

interface SplitAmount {
    key: string;
    monthlyItemId: string;
    amount: string;
}

const money = (value: bigint) =>
    formatCurrency(value.toString()).replace('.00', '');

/**
 * The calculator-bar chip that sets one split to whatever keeps the splits
 * summing exactly to the transaction total. It is `null` until the total has
 * an amount and every other split has one, so a fill only ever completes the
 * last split rather than piling the whole total onto one; and when nothing is
 * unassigned or the filled split would not be a valid amount.
 */
export function splitRemainderFill<Split extends SplitAmount>({
    splits,
    split,
    itemName,
    totalCents,
    assignedCents
}: {
    splits: readonly Split[];
    split: Split;
    itemName: string;
    totalCents: string;
    assignedCents: bigint;
}): SplitFill | null {
    const remaining = BigInt(totalCents) - assignedCents;
    const valueCents = splitFillingRemainder({
        totalCents,
        assignedCents: assignedCents.toString(),
        splitCents: split.amount || '0'
    });

    if (
        BigInt(totalCents) <= 0n ||
        remaining === 0n ||
        splits.some(
            (other) =>
                other.key !== split.key && BigInt(other.amount || '0') === 0n
        ) ||
        BigInt(valueCents) <= 0n ||
        BigInt(valueCents) > MAX_ENTRY_CENTS
    )
        return null;
    const amount = money(remaining < 0n ? -remaining : remaining);

    return remaining > 0n
        ? {
              amount: `+${amount}`,
              caption: 'Remaining',
              label: `Add the ${amount} remaining to ${itemName}`,
              valueCents
          }
        : {
              amount: `−${amount}`,
              caption: 'Remaining',
              label: `Take the ${amount} over-assigned from ${itemName}`,
              valueCents
          };
}

/**
 * The Assigned and Remaining totals under a transaction's splits. Remaining
 * becomes a button whenever `splitRemainderFill` offers a fill for some split:
 * the one split still at $0, or, when every split has an amount, the last one
 * that can absorb the difference.
 */
export function SplitSummary<Split extends SplitAmount>({
    splits,
    totalCents,
    assignedCents,
    itemName,
    onFill
}: {
    splits: readonly Split[];
    totalCents: string;
    assignedCents: bigint;
    itemName: (split: Split) => string;
    onFill: (key: string, valueCents: Cents) => void;
}) {
    const remaining = BigInt(totalCents) - assignedCents;
    const fillFor = (split: Split) =>
        splitRemainderFill({
            splits,
            split,
            itemName: itemName(split),
            totalCents,
            assignedCents
        });
    const target = splits.findLast((split) => fillFor(split) !== null);
    const fill = target ? fillFor(target) : null;

    return (
        <div className='split-summary'>
            <div>
                <span>Assigned</span>
                <strong>{money(assignedCents)}</strong>
            </div>
            <div>
                {target && fill ? (
                    <button
                        className='split-summary-fill'
                        type='button'
                        aria-label={fill.label}
                        onClick={() => onFill(target.key, fill.valueCents)}
                    >
                        <span>Remaining</span>
                        <strong>{money(remaining)}</strong>
                        <span className='split-summary-fill-action'>
                            Fill {itemName(target)}
                        </span>
                    </button>
                ) : (
                    <>
                        <span>Remaining</span>
                        <strong
                            className={
                                remaining === 0n ? undefined : 'negative'
                            }
                        >
                            {money(remaining)}
                        </strong>
                    </>
                )}
            </div>
        </div>
    );
}
