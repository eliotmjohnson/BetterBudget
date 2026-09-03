'use client';

import { useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import type {
    CategoryTone,
    IncomePlanView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { CategoryIcon } from '@/components/shared/category-icon';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import { IncomeAppearancePicker, type IncomeIconValue } from './income-fields';

export function AddIncomeSource({
    open,
    onOpenChange,
    snapshot,
    mutate
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [name, setName] = useState('');
    const [expected, setExpected] = useState('');
    const [icon, setIcon] = useState<IncomeIconValue>('wallet');
    const [tone, setTone] = useState<CategoryTone>('mint');
    const submit = () => {
        mutate({
            type: 'addIncomePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            name,
            icon,
            tone,
            expectedCents: expected || '0'
        });
        onOpenChange(false);
        setName('');
        setExpected('');
        setIcon('wallet');
        setTone('mint');
    };

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            title='Add income source'
        >
            <div className='form-grid'>
                <div className='category-editor-preview'>
                    <CategoryIcon icon={icon} tone={tone} size={22} />
                    <div>
                        <strong>{name.trim() || 'Income source'}</strong>
                        <span>Income source preview</span>
                    </div>
                </div>
                <div className='field'>
                    <label htmlFor='income-name'>Source name</label>
                    <input
                        id='income-name'
                        placeholder='Paycheck'
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </div>
                <div className='field'>
                    <label htmlFor='income-expected'>Expected this month</label>
                    <CurrencyInput
                        id='income-expected'
                        value={expected}
                        onValueChange={setExpected}
                    />
                </div>
                <IncomeAppearancePicker
                    icon={icon}
                    tone={tone}
                    onIconChange={setIcon}
                    onToneChange={setTone}
                />
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    disabled={!name.trim() || BigInt(expected || '0') <= 0n}
                    onClick={submit}
                >
                    Add income source
                </button>
            </div>
        </Sheet>
    );
}

export function RecordIncome({
    plan,
    snapshot,
    mutate,
    onOpenChange
}: {
    plan: IncomePlanView | null;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onOpenChange: (open: boolean) => void;
}) {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(`${snapshot.monthKey}-15`);
    const [note, setNote] = useState('');
    const [previousPlan, setPreviousPlan] = useState<IncomePlanView | null>(
        plan
    );
    const [renderedPlan, setRenderedPlan] = useState<IncomePlanView | null>(
        plan
    );

    if (plan !== previousPlan) {
        setPreviousPlan(plan);
        if (plan) setRenderedPlan(plan);
    }

    if (!renderedPlan) return null;
    const submit = () => {
        mutate({
            type: 'addIncomeReceipt',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: renderedPlan.id,
            receivedOn: date,
            amountCents: amount || '0',
            note: note || undefined
        });
        onOpenChange(false);
        setAmount('');
        setNote('');
    };

    return (
        <Sheet
            open={plan !== null}
            title={`Record ${renderedPlan.name}`}
            onOpenChange={onOpenChange}
            onExitComplete={() => {
                if (!plan) setRenderedPlan(null);
            }}
        >
            <div className='form-grid'>
                <div className='field'>
                    <label htmlFor='receipt-amount'>Amount received</label>
                    <CurrencyInput
                        id='receipt-amount'
                        value={amount}
                        onValueChange={setAmount}
                    />
                </div>
                <div className='field'>
                    <label htmlFor='receipt-date'>Date</label>
                    <input
                        id='receipt-date'
                        type='date'
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>
                <div className='field'>
                    <label htmlFor='receipt-note'>Note (optional)</label>
                    <textarea
                        id='receipt-note'
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </div>
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    disabled={BigInt(amount || '0') <= 0n}
                    onClick={submit}
                >
                    Record income
                </button>
            </div>
        </Sheet>
    );
}
