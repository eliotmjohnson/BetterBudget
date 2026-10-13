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

function DeletedTransactionRow({
    entry,
    onRestore
}: {
    entry: DeletedTransactionEntry;
    onRestore: () => void;
}) {
    const detail = `${entry.needsDestination ? 'Item deleted' : entry.subtitle} · ${shortDay(entry.occurredOn)}`;

    return (
        <div
            className='activity-row deleted-transaction-row'
            data-needs-destination={entry.needsDestination ? 'true' : 'false'}
        >
            <TransactionIcon type={entry.type} tone={entry.tone} />
            <span className='activity-copy'>
                <strong>{entry.title}</strong>
                <span title={detail}>{detail}</span>
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
            layer='nested'
        >
            <div className='recently-deleted-sheet'>
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
                    <p className='recently-deleted-empty'>
                        {snapshotEmptyCopy}
                    </p>
                )}
            </div>
        </Sheet>
    );
}

export function RecentlyDeleted({
    snapshot,
    mutate
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [open, setOpen] = useState(false);
    const [choosing, setChoosing] = useState<DeletedTransactionEntry | null>(
        null
    );
    const [choosingOpen, setChoosingOpen] = useState(false);
    const showToast = useToast();
    const deleted = snapshot.deletedTransactions;
    const restore = (
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
        if (deleted.length === 1) setOpen(false);
        showToast({
            message: destination
                ? `${entry.title} restored to ${destination.name}.`
                : `${entry.title} restored.`
        });
    };
    const itemName = (monthlyItemId: string) =>
        snapshot.categories
            .flatMap((category) => category.items)
            .find((item) => item.id === monthlyItemId)?.name ?? 'budget item';

    return (
        <>
            {deleted.length > 0 ? (
                <button
                    className='recently-deleted-link'
                    type='button'
                    aria-haspopup='dialog'
                    aria-expanded={open}
                    aria-label={`Recently deleted, ${deleted.length} ${deleted.length === 1 ? 'transaction' : 'transactions'}`}
                    onClick={() => setOpen(true)}
                >
                    <Trash2 size={18} aria-hidden='true' />
                    <span>Recently deleted</span>
                    <span className='recently-deleted-count' aria-hidden='true'>
                        {deleted.length}
                    </span>
                    <ChevronRight size={17} aria-hidden='true' />
                </button>
            ) : null}
            <Sheet open={open} onOpenChange={setOpen} title='Recently deleted'>
                <div className='recently-deleted-sheet'>
                    <p className='confirmation-copy'>
                        Transactions deleted from {snapshot.label}. Restoring
                        one puts it back in its budget items, or one you choose
                        if its item was deleted.
                    </p>
                    {deleted.length > 0 ? (
                        <div className='activity-list'>
                            {deleted.map((entry) => (
                                <DeletedTransactionRow
                                    key={entry.id}
                                    entry={entry}
                                    onRestore={() => {
                                        if (!entry.needsDestination)
                                            return restore(entry);
                                        setChoosing(entry);
                                        setChoosingOpen(true);
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className='recently-deleted-empty'>
                            Nothing left to restore.
                        </p>
                    )}
                </div>
                {choosing ? (
                    <RestoreDestinationSheet
                        key={choosing.id}
                        entry={choosing}
                        categories={snapshot.categories}
                        open={choosingOpen}
                        onOpenChange={setChoosingOpen}
                        onExitComplete={() => setChoosing(null)}
                        onChoose={(monthlyItemId) =>
                            restore(choosing, {
                                id: monthlyItemId,
                                name: itemName(monthlyItemId)
                            })
                        }
                    />
                ) : null}
            </Sheet>
        </>
    );
}
