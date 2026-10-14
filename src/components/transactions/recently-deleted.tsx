'use client';

import { ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast-provider';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import { TransactionIcon } from '@/components/shared/transaction-icon';
import { formatCurrency } from '@/domain/money';
import type {
    BudgetCategoryView,
    DeletedTransactionEntry,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';

const shortDay = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
const snapshotEmptyCopy =
    'This month has no budget items yet. Add one on the Budget page, then restore this transaction.';
const money = (value: string) => formatCurrency(value).replace('.00', '');
const signedAmount = (entry: DeletedTransactionEntry) =>
    `${entry.type === 'expense' ? '−' : '+'}${money(entry.amountCents)}`;
const orphanedCents = (entry: DeletedTransactionEntry) =>
    BigInt(entry.amountCents) -
    (entry.allocations ?? []).reduce(
        (total, allocation) => total + BigInt(allocation.amountCents),
        0n
    );

export function DeletedTransactionRow({
    entry,
    onRestore
}: {
    entry: DeletedTransactionEntry;
    onRestore: () => void;
}) {
    const detail = entry.needsDestination ? 'Item deleted' : entry.subtitle;

    return (
        <div
            className='activity-row deleted-transaction-row'
            data-needs-destination={entry.needsDestination ? 'true' : 'false'}
        >
            <TransactionIcon type={entry.type} tone={entry.tone} />
            <span className='activity-copy'>
                <strong>{entry.title}</strong>
                <span title={detail}>{detail}</span>
                {entry.split ? <span className='split-tag'>Split</span> : null}
            </span>
            <span className={`activity-amount ${entry.type}`}>
                {signedAmount(entry)}
            </span>
            <button
                className='soft-button deleted-transaction-restore'
                type='button'
                aria-haspopup={entry.needsDestination ? 'dialog' : undefined}
                aria-label={`${entry.needsDestination ? 'Choose where to restore' : 'Restore'} ${entry.title}, ${signedAmount(entry)}, ${shortDay(entry.occurredOn)}`}
                onClick={onRestore}
            >
                <RotateCcw size={15} strokeWidth={2.2} />
                Restore
            </button>
        </div>
    );
}

function RestoreDestinationSheet({
    entry,
    categories,
    open,
    onOpenChange,
    onExitComplete,
    onChoose
}: {
    entry: DeletedTransactionEntry;
    categories: BudgetCategoryView[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete: () => void;
    onChoose: (monthlyItemId: string) => void;
}) {
    const partial = (entry.allocations ?? []).length > 0;
    const orphaned = money(orphanedCents(entry).toString());

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onExitComplete={onExitComplete}
            title='Restore to'
        >
            <div className='restore-destination-sheet'>
                <p className='confirmation-copy'>
                    {partial
                        ? `${orphaned} of ${entry.title} was in a budget item that has been deleted. Choose where that part goes; the rest stays where it was.`
                        : `${entry.title} was in a budget item that has been deleted. Choose where to restore its ${orphaned}.`}
                </p>
                {categories.some((category) => category.items.length > 0) ? (
                    <div className='allocation-picker-list'>
                        {categories
                            .filter((category) => category.items.length > 0)
                            .map((category) => (
                                <section
                                    className='allocation-picker-category'
                                    key={category.id}
                                >
                                    <div className='allocation-picker-category-heading'>
                                        <h3>{category.name}</h3>
                                    </div>
                                    <div className='allocation-picker-items'>
                                        {category.items.map((item) => (
                                            <button
                                                className='allocation-picker-item restore-destination-item'
                                                type='button'
                                                key={item.id}
                                                aria-label={`Restore to ${item.name}, ${category.name}`}
                                                onClick={() =>
                                                    onChoose(item.id)
                                                }
                                            >
                                                <span className='allocation-picker-item-copy'>
                                                    <strong>{item.name}</strong>
                                                    <span
                                                        className={
                                                            BigInt(
                                                                item.availableCents
                                                            ) < 0n
                                                                ? 'negative'
                                                                : undefined
                                                        }
                                                    >
                                                        {`${money(item.availableCents)} available`}
                                                    </span>
                                                </span>
                                                <ChevronRight
                                                    size={17}
                                                    aria-hidden='true'
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            ))}
                    </div>
                ) : (
                    <p className='restore-destination-empty'>
                        {snapshotEmptyCopy}
                    </p>
                )}
            </div>
        </Sheet>
    );
}

export function DeletedTransactionsToggle({
    count,
    active,
    onToggle
}: {
    count: number;
    active: boolean;
    onToggle: () => void;
}) {
    return (
        <span className='transaction-filter-control deleted-transactions-control'>
            <button
                className='icon-button bordered-icon'
                type='button'
                data-filtered={active ? 'true' : 'false'}
                aria-pressed={active}
                aria-label={`Recently deleted, ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
                onClick={onToggle}
            >
                <Trash2 size={19} />
            </button>
            {count > 0 && !active ? (
                <span
                    className='transaction-filter-count'
                    data-tone='muted'
                    aria-hidden='true'
                >
                    {count}
                </span>
            ) : null}
        </span>
    );
}

/**
 * Restores deleted transactions, opening Restore to for one whose item was
 * deleted, and calls `onEmptied` when the last one is restored.
 */
export function useDeletedTransactionRestore({
    snapshot,
    mutate,
    onEmptied
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onEmptied: () => void;
}) {
    const [choosing, setChoosing] = useState<DeletedTransactionEntry | null>(
        null
    );
    const [choosingOpen, setChoosingOpen] = useState(false);
    const showToast = useToast();
    const commit = (
        entry: DeletedTransactionEntry,
        destination?: { id: string; name: string }
    ) => {
        const sent = mutate({
            type: 'undoDeleteTransaction',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            transactionId: entry.id,
            expectedVersion: entry.version,
            destinationItemId: destination?.id
        });

        if (!sent) return;
        setChoosingOpen(false);
        if (snapshot.deletedTransactions.length === 1) onEmptied();
        showToast({
            message: destination
                ? `${entry.title} restored to ${destination.name}.`
                : `${entry.title} restored.`
        });
    };
    const restore = (entry: DeletedTransactionEntry) => {
        if (!entry.needsDestination) return commit(entry);
        setChoosing(entry);
        setChoosingOpen(true);
    };
    const itemName = (monthlyItemId: string) =>
        snapshot.categories
            .flatMap((category) => category.items)
            .find((item) => item.id === monthlyItemId)?.name ?? 'budget item';
    const destinationSheet = choosing ? (
        <RestoreDestinationSheet
            key={choosing.id}
            entry={choosing}
            categories={snapshot.categories}
            open={choosingOpen}
            onOpenChange={setChoosingOpen}
            onExitComplete={() => setChoosing(null)}
            onChoose={(monthlyItemId) =>
                commit(choosing, {
                    id: monthlyItemId,
                    name: itemName(monthlyItemId)
                })
            }
        />
    ) : null;

    return { restore, destinationSheet };
}
