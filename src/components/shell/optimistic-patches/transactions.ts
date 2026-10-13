import { cents } from '@/domain/money';
import type {
    ActivityEntry,
    DeletedTransactionEntry,
    MonthSnapshot
} from '@/domain/types';
import type { AdjustAllocation, PatchOf } from './context';

type Input = PatchOf<
    | 'addTransaction'
    | 'transferBetweenItems'
    | 'updateTransaction'
    | 'deleteTransaction'
    | 'undoDeleteTransaction'
>;

function applyAllocations(
    next: MonthSnapshot,
    entry: ActivityEntry,
    sign: bigint,
    adjustAllocation: AdjustAllocation
) {
    const direction = (entry.type === 'refund' ? -1n : 1n) * sign;

    for (const allocation of entry.allocations ?? [])
        adjustAllocation(
            allocation.monthlyItemId,
            BigInt(allocation.amountCents) * direction
        );
    next.summary.spentCents = cents(
        BigInt(next.summary.spentCents) + BigInt(entry.amountCents) * direction
    );
}

/** Moves a restorable deleted transaction back into its date's place in the activity. */
function restoreTransaction(
    next: MonthSnapshot,
    input: PatchOf<'undoDeleteTransaction'>,
    adjustAllocation: AdjustAllocation
) {
    const deleted = next.deletedTransactions.find(
        (entry) => entry.id === input.transactionId
    );

    if (!deleted?.restorable) return;
    next.deletedTransactions = next.deletedTransactions.filter(
        (entry) => entry.id !== input.transactionId
    );
    applyAllocations(next, deleted, 1n, adjustAllocation);
    const entry: ActivityEntry &
        Partial<Pick<DeletedTransactionEntry, 'deletedAt' | 'restorable'>> = {
        ...deleted,
        version: deleted.version + 1
    };

    delete entry.deletedAt;
    delete entry.restorable;
    const position = next.activity.findIndex(
        (candidate) => candidate.occurredOn <= entry.occurredOn
    );

    next.activity.splice(
        position === -1 ? next.activity.length : position,
        0,
        entry
    );
}

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

            next.activity = next.activity.filter(
                (entry) => entry.id !== input.transactionId
            );
            if (!activity || activity.type === 'income') break;
            applyAllocations(next, activity, -1n, adjustAllocation);
            next.deletedTransactions.unshift({
                ...activity,
                type: activity.type,
                version: activity.version + 1,
                deletedAt: new Date().toISOString(),
                restorable: true
            });
            break;
        }
        case 'undoDeleteTransaction':
            restoreTransaction(next, input, adjustAllocation);
            break;
    }
}
