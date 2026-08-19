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
