'use client';

import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import { formatCurrency } from '@/domain/money';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';

type Mutate = (input: BudgetMutation) => void;
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
    onDelete
}: {
    initialItemId?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete?: () => void;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    transaction?: ActivityEntry | null;
    onDelete?: (transaction: ActivityEntry) => void;
}) {
    const items = useMemo(
        () =>
            snapshot.categories.flatMap((category) =>
                category.items.map((item) => ({
                    ...item,
                    categoryName: category.name
                }))
            ),
        [snapshot.categories]
    );
    const defaultItem =
        items.find((item) => item.id === initialItemId) ??
        items.find((item) => item.name === 'Groceries') ??
        items[0];
    const editing =
        transaction && transaction.type !== 'income' ? transaction : null;
    const [kind, setKind] = useState<'expense' | 'refund'>(() =>
        editing?.type === 'refund' ? 'refund' : 'expense'
    );
    const [merchant, setMerchant] = useState(() => editing?.title ?? '');
    const [amount, setAmount] = useState(() => editing?.amountCents ?? '0');
    const [occurredOn, setOccurredOn] = useState(
        () => editing?.occurredOn ?? `${snapshot.monthKey}-12`
    );
    const [note, setNote] = useState(() => editing?.note ?? '');
    const [splits, setSplits] = useState<SplitDraft[]>(() =>
        (editing?.allocations?.length
            ? editing.allocations
            : [
                  {
                      monthlyItemId: defaultItem?.id ?? '',
                      amountCents: editing?.amountCents ?? '0'
                  }
              ]
        ).map((allocation, index) => ({
            key: `${editing?.id ?? 'new'}-${index}`,
            monthlyItemId: allocation.monthlyItemId,
            amount: editing ? allocation.amountCents : '0'
        }))
    );
    const totalCents = amount || '0';
    const assignedCents = splits.reduce(
        (sum, split) => sum + BigInt(split.amount || '0'),
        0n
    );
    const remaining = BigInt(totalCents) - assignedCents;
    const updateSplit = (key: string, values: Partial<SplitDraft>) =>
        setSplits((rows) =>
            rows.map((row) => (row.key === key ? { ...row, ...values } : row))
        );
    const submit = () => {
        const parsedAmount = amount || '0';
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

        if (transaction && transaction.type !== 'income')
            mutate({
                type: 'updateTransaction',
                transactionId: transaction.id,
                expectedVersion: transaction.version,
                ...values
            });
        else mutate({ type: 'addTransaction', ...values });
        onOpenChange(false);
        setMerchant('');
        setAmount('');
        setNote('');
        setSplits([
            { key: 'new-0', monthlyItemId: defaultItem?.id ?? '', amount: '' }
        ]);
    };

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onExitComplete={onExitComplete}
            title={transaction ? 'Edit transaction' : 'Add transaction'}
        >
            <div className='form-grid'>
                <div
                    className='segmented'
                    data-kind={kind}
                    aria-label='Transaction type'
                >
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
                    <input
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
                {splits.map((split, index) => (
                    <div className='split-row' key={split.key}>
                        <div className='field'>
                            <select
                                aria-label={`Budget item ${index + 1}`}
                                value={split.monthlyItemId}
                                onChange={(event) =>
                                    updateSplit(split.key, {
                                        monthlyItemId: event.target.value
                                    })
                                }
                            >
                                {items.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.categoryName} · {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className='field'>
                            <CurrencyInput
                                aria-label={`Split amount ${index + 1}`}
                                value={split.amount}
                                onValueChange={(valueCents) =>
                                    updateSplit(split.key, {
                                        amount: valueCents
                                    })
                                }
                            />
                        </div>
                        <button
                            className='icon-button'
                            type='button'
                            aria-label='Remove split'
                            disabled={splits.length === 1}
                            onClick={() =>
                                setSplits((rows) =>
                                    rows.filter((row) => row.key !== split.key)
                                )
                            }
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                <button
                    className='soft-button'
                    type='button'
                    onClick={() =>
                        setSplits((rows) => [
                            ...rows,
                            {
                                key: createUuid(),
                                monthlyItemId: items[0]?.id ?? '',
                                amount: ''
                            }
                        ])
                    }
                >
                    <Plus size={18} />
                    Add split
                </button>
                <div className='split-summary'>
                    <div>
                        <span>Assigned</span>
                        <strong>
                            {formatCurrency(assignedCents.toString()).replace(
                                '.00',
                                ''
                            )}
                        </strong>
                    </div>
                    <div>
                        <span>Remaining</span>
                        <strong
                            style={
                                remaining === 0n
                                    ? undefined
                                    : { color: '#e3474d' }
                            }
                        >
                            {formatCurrency(remaining.toString()).replace(
                                '.00',
                                ''
                            )}
                        </strong>
                    </div>
                </div>
                <div className='field'>
                    <label htmlFor='transaction-note'>Note (optional)</label>
                    <textarea
                        id='transaction-note'
                        placeholder='Add a note'
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </div>
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    disabled={
                        !merchant.trim() ||
                        BigInt(totalCents) <= 0n ||
                        remaining !== 0n
                    }
                    onClick={submit}
                >
                    {transaction ? 'Save changes' : 'Save transaction'}
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
        </Sheet>
    );
}
