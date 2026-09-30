import { cents, type Cents } from './money';

export function leftToBudget(
    expectedIncomeCents: Cents | string,
    plannedCents: Cents | string
): Cents {
    return cents(BigInt(expectedIncomeCents) - BigInt(plannedCents));
}

export function availableBalance({
    plannedCents,
    netSpendingCents,
    carryInCents = '0'
}: {
    plannedCents: Cents | string;
    netSpendingCents: Cents | string;
    carryInCents?: Cents | string;
}): Cents {
    return cents(
        BigInt(plannedCents) - BigInt(netSpendingCents) + BigInt(carryInCents)
    );
}

export function splitsMatchTotal(
    totalCents: Cents | string,
    splits: readonly { amountCents: Cents | string }[]
): boolean {
    return (
        splits.reduce(
            (total, split) => total + BigInt(split.amountCents),
            0n
        ) === BigInt(totalCents)
    );
}

export function projectedAvailableAfterTransactionDraft({
    availableCents,
    currentAllocationCents = '0',
    currentKind,
    draftAllocationCents = '0',
    draftKind
}: {
    availableCents: Cents | string;
    currentAllocationCents?: Cents | string;
    currentKind?: 'expense' | 'refund';
    draftAllocationCents?: Cents | string;
    draftKind: 'expense' | 'refund';
}): Cents {
    let projected = BigInt(availableCents);

    if (currentKind)
        projected +=
            currentKind === 'expense'
                ? BigInt(currentAllocationCents)
                : -BigInt(currentAllocationCents);
    projected +=
        draftKind === 'expense'
            ? -BigInt(draftAllocationCents)
            : BigInt(draftAllocationCents);

    return cents(projected);
}

/**
 * What is still left to budget while one item's plan is being edited: the
 * month's left-to-budget, which counts the item's saved plan, adjusted by how
 * far the draft has moved from that plan.
 */
export function leftToBudgetWithPlanDraft({
    leftToBudgetCents,
    savedPlanCents,
    draftPlanCents
}: {
    leftToBudgetCents: Cents | string;
    savedPlanCents: Cents | string;
    draftPlanCents: Cents | string;
}): Cents {
    return cents(
        BigInt(leftToBudgetCents) -
            (BigInt(draftPlanCents) - BigInt(savedPlanCents))
    );
}

/**
 * The plan for one item that leaves nothing left to budget: its saved plan
 * plus the month's left-to-budget, whatever the item's draft currently holds.
 */
export function planFillingLeftToBudget({
    leftToBudgetCents,
    savedPlanCents
}: {
    leftToBudgetCents: Cents | string;
    savedPlanCents: Cents | string;
}): Cents {
    return cents(BigInt(savedPlanCents) + BigInt(leftToBudgetCents));
}

/**
 * The amount for one split that leaves nothing of the transaction total
 * unassigned: its draft amount plus whatever is still unassigned, which
 * shrinks the split when the splits together exceed the total.
 */
export function splitFillingRemainder({
    totalCents,
    assignedCents,
    splitCents
}: {
    totalCents: Cents | string;
    assignedCents: Cents | string;
    splitCents: Cents | string;
}): Cents {
    return cents(
        BigInt(splitCents) + BigInt(totalCents) - BigInt(assignedCents)
    );
}

/**
 * Remaining balances of both items after moving `amountCents` between them.
 * A planned-amount move and a transfer shift remaining money identically.
 */
export function availableAfterMove({
    sourceAvailableCents,
    destinationAvailableCents,
    amountCents
}: {
    sourceAvailableCents: Cents | string;
    destinationAvailableCents: Cents | string;
    amountCents: Cents | string;
}): { source: Cents; destination: Cents } {
    const amount = BigInt(amountCents);

    return {
        source: cents(BigInt(sourceAvailableCents) - amount),
        destination: cents(BigInt(destinationAvailableCents) + amount)
    };
}
