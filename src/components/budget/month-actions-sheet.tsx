'use client';

import { Copy, FilePenLine, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { monthLabel, shiftMonth } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';

type Mutate = (input: BudgetMutation) => void;

export function MonthActionsSheet({
    open,
    onOpenChange,
    snapshot,
    mutate,
    mutationPending
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    mutationPending: boolean;
}) {
    const [confirm, setConfirm] = useState<
        'copy' | 'clear' | 'note' | 'reset' | null
    >(null);
    const [note, setNote] = useState(snapshot.note ?? '');
    const close = () => {
        setConfirm(null);
        onOpenChange(false);
    };
    const execute = () => {
        if (mutationPending) return;
        const base = {
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey
        };

        if (confirm === 'copy') mutate({ type: 'copyPreviousMonth', ...base });
        if (confirm === 'clear')
            mutate({ type: 'clearPlannedAmounts', ...base });
        if (confirm === 'reset') mutate({ type: 'resetBudget', ...base });
        if (confirm === 'note')
            mutate({ type: 'updateMonthNote', note, ...base });
        close();
    };

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) setConfirm(null);
                onOpenChange(next);
            }}
            title={
                confirm === 'copy'
                    ? `Copy ${monthLabel(shiftMonth(snapshot.monthKey, -1))} budget?`
                    : confirm === 'clear'
                      ? 'Clear planned amounts?'
                      : confirm === 'reset'
                        ? 'Reset this budget?'
                        : confirm === 'note'
                          ? 'Month note'
                          : snapshot.label
            }
        >
            {confirm ? (
                <div className='form-grid'>
                    {confirm === 'copy' ? (
                        <p className='confirmation-copy'>
                            Categories, budget items, planned amounts, expected
                            income, and carry-over settings will be copied.
                            Transactions and received income will not.
                        </p>
                    ) : null}
                    {confirm === 'clear' ? (
                        <p className='confirmation-copy'>
                            Every planned amount will become $0. Activity,
                            income receipts, structure, and carry-over settings
                            stay intact.
                        </p>
                    ) : null}
                    {confirm === 'reset' ? (
                        <p className='confirmation-copy'>
                            This permanently removes {snapshot.label}&apos;s
                            categories and line items from this month, planned
                            amounts, transactions, expected and received income,
                            and month note. Household definitions and other
                            months are not changed.
                        </p>
                    ) : null}
                    {confirm === 'note' ? (
                        <div className='field'>
                            <label htmlFor='month-note'>
                                Note for {snapshot.label}
                            </label>
                            <textarea
                                id='month-note'
                                value={note}
                                onChange={(event) =>
                                    setNote(event.target.value)
                                }
                            />
                        </div>
                    ) : null}
                    <button
                        className={`primary-button primary-button--wide ${confirm === 'clear' || confirm === 'reset' ? 'danger-button' : ''}`}
                        type='button'
                        onClick={execute}
                        disabled={mutationPending}
                    >
                        {confirm === 'copy'
                            ? 'Copy budget'
                            : confirm === 'clear'
                              ? 'Clear planned amounts'
                              : confirm === 'reset'
                                ? 'Reset budget'
                                : 'Save note'}
                    </button>
                    <button
                        className='text-button'
                        type='button'
                        onClick={() => setConfirm(null)}
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <div className='settings-list'>
                    <button
                        className='settings-row'
                        type='button'
                        disabled={mutationPending}
                        onClick={() => setConfirm('copy')}
                    >
                        <Copy size={20} color='var(--blue)' />
                        <span>
                            <strong>Copy previous budget</strong>
                            <small>For an empty month</small>
                        </span>
                        <span>›</span>
                    </button>
                    <button
                        className='settings-row'
                        type='button'
                        disabled={mutationPending}
                        onClick={() => setConfirm('clear')}
                    >
                        <Trash2 size={20} color='#e3474d' />
                        <span>
                            <strong>Clear planned amounts</strong>
                            <small>Keep activity and structure</small>
                        </span>
                        <span>›</span>
                    </button>
                    <button
                        className='settings-row'
                        type='button'
                        disabled={mutationPending}
                        onClick={() => setConfirm('reset')}
                    >
                        <RotateCcw size={20} color='#e3474d' />
                        <span>
                            <strong>Reset budget</strong>
                            <small>Start this month over empty</small>
                        </span>
                        <span>›</span>
                    </button>
                    <button
                        className='settings-row'
                        type='button'
                        disabled={mutationPending}
                        onClick={() => {
                            setNote(snapshot.note ?? '');
                            setConfirm('note');
                        }}
                    >
                        <FilePenLine size={20} color='var(--blue)' />
                        <span>
                            <strong>Edit month note</strong>
                            <small>{snapshot.note ?? 'No note yet'}</small>
                        </span>
                        <span>›</span>
                    </button>
                </div>
            )}
        </Sheet>
    );
}
