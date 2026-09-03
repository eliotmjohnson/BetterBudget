import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { AdjustAllocation, PatchOf } from './context';

type Input = PatchOf<
    'addTransaction' | 'updateTransaction' | 'deleteTransaction'
>;

export function applyTransactionPatch(
    next: MonthSnapshot,
    input: Input,
    adjustAllocation: AdjustAllocation
): void {
    switch (input.type) {
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
