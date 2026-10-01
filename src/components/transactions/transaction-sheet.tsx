'use client';

import { StillInput, StillTextarea } from '@/components/ui/still-focus';
import { CalendarDays, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import { projectedAvailableAfterTransactionDraft } from '@/domain/budget-calculations';
import { defaultDateForMonth } from '@/domain/calendar';
import { formatCurrency } from '@/domain/money';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import { TransactionAllocationPicker } from './transaction-allocation-picker';
import { SplitSummary, splitRemainderFill } from './transaction-split-fill';

interface SplitDraft {
    key: string;
    monthlyItemId: string;
    amount: string;
}

export function TransactionSheet({
    initialItemId,
    open,
    onOpenChange,
    onExitComplete,
    snapshot,
    mutate,
    transaction = null,
    onDelete,
    variant = 'capped-mobile'
}: {
    initialItemId?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete?: () => void;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    transaction?: ActivityEntry | null;
    onDelete?: (transaction: ActivityEntry) => void;
    variant?: 'capped-mobile' | 'full-screen-mobile';
}) {
    const items = useMemo(
        () => snapshot.categories.flatMap((category) => category.items),
        [snapshot.categories]
    );
    const itemsById = useMemo(
        () => new Map(items.map((item) => [item.id, item])),
        [items]
    );
    const initialItem = items.find((item) => item.id === initialItemId);
    const editing =
        transaction && transaction.type !== 'income' ? transaction : null;
    const draftSplits = (): SplitDraft[] =>
        (editing?.allocations?.length
            ? editing.allocations
            : initialItem
              ? [
                    {
                        monthlyItemId: initialItem.id,
                        amountCents: '0'
                    }
                ]
              : []
        ).map((allocation, index) => ({
            key: `${editing?.id ?? 'new'}-${index}`,
            monthlyItemId: allocation.monthlyItemId,
            amount: editing ? allocation.amountCents : '0'
        }));
    const [kind, setKind] = useState<'expense' | 'refund'>(() =>
        editing?.type === 'refund' ? 'refund' : 'expense'
    );
    const [merchant, setMerchant] = useState(() => editing?.title ?? '');
    const [amount, setAmount] = useState(() => editing?.amountCents ?? '0');
    const [occurredOn, setOccurredOn] = useState(
        () => editing?.occurredOn ?? defaultDateForMonth(snapshot.monthKey)
    );
    const [note, setNote] = useState(() => editing?.note ?? '');
    const [splits, setSplits] = useState<SplitDraft[]>(draftSplits);
    const [openedWith, setOpenedWith] = useState(open);

    if (open !== openedWith) {
        setOpenedWith(open);
        if (open) {
            setKind(editing?.type === 'refund' ? 'refund' : 'expense');
            setMerchant(editing?.title ?? '');
            setAmount(editing?.amountCents ?? '0');
            setOccurredOn(
                editing?.occurredOn ?? defaultDateForMonth(snapshot.monthKey)
            );
            setNote(editing?.note ?? '');
            setSplits(draftSplits());
        }
    }
    const [allocationPickerOpen, setAllocationPickerOpen] = useState(false);
    const [allocationPickerActive, setAllocationPickerActive] = useState(false);
    const [allocationPickerSession, setAllocationPickerSession] = useState(0);
    const addSplitButtonRef = useRef<HTMLButtonElement>(null);
    const originalAllocationByItemId = useMemo(
        () =>
            new Map(
                (editing?.allocations ?? []).map((allocation) => [
                    allocation.monthlyItemId,
                    allocation.amountCents
                ])
            ),
        [editing?.allocations]
    );
    const totalCents = amount || '0';
    const assignedCents = splits.reduce(
        (sum, split) => sum + BigInt(split.amount || '0'),
        0n
    );
    const remaining = BigInt(totalCents) - assignedCents;
    const submitDisabled =
        !merchant.trim() ||
        BigInt(totalCents) <= 0n ||
        splits.length === 0 ||
        splits.some((split) => BigInt(split.amount || '0') <= 0n) ||
        remaining !== 0n;
    const movingToAnotherMonth = Boolean(
        editing && occurredOn.slice(0, 7) !== snapshot.monthKey
    );
    const updateSplit = (key: string, values: Partial<SplitDraft>) =>
        setSplits((rows) =>
            rows.map((row) => (row.key === key ? { ...row, ...values } : row))
        );
    const projectedRemaining = (
        monthlyItemId: string,
        draftAmountCents: string
    ) =>
        projectedAvailableAfterTransactionDraft({
            availableCents: itemsById.get(monthlyItemId)?.availableCents ?? '0',
            currentAllocationCents:
                originalAllocationByItemId.get(monthlyItemId) ?? '0',
            currentKind:
                editing?.type === 'expense' || editing?.type === 'refund'
                    ? editing.type
                    : undefined,
            draftAllocationCents: draftAmountCents,
            draftKind: kind
        });
    const openAllocationPicker = () => {
        setAllocationPickerSession((session) => session + 1);
        setAllocationPickerActive(true);
        setAllocationPickerOpen(true);
    };
    const applyAllocationSelection = (selectedIds: ReadonlySet<string>) => {
        const currentByItemId = new Map(
            splits.map((split) => [split.monthlyItemId, split])
        );
        const nextSplits = items.flatMap((item) => {
            if (!selectedIds.has(item.id)) return [];

            return [
                currentByItemId.get(item.id) ?? {
                    key: createUuid(),
                    monthlyItemId: item.id,
                    amount: '0'
                }
            ];
        });

        if (nextSplits.length === 1)
            nextSplits[0] = { ...nextSplits[0]!, amount: totalCents };
        setSplits(nextSplits);
        setAllocationPickerOpen(false);
    };
    const removeSplit = (key: string) => {
        setSplits((rows) => {
            const nextRows = rows.filter((row) => row.key !== key);

            if (nextRows.length === 1)
                return [{ ...nextRows[0]!, amount: totalCents }];

            return nextRows;
        });
    };
    const submit = () => {
        const parsedAmount = amount || '0';

        if (splits.length === 0) return;
        const normalized = splits.map((split) => ({
            monthlyItemId: split.monthlyItemId,
            amountCents:
                splits.length === 1 && !split.amount
                    ? parsedAmount
                    : split.amount || '0'
        }));

        if (
            normalized.reduce(
                (sum, split) => sum + BigInt(split.amountCents),
                0n
            ) !== BigInt(parsedAmount)
        )
            return;
        const values = {
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            kind,
            merchant,
            occurredOn,
            totalCents: parsedAmount,
            note: note || undefined,
            splits: normalized
        };
        const accepted =
            transaction && transaction.type !== 'income'
                ? mutate({
                      type: 'updateTransaction',
                      transactionId: transaction.id,
                      expectedVersion: transaction.version,
                      ...values
                  })
                : mutate({ type: 'addTransaction', ...values });

        if (!accepted) return;
        onOpenChange(false);
    };

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onExitComplete={onExitComplete}
            title={transaction ? 'Edit transaction' : 'Add transaction'}
            variant={variant}
            interactionDisabled={allocationPickerActive}
            headerActionVisibility='mobile'
            showHandle={variant !== 'full-screen-mobile'}
            headerAction={
                <button
                    className='sheet-header-submit'
                    type='button'
                    data-kind={kind}
                    disabled={submitDisabled}
                    onClick={submit}
                >
                    {transaction ? 'Save' : 'Add'}
                </button>
            }
            headerAccessory={
                <div
                    className='segmented segmented--compact'
                    data-kind={kind}
                    aria-label='Transaction type'
                >
                    <span className='segmented-thumb' aria-hidden='true' />
                    <button
                        type='button'
                        aria-pressed={kind === 'expense'}
                        className={`segment ${kind === 'expense' ? 'active' : ''}`}
                        onClick={() => setKind('expense')}
                    >
                        Expense
                    </button>
                    <button
                        type='button'
                        aria-pressed={kind === 'refund'}
                        className={`segment ${kind === 'refund' ? 'active' : ''}`}
                        onClick={() => setKind('refund')}
                    >
                        Income
                    </button>
                </div>
            }
        >
            <div className='form-grid'>
                <div className='field'>
                    <label htmlFor='transaction-amount'>Amount</label>
                    <CurrencyInput
                        id='transaction-amount'
                        value={amount}
                        onValueChange={(valueCents) => {
                            setAmount(valueCents);
                            if (splits.length === 1)
                                updateSplit(splits[0]!.key, {
                                    amount: valueCents
                                });
                        }}
                    />
                </div>
                <div className='field'>
                    <label htmlFor='transaction-merchant'>Merchant</label>
                    <StillInput
                        id='transaction-merchant'
                        placeholder='Whole Foods'
                        value={merchant}
                        onChange={(event) => setMerchant(event.target.value)}
                    />
                </div>
                <div className='field'>
                    <label htmlFor='transaction-date'>Date</label>
                    <div className='date-input-shell'>
                        <input
                            id='transaction-date'
                            type='date'
                            value={occurredOn}
                            onChange={(event) =>
                                setOccurredOn(event.target.value)
                            }
                        />
                        <CalendarDays
                            aria-hidden='true'
                            size={18}
                            strokeWidth={1.8}
                        />
                    </div>
                </div>
                <div className='field'>
                    <label>Budget allocation</label>
                </div>
                {splits.map((split, index) => {
                    const item = itemsById.get(split.monthlyItemId);
                    const itemRemaining = movingToAnotherMonth
                        ? null
                        : projectedRemaining(
                              split.monthlyItemId,
                              split.amount || '0'
                          );

                    return (
                        <div className='split-row' key={split.key}>
                            <button
                                className='split-remove-button'
                                type='button'
                                aria-label={`Remove ${item?.name ?? `split ${index + 1}`}`}
                                onClick={() => removeSplit(split.key)}
                            >
                                <Minus size={19} strokeWidth={2.2} />
                            </button>
                            <div className='split-item-copy'>
                                <strong>{item?.name ?? 'Budget item'}</strong>
                                <span
                                    className={
                                        itemRemaining &&
                                        BigInt(itemRemaining) < 0n
                                            ? 'negative'
                                            : undefined
                                    }
                                >
                                    {itemRemaining === null
                                        ? 'Balance updates after save'
                                        : `${formatCurrency(
                                              itemRemaining
                                          ).replace('.00', '')} remaining`}
                                </span>
                            </div>
                            <div className='field split-amount-field'>
                                <CurrencyInput
                                    aria-label={`${item?.name ?? `Split ${index + 1}`} amount`}
                                    value={split.amount}
                                    fill={splitRemainderFill({
                                        splits,
                                        split,
                                        itemName: item?.name ?? 'Budget item',
                                        totalCents,
                                        assignedCents
                                    })}
                                    onValueChange={(valueCents) =>
                                        updateSplit(split.key, {
                                            amount: valueCents
                                        })
                                    }
                                />
                            </div>
                        </div>
                    );
                })}
                <button
                    ref={addSplitButtonRef}
                    className='soft-button'
                    type='button'
                    aria-haspopup='dialog'
                    aria-expanded={allocationPickerOpen}
                    onClick={openAllocationPicker}
                >
                    <Plus size={18} />
                    Add split
                </button>
                <SplitSummary
                    splits={splits}
                    totalCents={totalCents}
                    assignedCents={assignedCents}
                    itemName={(split) =>
                        itemsById.get(split.monthlyItemId)?.name ??
                        'Budget item'
                    }
                    onFill={(key, valueCents) =>
                        updateSplit(key, { amount: valueCents })
                    }
                />
                <div className='field'>
                    <label htmlFor='transaction-note'>Note (optional)</label>
                    <StillTextarea
                        id='transaction-note'
                        placeholder='Add a note'
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </div>
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    data-kind={kind}
                    disabled={submitDisabled}
                    onClick={submit}
                >
                    {transaction ? 'Save transaction' : 'Add transaction'}
                </button>
                {transaction && transaction.type !== 'income' && onDelete ? (
                    <button
                        className='text-button danger-text'
                        type='button'
                        onClick={() => {
                            onDelete(transaction);
                            onOpenChange(false);
                        }}
                    >
                        Delete transaction
                    </button>
                ) : null}
            </div>
            {allocationPickerActive ? (
                <TransactionAllocationPicker
                    key={allocationPickerSession}
                    categories={snapshot.categories}
                    initialSplits={splits}
                    movingToAnotherMonth={movingToAnotherMonth}
                    open={allocationPickerOpen}
                    onOpenChange={setAllocationPickerOpen}
                    onApply={applyAllocationSelection}
                    onExitComplete={() => {
                        setAllocationPickerActive(false);
                    }}
                    projectedRemaining={projectedRemaining}
                    restoreFocusRef={addSplitButtonRef}
                />
            ) : null}
        </Sheet>
    );
}
