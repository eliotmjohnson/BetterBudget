import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { AdjustAllocation, PatchOf } from './context';

type Input = PatchOf<
    | 'addTransaction'
    | 'transferBetweenItems'
    | 'updateTransaction'
    | 'deleteTransaction'
>;

function transferLegs(
    next: MonthSnapshot,
    input: PatchOf<'transferBetweenItems'>
): PatchOf<'addTransaction'>[] {
    const nameOf = (monthlyItemId: string) =>
        next.categories
            .flatMap((category) => category.items)
            .find((item) => item.id === monthlyItemId)?.name ?? 'budget item';
    const leg = (
        suffix: string,
        kind: 'expense' | 'refund',
        merchant: string,
        monthlyItemId: string
    ): PatchOf<'addTransaction'> => ({
        type: 'addTransaction',
        clientMutationId: `${input.clientMutationId}-${suffix}`,
        monthKey: input.monthKey,
        kind,
        merchant,
        occurredOn: input.occurredOn,
        totalCents: input.amountCents,
        splits: [{ monthlyItemId, amountCents: input.amountCents }]
    });

    return [
        leg(
            'out',
            'expense',
            `Transfer to ${nameOf(input.toItemId)}`,
            input.fromItemId
        ),
        leg(
            'in',
            'refund',
            `Transfer from ${nameOf(input.fromItemId)}`,
            input.toItemId
        )
    ];
}

export function applyTransactionPatch(
    next: MonthSnapshot,
    input: Input,
    adjustAllocation: AdjustAllocation
): void {
    switch (input.type) {
        case 'transferBetweenItems': {
            for (const leg of transferLegs(next, input))
                applyTransactionPatch(next, leg, adjustAllocation);
            break;
        }
        case 'addTransaction': {
            const direction = input.kind === 'refund' ? -1n : 1n;

            for (const split of input.splits)
                adjustAllocation(
                    split.monthlyItemId,
                    BigInt(split.amountCents) * direction
                );
            next.summary.spentCents = cents(
                BigInt(next.summary.spentCents) +
                    BigInt(input.totalCents) * direction
            );
            const firstItem = next.categories
                .flatMap((category) =>
                    category.items.map((item) => ({ item, category }))
                )
                .find(({ item }) => item.id === input.splits[0]?.monthlyItemId);
            const itemNamesById = new Map(
                next.categories.flatMap((category) =>
                    category.items.map((item) => [item.id, item.name])
                )
            );
            const itemNames = input.splits.flatMap((split) => {
                const itemName = itemNamesById.get(split.monthlyItemId);

                return itemName ? [itemName] : [];
            });

            next.activity.unshift({
                id: `optimistic-${input.clientMutationId}`,
                type: input.kind,
                title: input.merchant,
                subtitle: itemNames.join(', ') || 'Budget item',
                occurredOn: input.occurredOn,
                amountCents: cents(input.totalCents),
                tone: firstItem?.category.tone ?? 'blue',
                split: input.splits.length > 1,
                version: 1,
                note: input.note,
                allocations: input.splits.map((split) => ({
                    monthlyItemId: split.monthlyItemId,
                    amountCents: cents(split.amountCents)
                }))
            });
            break;
        }
        case 'updateTransaction': {
            if (!input.occurredOn.startsWith(`${input.monthKey}-`)) break;
            const activity = next.activity.find(
                (entry) => entry.id === input.transactionId
            );

            if (!activity) break;
            const oldDirection = activity.type === 'refund' ? -1n : 1n;

            for (const allocation of activity.allocations ?? [])
                adjustAllocation(
                    allocation.monthlyItemId,
                    -BigInt(allocation.amountCents) * oldDirection
                );
            const direction = input.kind === 'refund' ? -1n : 1n;

            for (const split of input.splits)
                adjustAllocation(
                    split.monthlyItemId,
                    BigInt(split.amountCents) * direction
                );
            next.summary.spentCents = cents(
                BigInt(next.summary.spentCents) -
                    BigInt(activity.amountCents) * oldDirection +
                    BigInt(input.totalCents) * direction
            );
            const firstItem = next.categories
                .flatMap((category) =>
                    category.items.map((item) => ({ item, category }))
                )
                .find(({ item }) => item.id === input.splits[0]?.monthlyItemId);
            const itemNamesById = new Map(
                next.categories.flatMap((category) =>
                    category.items.map((item) => [item.id, item.name])
                )
            );
            const itemNames = input.splits.flatMap((split) => {
                const itemName = itemNamesById.get(split.monthlyItemId);

                return itemName ? [itemName] : [];
            });

            Object.assign(activity, {
                type: input.kind,
                title: input.merchant,
                subtitle: itemNames.join(', ') || 'Budget item',
                occurredOn: input.occurredOn,
                amountCents: cents(input.totalCents),
                tone: firstItem?.category.tone ?? 'blue',
                split: input.splits.length > 1,
                version: activity.version + 1,
                note: input.note,
                allocations: input.splits.map((split) => ({
                    monthlyItemId: split.monthlyItemId,
                    amountCents: cents(split.amountCents)
                }))
            });
            break;
        }
        case 'deleteTransaction': {
            const activity = next.activity.find(
                (entry) => entry.id === input.transactionId
            );

            if (activity) {
                const direction = activity.type === 'refund' ? -1n : 1n;

                for (const allocation of activity.allocations ?? [])
                    adjustAllocation(
                        allocation.monthlyItemId,
                        -BigInt(allocation.amountCents) * direction
                    );
                next.summary.spentCents = cents(
                    BigInt(next.summary.spentCents) -
                        BigInt(activity.amountCents) * direction
                );
            }
            next.activity = next.activity.filter(
                (entry) => entry.id !== input.transactionId
            );
            break;
        }
    }
}
