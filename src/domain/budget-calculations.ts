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
    priorAvailableCents = '0',
    carryoverEnabled
}: {
    plannedCents: Cents | string;
    netSpendingCents: Cents | string;
    priorAvailableCents?: Cents | string;
    carryoverEnabled: boolean;
}): Cents {
    return cents(
        BigInt(plannedCents) -
            BigInt(netSpendingCents) +
            (carryoverEnabled ? BigInt(priorAvailableCents) : 0n)
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
