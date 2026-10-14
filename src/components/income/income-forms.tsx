'use client';

import { StillInput, StillTextarea } from '@/components/ui/still-focus';
import { CalendarDays } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import type {
    CategoryTone,
    IncomePlanView,
    IncomeReceiptView,
    MonthSnapshot
} from '@/domain/types';
import {
    dateInMonth,
    defaultDateForMonth,
    monthDateRange
} from '@/domain/calendar';
import { monthLabel } from '@/domain/money';
import { createUuid } from '@/domain/uuid';
import { CategoryIcon } from '@/components/shared/category-icon';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import {
    IncomeAppearancePicker,
    IncomeOneTimeSwitch,
    type IncomeIconValue
} from './income-fields';
import { incomeRemainingFill } from './income-remaining-fill';
import { FieldRequirement } from '@/components/ui/field-requirement';

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
    const [oneTime, setOneTime] = useState(false);
    const [openedWith, setOpenedWith] = useState(open);

    if (open !== openedWith) {
        setOpenedWith(open);
        if (open) {
            setName('');
            setExpected('');
            setIcon('wallet');
            setTone('mint');
            setOneTime(false);
        }
    }
    const submit = () => {
        const accepted = mutate({
            type: 'addIncomePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            name,
            icon,
            tone,
            expectedCents: expected || '0',
            oneTime
        });

        if (accepted) onOpenChange(false);
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
                    <label htmlFor='income-name'>
                        Source name <FieldRequirement />
                    </label>
                    <StillInput
                        id='income-name'
                        placeholder='Paycheck'
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </div>
                <div className='field'>
                    <label htmlFor='income-expected'>
                        Expected this month <FieldRequirement />
                    </label>
                    <CurrencyInput
                        id='income-expected'
                        value={expected}
                        onValueChange={setExpected}
                    />
                </div>
                <IncomeOneTimeSwitch
                    checked={oneTime}
                    monthKey={snapshot.monthKey}
                    onCheckedChange={setOneTime}
                />
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
    const [date, setDate] = useState(() =>
        defaultDateForMonth(snapshot.monthKey)
    );
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
        if (plan && plan.id !== previousPlan?.id) {
            setAmount('');
            setDate(defaultDateForMonth(snapshot.monthKey));
            setNote('');
        }
    }

    if (!renderedPlan) return null;
    const submit = () => {
        const accepted = mutate({
            type: 'addIncomeReceipt',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: renderedPlan.id,
            receivedOn: date,
            amountCents: amount || '0',
            note: note || undefined
        });

        if (accepted) onOpenChange(false);
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
                <ReceiptFields
                    amount={amount}
                    amountFill={incomeRemainingFill(renderedPlan, amount)}
                    date={date}
                    monthKey={snapshot.monthKey}
                    note={note}
                    onAmountChange={setAmount}
                    onDateChange={setDate}
                    onNoteChange={setNote}
                />
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    disabled={
                        BigInt(amount || '0') <= 0n ||
                        !dateInMonth(date, snapshot.monthKey)
                    }
                    onClick={submit}
                >
                    Record income
                </button>
            </div>
        </Sheet>
    );
}

function ReceiptFields({
    amount,
    amountFill,
    date,
    monthKey,
    note,
    onAmountChange,
    onDateChange,
    onNoteChange
}: {
    amount: string;
    amountFill: ComponentProps<typeof CurrencyInput>['fill'];
    date: string;
    monthKey: MonthSnapshot['monthKey'];
    note: string;
    onAmountChange: (amount: string) => void;
    onDateChange: (date: string) => void;
    onNoteChange: (note: string) => void;
}) {
    const { first, last } = monthDateRange(monthKey);
    const outsideMonth = !dateInMonth(date, monthKey);

    return (
        <>
            <div className='field'>
                <label htmlFor='receipt-amount'>
                    Amount received <FieldRequirement />
                </label>
                <CurrencyInput
                    id='receipt-amount'
                    value={amount}
                    fill={amountFill}
                    onValueChange={onAmountChange}
                />
            </div>
            <div className='field'>
                <label htmlFor='receipt-date'>Date</label>
                <div className='date-input-shell'>
                    <input
                        id='receipt-date'
                        type='date'
                        min={first}
                        max={last}
                        value={date}
                        aria-invalid={outsideMonth}
                        aria-describedby={
                            outsideMonth ? 'receipt-date-error' : undefined
                        }
                        onChange={(event) => onDateChange(event.target.value)}
                    />
                    <CalendarDays
                        aria-hidden='true'
                        size={18}
                        strokeWidth={1.8}
                    />
                </div>
                {outsideMonth ? (
                    <p
                        className='form-error'
                        id='receipt-date-error'
                        role='alert'
                    >
                        {`Pick a date in ${monthLabel(monthKey)}.`}
                    </p>
                ) : null}
            </div>
            <div className='field'>
                <label htmlFor='receipt-note'>
                    Note <FieldRequirement optional />
                </label>
                <StillTextarea
                    id='receipt-note'
                    value={note}
                    onChange={(event) => onNoteChange(event.target.value)}
                />
            </div>
        </>
    );
}

export function EditIncomeReceipt({
    open,
    plan,
    receipt,
    snapshot,
    mutate,
    onOpenChange,
    onExitComplete
}: {
    open: boolean;
    plan: IncomePlanView;
    receipt: IncomeReceiptView | null;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onOpenChange: (open: boolean) => void;
    onExitComplete: () => void;
}) {
    const [amount, setAmount] = useState(receipt?.amountCents ?? '');
    const [date, setDate] = useState(receipt?.receivedOn ?? '');
    const [note, setNote] = useState(receipt?.note ?? '');
    const [loadedId, setLoadedId] = useState(receipt?.id ?? null);

    if (receipt && receipt.id !== loadedId) {
        setLoadedId(receipt.id);
        setAmount(receipt.amountCents);
        setDate(receipt.receivedOn);
        setNote(receipt.note ?? '');
    }

    if (!receipt) return null;
    const unchanged =
        amount === receipt.amountCents &&
        date === receipt.receivedOn &&
        note.trim() === (receipt.note ?? '');
    const submit = () => {
        const accepted =
            unchanged ||
            mutate({
                type: 'updateIncomeReceipt',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                incomeReceiptId: receipt.id,
                expectedVersion: receipt.version,
                receivedOn: date,
                amountCents: amount || '0',
                note: note.trim() || undefined
            });

        if (accepted) onOpenChange(false);
    };

    return (
        <Sheet
            open={open}
            title={`Edit ${plan.name}`}
            onOpenChange={onOpenChange}
            onExitComplete={() => {
                setLoadedId(null);
                onExitComplete();
            }}
        >
            <div className='form-grid'>
                <ReceiptFields
                    amount={amount}
                    amountFill={incomeRemainingFill(
                        plan,
                        amount,
                        receipt.amountCents
                    )}
                    date={date}
                    monthKey={snapshot.monthKey}
                    note={note}
                    onAmountChange={setAmount}
                    onDateChange={setDate}
                    onNoteChange={setNote}
                />
                <button
                    className='primary-button primary-button--wide'
                    type='button'
                    disabled={
                        BigInt(amount || '0') <= 0n ||
                        !dateInMonth(date, snapshot.monthKey)
                    }
                    onClick={submit}
                >
                    Save changes
                </button>
            </div>
        </Sheet>
    );
}
