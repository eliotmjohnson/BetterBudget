'use client';

import { ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast-provider';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import { TransactionIcon } from '@/components/shared/transaction-icon';
import { formatCurrency } from '@/domain/money';
import type { DeletedTransactionEntry, MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';

const shortDay = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
const signedAmount = (entry: DeletedTransactionEntry) =>
    `${entry.type === 'expense' ? '−' : '+'}${formatCurrency(entry.amountCents).replace('.00', '')}`;

function DeletedTransactionRow({
    entry,
    onRestore
}: {
    entry: DeletedTransactionEntry;
    onRestore: () => void;
}) {
    const detail = entry.restorable
        ? `${entry.subtitle} · ${shortDay(entry.occurredOn)}`
        : 'Its budget item was deleted';

    return (
        <div
            className='activity-row deleted-transaction-row'
            data-restorable={entry.restorable ? 'true' : 'false'}
        >
            <TransactionIcon type={entry.type} tone={entry.tone} />
            <span className='activity-copy'>
                <strong>{entry.title}</strong>
                <span title={detail}>{detail}</span>
            </span>
            <span className={`activity-amount ${entry.type}`}>
                {signedAmount(entry)}
            </span>
            {entry.restorable ? (
                <button
                    className='soft-button deleted-transaction-restore'
                    type='button'
                    aria-label={`Restore ${entry.title}, ${signedAmount(entry)}, ${shortDay(entry.occurredOn)}`}
                    onClick={onRestore}
                >
                    <RotateCcw size={15} strokeWidth={2.2} />
                    Restore
                </button>
            ) : null}
        </div>
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
    const showToast = useToast();
    const deleted = snapshot.deletedTransactions;
    const restore = (entry: DeletedTransactionEntry) => {
        const sent = mutate({
            type: 'undoDeleteTransaction',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            transactionId: entry.id,
            expectedVersion: entry.version
        });

        if (!sent) return;
        if (deleted.every((other) => other === entry || !other.restorable))
            setOpen(false);
        showToast({ message: `${entry.title} restored.` });
    };

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
                        one puts it back in its budget items.
                    </p>
                    {deleted.length > 0 ? (
                        <div className='activity-list'>
                            {deleted.map((entry) => (
                                <DeletedTransactionRow
                                    key={entry.id}
                                    entry={entry}
                                    onRestore={() => restore(entry)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className='recently-deleted-empty'>
                            Nothing left to restore.
                        </p>
                    )}
                </div>
            </Sheet>
        </>
    );
}
