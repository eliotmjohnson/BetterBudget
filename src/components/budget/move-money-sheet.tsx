'use client';

import { ArrowUpDown } from 'lucide-react';
import { useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';
import { availableAfterMove } from '@/domain/budget-calculations';
import { defaultDateForMonth } from '@/domain/calendar';
import type { BudgetItemView, MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';

type MoveMode = 'plan' | 'transfer';

const modeCopy: Record<MoveMode, string> = {
    plan: 'Moves part of the planned amount. Left to budget stays the same.',
    transfer:
        'Moves money that’s left, as a transaction on both items. Planned amounts stay the same.'
};

type PreviewShape =
    | { kind: 'change'; afterCents: string }
    | { kind: 'limit' }
    | { kind: 'unchanged' };

function PreviewRow({
    item,
    shape
}: {
    item: BudgetItemView;
    shape: PreviewShape;
}) {
    return (
        <li
            className='move-money-preview-row'
            data-tone={shape.kind === 'unchanged' ? 'muted' : undefined}
        >
            <span>{item.name}</span>
            {shape.kind === 'change' ? (
                <span>
                    {money(item.availableCents)} →{' '}
                    <strong
                        data-negative={
                            BigInt(shape.afterCents) < 0n || undefined
                        }
                    >
                        {money(shape.afterCents)}
                    </strong>{' '}
                    left
                </span>
            ) : shape.kind === 'limit' ? (
                <span data-tone='limit'>
                    only {money(item.plannedCents)} planned
                </span>
            ) : (
                <span>{money(item.availableCents)} left</span>
            )}
        </li>
    );
}

function FixedItem({ id, item }: { id: string; item: BudgetItemView }) {
    return (
        <output className='move-money-fixed' id={id}>
            {item.name}
        </output>
    );
}

/**
 * Moves money from one budget item to another, either as a planned-amount
 * swap or as a paired expense and income transaction.
 */
export function MoveMoneySheet({
    itemId,
    open,
    onOpenChange,
    onExitComplete,
    snapshot,
    mutate
}: {
    itemId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete: () => void;
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const items = snapshot.categories.flatMap((category) => category.items);
    const [versions] = useState(
        () => new Map(items.map((item) => [item.id, item.version]))
    );
    const [mode, setMode] = useState<MoveMode>('plan');
    const [outgoing, setOutgoing] = useState(true);
    const [otherItemId, setOtherItemId] = useState('');
    const [amount, setAmount] = useState('');
    const item = items.find((candidate) => candidate.id === itemId);
    const other = items.find((candidate) => candidate.id === otherItemId);

    if (!item) return null;
    const source = outgoing ? item : other;
    const destination = outgoing ? other : item;
    const amountCents = BigInt(amount || '0');
    const overPlan =
        mode === 'plan' &&
        source !== undefined &&
        amountCents > BigInt(source.plannedCents);
    const ready =
        source !== undefined && destination !== undefined && amountCents > 0n;
    const canMove = ready && !overPlan;
    const after = ready
        ? availableAfterMove({
              sourceAvailableCents: source.availableCents,
              destinationAvailableCents: destination.availableCents,
              amountCents: amount
          })
        : null;
    const choices = snapshot.categories
        .map((category) => ({
            ...category,
            items: category.items.filter(
                (candidate) =>
                    candidate.id !== item.id &&
                    !candidate.id.startsWith('optimistic-')
            )
        }))
        .filter((category) => category.items.length > 0);
    const picker = (id: string) => (
        <select
            id={id}
            value={otherItemId}
            onChange={(event) => setOtherItemId(event.target.value)}
        >
            <option value=''>Choose a budget item</option>
            {choices.map((category) => (
                <optgroup key={category.id} label={category.name}>
                    {category.items.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                            {choice.name}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
    const submit = () => {
        if (!canMove) return;
        const shared = {
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            fromItemId: source.id,
            toItemId: destination.id,
            amountCents: amount
        };
        const sent =
            mode === 'plan'
                ? mutate({
                      ...shared,
                      type: 'movePlannedAmount',
                      fromExpectedVersion:
                          versions.get(source.id) ?? source.version,
                      toExpectedVersion:
                          versions.get(destination.id) ?? destination.version
                  })
                : mutate({
                      ...shared,
                      type: 'transferBetweenItems',
                      occurredOn: defaultDateForMonth(snapshot.monthKey)
                  });

        if (sent) onOpenChange(false);
    };

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onExitComplete={onExitComplete}
            title='Move money'
        >
            <div className='form-grid'>
                <div
                    className='segmented'
                    data-segment={mode === 'plan' ? 'first' : 'second'}
                    aria-label='How to move money'
                >
                    <span className='segmented-thumb' aria-hidden='true' />
                    <button
                        type='button'
                        aria-pressed={mode === 'plan'}
                        className={`segment ${mode === 'plan' ? 'active' : ''}`}
                        onClick={() => setMode('plan')}
                    >
                        Planned
                    </button>
                    <button
                        type='button'
                        aria-pressed={mode === 'transfer'}
                        className={`segment ${mode === 'transfer' ? 'active' : ''}`}
                        onClick={() => setMode('transfer')}
                    >
                        Remaining
                    </button>
                </div>
                <p className='confirmation-copy'>{modeCopy[mode]}</p>
                <div className='move-money-route'>
                    <div className='field'>
                        <label htmlFor='move-money-from'>From</label>
                        {outgoing ? (
                            <FixedItem id='move-money-from' item={item} />
                        ) : (
                            picker('move-money-from')
                        )}
                    </div>
                    <button
                        className='move-money-swap'
                        type='button'
                        aria-label='Swap From and To'
                        onClick={() => setOutgoing((current) => !current)}
                    >
                        <ArrowUpDown size={19} aria-hidden='true' />
                    </button>
                    <div className='field'>
                        <label htmlFor='move-money-to'>To</label>
                        {outgoing ? (
                            picker('move-money-to')
                        ) : (
                            <FixedItem id='move-money-to' item={item} />
                        )}
                    </div>
                </div>
                <div className='field'>
                    <label htmlFor='move-money-amount'>Amount</label>
                    <CurrencyInput
                        id='move-money-amount'
                        aria-invalid={overPlan || undefined}
                        aria-describedby={
                            overPlan ? 'move-money-preview' : undefined
                        }
                        value={amount}
                        onValueChange={setAmount}
                    />
                </div>
                {ready && after ? (
                    <ul
                        className='move-money-preview'
                        id='move-money-preview'
                        aria-label='After the move'
                        aria-live='polite'
                        data-invalid={overPlan || undefined}
                    >
                        <PreviewRow
                            item={source}
                            shape={
                                overPlan
                                    ? { kind: 'limit' }
                                    : {
                                          kind: 'change',
                                          afterCents: after.source
                                      }
                            }
                        />
                        <PreviewRow
                            item={destination}
                            shape={
                                overPlan
                                    ? { kind: 'unchanged' }
                                    : {
                                          kind: 'change',
                                          afterCents: after.destination
                                      }
                            }
                        />
                    </ul>
                ) : null}
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    disabled={!canMove}
                    onClick={submit}
                >
                    {amountCents > 0n ? `Move ${money(amount)}` : 'Move'}
                </button>
            </div>
        </Sheet>
    );
}
