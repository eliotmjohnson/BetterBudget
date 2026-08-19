'use client';

import {
    ChevronRight,
    CircleDollarSign,
    Palette,
    Plus,
    Trash2
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type RefObject
} from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { NavigationDetail } from '@/components/ui/navigation-detail';
import { Sheet } from '@/components/ui/sheet';
import { formatCurrency } from '@/domain/money';
import type {
    CategoryTone,
    IncomePlanView,
    IncomeReceiptView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';
import { CategoryIcon, categoryIconOptions } from './category-icon';

type Mutate = (input: BudgetMutation) => void;
type IncomeIconValue = (typeof categoryIconOptions)[number]['value'];
const incomeHistoryStateKey = 'betterBudgetIncomePlanId';
const incomeHistoryEvent = 'betterbudget:income-history';
const money = (value: string) => formatCurrency(value).replace('.00', '');
const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
const incomeToneOptions: Array<{ value: CategoryTone; label: string }> = [
    { value: 'yellow', label: 'Yellow' },
    { value: 'coral', label: 'Coral' },
    { value: 'blue', label: 'Blue' },
    { value: 'mint', label: 'Mint' },
    { value: 'lilac', label: 'Lilac' }
];

function incomeSourceUrl(planId?: string) {
    const url = new URL(window.location.href);

    if (planId) url.searchParams.set('source', planId);
    else url.searchParams.delete('source');

    return `${url.pathname}${url.search}${url.hash}`;
}

function incomeHistoryState(planId?: string) {
    const current = window.history.state;
    const next =
        current && typeof current === 'object'
            ? { ...(current as Record<string, unknown>) }
            : {};

    if (planId) next[incomeHistoryStateKey] = planId;
    else delete next[incomeHistoryStateKey];

    return next;
}

function incomePlanIdFromLocation() {
    return new URL(window.location.href).searchParams.get('source');
}

function subscribeToIncomeHistory(onStoreChange: () => void) {
    window.addEventListener('popstate', onStoreChange);
    window.addEventListener(incomeHistoryEvent, onStoreChange);

    return () => {
        window.removeEventListener('popstate', onStoreChange);
        window.removeEventListener(incomeHistoryEvent, onStoreChange);
    };
}

function notifyIncomeHistoryChange() {
    window.dispatchEvent(new Event(incomeHistoryEvent));
}

function incomeIconValue(icon: string): IncomeIconValue {
    return categoryIconOptions.some((option) => option.value === icon)
        ? (icon as IncomeIconValue)
        : 'wallet';
}

function IncomeAppearancePicker({
    icon,
    onIconChange,
    onToneChange,
    tone
}: {
    icon: IncomeIconValue;
    onIconChange: (icon: IncomeIconValue) => void;
    onToneChange: (tone: CategoryTone) => void;
    tone: CategoryTone;
}) {
    return (
        <>
            <div className='field'>
                <label>Icon</label>
                <div
                    className='category-icon-picker'
                    role='group'
                    aria-label='Income source icon'
                >
                    {categoryIconOptions.map((option) => (
                        <button
                            className={`category-icon-choice ${icon === option.value ? 'selected' : ''}`}
                            type='button'
                            key={option.value}
                            aria-label={`${option.label} icon`}
                            aria-pressed={icon === option.value}
                            onClick={() => onIconChange(option.value)}
                        >
                            <CategoryIcon icon={option.value} tone={tone} />
                        </button>
                    ))}
                </div>
            </div>
            <div className='field'>
                <label>Color</label>
                <div
                    className='category-tone-picker'
                    role='group'
                    aria-label='Income source color'
                >
                    {incomeToneOptions.map((option) => (
                        <button
                            className={`category-tone-choice tone-${option.value}`}
                            type='button'
                            key={option.value}
                            aria-label={option.label}
                            aria-pressed={tone === option.value}
                            onClick={() => onToneChange(option.value)}
                        >
                            <span />
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

function AddIncomeSource({
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

function RecordIncome({
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

type IncomeDeleteTarget =
    { type: 'receipt'; receipt: IncomeReceiptView } | { type: 'source' };

function EditableIncomeTitle({
    plan,
    snapshot,
    mutate
}: {
    plan: IncomePlanView;
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(plan.name);
    const commit = () => {
        const name = draft.trim();

        if (!name) {
            setDraft(plan.name);
            setEditing(false);

            return;
        }
        if (name !== plan.name)
            mutate({
                type: 'updateIncomePlan',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                incomePlanId: plan.id,
                expectedVersion: plan.version,
                name,
                icon: incomeIconValue(plan.icon),
                tone: plan.tone
            });
        setDraft(name);
        setEditing(false);
    };

    return editing ? (
        <input
            className='navigation-detail-title-input'
            aria-label='Income source name'
            autoFocus
            maxLength={80}
            value={draft}
            onBlur={commit}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(plan.name);
                    setEditing(false);
                }
            }}
        />
    ) : (
        <button
            className='navigation-detail-title-button'
            type='button'
            aria-label={`Rename ${plan.name}`}
            onClick={() => {
                setDraft(plan.name);
                setEditing(true);
            }}
        >
            {plan.name}
        </button>
    );
}

function IncomeSourceDetails({
    plan,
    snapshot,
    mutate,
    onRecordIncome,
    onOpenChange,
    restoreFocusRef,
    restoreFocusVisible
}: {
    plan: IncomePlanView | null;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onRecordIncome: () => void;
    onOpenChange: (open: boolean) => void;
    restoreFocusRef: RefObject<HTMLElement | null>;
    restoreFocusVisible: boolean;
}) {
    const [deleteTarget, setDeleteTarget] = useState<IncomeDeleteTarget | null>(
        null
    );
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [appearanceIcon, setAppearanceIcon] =
        useState<IncomeIconValue>('wallet');
    const [appearanceTone, setAppearanceTone] = useState<CategoryTone>('mint');
    const [previousPlan, setPreviousPlan] = useState<IncomePlanView | null>(
        plan
    );
    const [renderedPlan, setRenderedPlan] = useState<IncomePlanView | null>(
        plan
    );

    if (plan !== previousPlan) {
        setPreviousPlan(plan);
        setDeleteOpen(false);
        setAppearanceOpen(false);
        if (plan) setRenderedPlan(plan);
    }

    if (!renderedPlan) return null;
    const close = () => {
        setDeleteOpen(false);
        setAppearanceOpen(false);
        onOpenChange(false);
    };
    const openAppearance = () => {
        setAppearanceIcon(incomeIconValue(renderedPlan.icon));
        setAppearanceTone(renderedPlan.tone);
        setAppearanceOpen(true);
    };
    const saveAppearance = () => {
        if (
            appearanceIcon !== renderedPlan.icon ||
            appearanceTone !== renderedPlan.tone
        )
            mutate({
                type: 'updateIncomePlan',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                incomePlanId: renderedPlan.id,
                expectedVersion: renderedPlan.version,
                name: renderedPlan.name,
                icon: appearanceIcon,
                tone: appearanceTone
            });
        setAppearanceOpen(false);
    };
    const deleteReceipt = (receipt: IncomeReceiptView) => {
        mutate({
            type: 'deleteIncomeReceipt',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomeReceiptId: receipt.id,
            expectedVersion: receipt.version
        });
        setDeleteOpen(false);
    };
    const deleteSource = () => {
        mutate({
            type: 'deleteIncomePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: renderedPlan.id,
            expectedVersion: renderedPlan.version
        });
        close();
    };
    const receiptTarget =
        deleteTarget?.type === 'receipt' ? deleteTarget.receipt : null;

    return (
        <>
            <NavigationDetail
                backLabel='Income'
                floatingAction={
                    <button
                        className='navigation-detail-add-transaction'
                        type='button'
                        aria-label={`Record income for ${renderedPlan.name}`}
                        aria-haspopup='dialog'
                        onClick={onRecordIncome}
                    >
                        <Plus size={27} strokeWidth={2.25} />
                    </button>
                }
                headerAction={
                    <button
                        className='icon-button income-source-appearance-action'
                        type='button'
                        aria-label='Edit income source appearance'
                        aria-haspopup='dialog'
                        aria-expanded={appearanceOpen}
                        onClick={openAppearance}
                    >
                        <Palette size={20} strokeWidth={1.8} />
                    </button>
                }
                open={plan !== null}
                onOpenChange={(open) => {
                    if (!open) close();
                }}
                restoreFocusRef={restoreFocusRef}
                restoreFocusVisible={restoreFocusVisible}
                title={renderedPlan.name}
                titleContent={
                    <EditableIncomeTitle
                        key={renderedPlan.id}
                        plan={renderedPlan}
                        snapshot={snapshot}
                        mutate={mutate}
                    />
                }
            >
                <div className='income-source-details'>
                    <div className='income-source-stats'>
                        <div>
                            <span>Expected</span>
                            <strong>{money(renderedPlan.expectedCents)}</strong>
                        </div>
                        <div>
                            <span>Received</span>
                            <strong>{money(renderedPlan.receivedCents)}</strong>
                        </div>
                    </div>
                    <h3 className='section-title'>Received transactions</h3>
                    {renderedPlan.receipts.length > 0 ? (
                        <div className='income-receipt-list'>
                            {renderedPlan.receipts.map((receipt) => (
                                <div
                                    className='income-receipt-row'
                                    key={receipt.id}
                                >
                                    <div className='income-receipt-copy'>
                                        <strong>
                                            +{money(receipt.amountCents)}
                                        </strong>
                                        <span>
                                            {dayLabel(receipt.receivedOn)}
                                        </span>
                                        {receipt.note ? (
                                            <span>{receipt.note}</span>
                                        ) : null}
                                    </div>
                                    <button
                                        className='icon-button income-receipt-delete'
                                        type='button'
                                        aria-label={`Delete ${money(receipt.amountCents)} received on ${dayLabel(receipt.receivedOn)}`}
                                        onClick={() => {
                                            setDeleteTarget({
                                                type: 'receipt',
                                                receipt
                                            });
                                            setDeleteOpen(true);
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className='income-receipt-empty'>
                            <strong>No income recorded yet</strong>
                            <span>
                                Received transactions for this source will
                                appear here.
                            </span>
                        </div>
                    )}
                    <div className='income-source-delete'>
                        <button
                            className='text-button danger-text'
                            type='button'
                            disabled={renderedPlan.receipts.length > 0}
                            aria-describedby={
                                renderedPlan.receipts.length > 0
                                    ? 'income-source-delete-help'
                                    : undefined
                            }
                            onClick={() => {
                                setDeleteTarget({ type: 'source' });
                                setDeleteOpen(true);
                            }}
                        >
                            <Trash2 size={17} />
                            Delete income source
                        </button>
                        {renderedPlan.receipts.length > 0 ? (
                            <p id='income-source-delete-help'>
                                Delete the received transactions above before
                                deleting this source.
                            </p>
                        ) : null}
                    </div>
                </div>
            </NavigationDetail>
            <Sheet
                open={plan !== null && appearanceOpen}
                onOpenChange={setAppearanceOpen}
                title='Edit appearance'
            >
                <div className='form-grid'>
                    <div className='category-editor-preview'>
                        <CategoryIcon
                            icon={appearanceIcon}
                            tone={appearanceTone}
                            size={22}
                        />
                        <div>
                            <strong>{renderedPlan.name}</strong>
                            <span>Income source preview</span>
                        </div>
                    </div>
                    <IncomeAppearancePicker
                        icon={appearanceIcon}
                        tone={appearanceTone}
                        onIconChange={setAppearanceIcon}
                        onToneChange={setAppearanceTone}
                    />
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={
                            appearanceIcon === renderedPlan.icon &&
                            appearanceTone === renderedPlan.tone
                        }
                        onClick={saveAppearance}
                    >
                        Save appearance
                    </button>
                </div>
            </Sheet>
            {deleteTarget ? (
                <Sheet
                    open={plan !== null && deleteOpen}
                    onOpenChange={setDeleteOpen}
                    onExitComplete={() => {
                        if (!deleteOpen) setDeleteTarget(null);
                    }}
                    title={
                        receiptTarget
                            ? 'Delete received income?'
                            : 'Delete income source?'
                    }
                >
                    {receiptTarget ? (
                        <div className='form-grid'>
                            <p className='confirmation-copy'>
                                {`Delete ${money(receiptTarget.amountCents)} received on ${dayLabel(receiptTarget.receivedOn)}? This will update the month's received-income total.`}
                            </p>
                            <button
                                className='primary-button primary-button--wide danger-button'
                                type='button'
                                onClick={() => deleteReceipt(receiptTarget)}
                            >
                                Delete received income
                            </button>
                            <button
                                className='text-button'
                                type='button'
                                onClick={() => setDeleteOpen(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className='form-grid'>
                            <p className='confirmation-copy'>
                                {`Delete ${renderedPlan.name} from ${snapshot.label}? Its ${money(renderedPlan.expectedCents)} expected amount will be removed from this month's budget.`}
                            </p>
                            <button
                                className='primary-button primary-button--wide danger-button'
                                type='button'
                                onClick={deleteSource}
                            >
                                Delete income source
                            </button>
                            <button
                                className='text-button'
                                type='button'
                                onClick={() => setDeleteOpen(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </Sheet>
            ) : null}
        </>
    );
}

export function IncomeView({
    snapshot,
    mutate
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const searchParams = useSearchParams();
    const requestedPlanId = useSyncExternalStore(
        subscribeToIncomeHistory,
        incomePlanIdFromLocation,
        () => searchParams.get('source')
    );
    const incomeTriggerRef = useRef<HTMLElement | null>(null);
    const [incomeRestoreFocusVisible, setIncomeRestoreFocusVisible] =
        useState(true);
    const [adding, setAdding] = useState(false);
    const [recordingPlanId, setRecordingPlanId] = useState<string | null>(null);
    const selectedPlan = requestedPlanId
        ? (snapshot.incomePlans.find((plan) => plan.id === requestedPlanId) ??
          null)
        : null;
    const recordingPlan =
        snapshot.incomePlans.find((plan) => plan.id === recordingPlanId) ??
        null;

    useEffect(() => {
        if (!requestedPlanId || selectedPlan) return;

        window.history.replaceState(
            incomeHistoryState(),
            '',
            incomeSourceUrl()
        );
        notifyIncomeHistoryChange();
    }, [requestedPlanId, selectedPlan]);
    const openIncomeSource = (
        plan: IncomePlanView,
        trigger: HTMLButtonElement,
        restoreFocusVisible: boolean
    ) => {
        incomeTriggerRef.current = trigger;
        setIncomeRestoreFocusVisible(restoreFocusVisible);
        window.history.pushState(
            incomeHistoryState(plan.id),
            '',
            incomeSourceUrl(plan.id)
        );
        notifyIncomeHistoryChange();
    };
    const closeIncomeSource = () => {
        const currentState = window.history.state;
        const openedFromIncome =
            currentState &&
            typeof currentState === 'object' &&
            (currentState as Record<string, unknown>)[incomeHistoryStateKey] ===
                requestedPlanId;

        if (openedFromIncome) {
            window.history.back();

            return;
        }
        window.history.replaceState(
            incomeHistoryState(),
            '',
            incomeSourceUrl()
        );
        notifyIncomeHistoryChange();
    };
    const expected = BigInt(snapshot.summary.expectedIncomeCents);
    const received = BigInt(snapshot.summary.receivedIncomeCents);
    const hasSurplus = received > expected;
    const expectedDifference = hasSurplus
        ? received - expected
        : expected - received;
    const progress =
        expected > 0n ? Math.min(100, Number((received * 100n) / expected)) : 0;

    return (
        <section className='screen standard-screen'>
            <div className='screen-heading-row'>
                <div>
                    <p className='eyebrow'>{snapshot.label}</p>
                    <h1 className='screen-heading'>Income</h1>
                </div>
                {snapshot.incomePlans.length > 0 ? (
                    <button
                        className='primary-button compact-action'
                        type='button'
                        onClick={() => setAdding(true)}
                    >
                        <Plus size={19} />
                        Add source
                    </button>
                ) : null}
            </div>
            <div className='summary-card income-summary'>
                <span className='summary-label'>Received</span>
                <strong className='summary-amount'>
                    {money(snapshot.summary.receivedIncomeCents)}
                </strong>
                <div className='summary-stats'>
                    <div className='summary-stat'>
                        <span>Expected</span>
                        <strong>
                            {money(snapshot.summary.expectedIncomeCents)}
                        </strong>
                    </div>
                    <div className='summary-stat'>
                        <span>{hasSurplus ? 'Surplus' : 'Remaining'}</span>
                        <strong className={hasSurplus ? 'positive' : ''}>
                            {money(expectedDifference.toString())}
                        </strong>
                    </div>
                    <div className='summary-stat'>
                        <span>Progress</span>
                        <strong>{progress}%</strong>
                    </div>
                </div>
            </div>
            <h2 className='section-title'>Income sources</h2>
            {snapshot.incomePlans.length === 0 ? (
                <div className='income-empty-state'>
                    <div className='income-empty-state-icon' aria-hidden='true'>
                        <CircleDollarSign size={26} />
                    </div>
                    <h3>No income sources for {snapshot.label} yet</h3>
                    <p>
                        Add a paycheck or another expected source to plan this
                        month&apos;s income. Record each payment when it
                        arrives.
                    </p>
                    <button
                        className='primary-button'
                        type='button'
                        onClick={() => setAdding(true)}
                    >
                        <Plus size={18} />
                        Add income source
                    </button>
                </div>
            ) : (
                <div className='income-list'>
                    {snapshot.incomePlans.map((plan) => {
                        const rowProgress =
                            BigInt(plan.expectedCents) > 0n
                                ? Math.min(
                                      100,
                                      Number(
                                          (BigInt(plan.receivedCents) * 100n) /
                                              BigInt(plan.expectedCents)
                                      )
                                  )
                                : 0;

                        return (
                            <button
                                className='income-row income-row-button'
                                type='button'
                                key={plan.id}
                                onClick={(event) =>
                                    openIncomeSource(
                                        plan,
                                        event.currentTarget,
                                        event.detail === 0
                                    )
                                }
                            >
                                <div className='income-row-top'>
                                    <CategoryIcon
                                        icon={plan.icon}
                                        tone={plan.tone}
                                    />
                                    <div className='activity-copy'>
                                        <strong>{plan.name}</strong>
                                        <span>
                                            Expected {money(plan.expectedCents)}
                                        </span>
                                    </div>
                                    <strong>{money(plan.receivedCents)}</strong>
                                    <ChevronRight size={19} />
                                </div>
                                <div className='income-progress'>
                                    <div style={{ width: `${rowProgress}%` }} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
            <AddIncomeSource
                open={adding}
                onOpenChange={setAdding}
                snapshot={snapshot}
                mutate={mutate}
            />
            <IncomeSourceDetails
                plan={selectedPlan}
                snapshot={snapshot}
                mutate={mutate}
                onRecordIncome={() => {
                    if (selectedPlan) setRecordingPlanId(selectedPlan.id);
                }}
                onOpenChange={(open) => {
                    if (!open) closeIncomeSource();
                }}
                restoreFocusRef={incomeTriggerRef}
                restoreFocusVisible={incomeRestoreFocusVisible}
            />
            <RecordIncome
                plan={recordingPlan}
                snapshot={snapshot}
                mutate={mutate}
                onOpenChange={(open) => {
                    if (!open) setRecordingPlanId(null);
                }}
            />
        </section>
    );
}
