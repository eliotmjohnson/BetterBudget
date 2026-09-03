'use client';

import { ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';
import { AppSwitch } from '@/components/ui/app-switch';
import { CurrencyInput } from '@/components/ui/currency-input';
import { NavigationDetail } from '@/components/ui/navigation-detail';
import { formatCurrencyInput, monthLabel, shiftMonth } from '@/domain/money';
import type {
    ActivityEntry,
    BudgetItemView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { TransactionIcon } from '@/components/shared/transaction-icon';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';

type TransactionActivityEntry = ActivityEntry & {
    type: Exclude<ActivityEntry['type'], 'income'>;
};

const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
const transactionMoney = (entry: ActivityEntry, amountCents: string) =>
    `${entry.type === 'expense' ? '−' : '+'}${money(amountCents)}`;
const isTransactionActivityEntry = (
    entry: ActivityEntry
): entry is TransactionActivityEntry => entry.type !== 'income';

export function PlanInput({
    item,
    monthKey,
    mutate
}: {
    item: BudgetItemView;
    monthKey: MonthSnapshot['monthKey'];
    mutate: Mutate;
}) {
    const [value, setValue] = useState<string>(item.plannedCents);
    const commit = () => {
        const plannedCents = value || '0';

        if (plannedCents === item.plannedCents) return;
        mutate({
            type: 'updatePlan',
            clientMutationId: createUuid(),
            monthKey,
            monthlyItemId: item.id,
            plannedCents,
            expectedVersion: item.version
        });
    };

    return (
        <CurrencyInput
            className='inline-money-input'
            aria-label={`Planned amount for ${item.name}`}
            data-swipe-reveal-allow
            size={Math.max(8, formatCurrencyInput(value).length)}
            value={value}
            onValueChange={setValue}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
            }}
        />
    );
}

export function EditItemForm({
    item,
    snapshot,
    mutate,
    onDeleteTransaction
}: {
    item: BudgetItemView;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onDeleteTransaction: (entry: ActivityEntry) => void;
}) {
    const [planned, setPlanned] = useState<string>(item.plannedCents);
    const [selectedTransaction, setSelectedTransaction] =
        useState<ActivityEntry | null>(null);
    const [editingTransactionOpen, setEditingTransactionOpen] = useState(false);
    const itemTransactions = useMemo(
        () =>
            snapshot.activity.flatMap((entry) => {
                if (!isTransactionActivityEntry(entry)) return [];
                const allocation = entry.allocations?.find(
                    (candidate) => candidate.monthlyItemId === item.id
                );

                return allocation ? [{ entry, allocation }] : [];
            }),
        [item.id, snapshot.activity]
    );
    const transactionGroups = useMemo(
        () => Map.groupBy(itemTransactions, ({ entry }) => entry.occurredOn),
        [itemTransactions]
    );
    const remainingCents = BigInt(item.availableCents);
    const remainingState =
        remainingCents < 0n
            ? 'negative'
            : remainingCents > 0n
              ? 'positive'
              : 'neutral';
    const remainingLabel =
        remainingCents < 0n ? 'Over budget this month' : 'Remaining this month';
    const remainingAmount = money(
        (remainingCents < 0n ? -remainingCents : remainingCents).toString()
    );
    const commitPlanned = () => {
        const plannedCents = planned || '0';

        if (plannedCents === item.plannedCents) return;
        mutate({
            type: 'updatePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            monthlyItemId: item.id,
            plannedCents,
            expectedVersion: item.version
        });
    };

    return (
        <div className='navigation-detail-form'>
            <div className='line-item-remaining' data-state={remainingState}>
                <span className='line-item-remaining-label'>
                    {remainingLabel}
                </span>
                <strong>{remainingAmount}</strong>
                <span className='line-item-remaining-note'>
                    {remainingCents < 0n
                        ? "Beyond this month's available funds"
                        : "Available after this month's activity"}
                </span>
            </div>
            <div className='field'>
                <label htmlFor='item-planned'>Planned amount</label>
                <CurrencyInput
                    id='item-planned'
                    value={planned}
                    onValueChange={setPlanned}
                    onBlur={commitPlanned}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                />
            </div>
            <div className='switch-row'>
                <div>
                    <strong>Carry over</strong>
                    <span>Add any remaining balance next month</span>
                </div>
                <AppSwitch
                    accessibilityLabel='Carry over remaining balance'
                    checked={item.carryoverEnabled}
                    onCheckedChange={(enabled) =>
                        mutate({
                            type: 'toggleCarryover',
                            clientMutationId: createUuid(),
                            monthKey: snapshot.monthKey,
                            monthlyItemId: item.id,
                            enabled,
                            expectedVersion: item.version
                        })
                    }
                    variant='carryover'
                />
            </div>
            {BigInt(item.carryInCents) !== 0n || item.carryoverEnabled ? (
                <div className='carryover-callout'>
                    <div className='carryover-callout-row'>
                        <span>
                            Carried over from{' '}
                            {monthLabel(shiftMonth(snapshot.monthKey, -1))}
                        </span>
                        <strong>{money(item.carryInCents)}</strong>
                    </div>
                    {item.carryoverEnabled ? (
                        <div className='carryover-callout-row'>
                            <span>
                                Will carry over to{' '}
                                {monthLabel(shiftMonth(snapshot.monthKey, 1))}
                            </span>
                            <strong>{money(item.availableCents)}</strong>
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className='navigation-detail-activity'>
                <h3 className='section-title'>Transactions</h3>
                <div className='navigation-detail-transaction-scroll'>
                    {itemTransactions.length === 0 ? (
                        <div className='navigation-detail-empty'>
                            <strong>No transactions this month</strong>
                            <span>
                                Activity assigned to {item.name} will appear
                                here.
                            </span>
                        </div>
                    ) : (
                        [...transactionGroups.entries()].map(([date, rows]) => (
                            <section key={date}>
                                <h4 className='activity-date'>
                                    {dayLabel(date)}
                                </h4>
                                <div className='activity-list'>
                                    {rows.map(({ entry, allocation }) => (
                                        <button
                                            className='activity-row navigation-detail-transaction-row'
                                            type='button'
                                            key={entry.id}
                                            onClick={() => {
                                                setSelectedTransaction(entry);
                                                setEditingTransactionOpen(true);
                                            }}
                                        >
                                            <TransactionIcon
                                                type={entry.type}
                                                tone={entry.tone}
                                            />
                                            <span className='activity-copy'>
                                                <strong>{entry.title}</strong>
                                                <span title={entry.subtitle}>
                                                    {entry.subtitle}
                                                </span>
                                                {entry.split ? (
                                                    <span className='split-tag'>
                                                        Split
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span
                                                className={`activity-amount ${entry.type}`}
                                            >
                                                {transactionMoney(
                                                    entry,
                                                    allocation.amountCents
                                                )}
                                            </span>
                                            <ChevronRight
                                                size={17}
                                                color='#a2a7af'
                                            />
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </div>
            </div>
            {selectedTransaction ? (
                <TransactionSheet
                    key={selectedTransaction.id}
                    open={editingTransactionOpen}
                    onOpenChange={setEditingTransactionOpen}
                    onExitComplete={() => setSelectedTransaction(null)}
                    snapshot={snapshot}
                    mutate={mutate}
                    transaction={selectedTransaction}
                    onDelete={onDeleteTransaction}
                    variant='full-screen-mobile'
                />
            ) : null}
        </div>
    );
}

export function EditableItemTitle({
    item,
    snapshot,
    mutate
}: {
    item: BudgetItemView;
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item.name);
    const commit = () => {
        const name = draft.trim();

        if (!name) {
            setDraft(item.name);
            setEditing(false);

            return;
        }
        if (name !== item.name)
            mutate({
                type: 'renameItem',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                itemId: item.definitionId,
                name,
                expectedVersion: item.definitionVersion
            });
        setDraft(name);
        setEditing(false);
    };

    return editing ? (
        <input
            className='navigation-detail-title-input'
            aria-label='Line item name'
            autoFocus
            maxLength={80}
            value={draft}
            onBlur={commit}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(item.name);
                    setEditing(false);
                }
            }}
        />
    ) : (
        <button
            className='navigation-detail-title-button navigation-detail-title-button--wrap'
            type='button'
            aria-label={`Rename ${item.name}`}
            onClick={() => {
                setDraft(item.name);
                setEditing(true);
            }}
        >
            {item.name}
        </button>
    );
}

export function EditItemDetails({
    item,
    snapshot,
    mutate,
    onDeleteTransaction,
    onOpenChange,
    restoreFocusRef
}: {
    item: BudgetItemView | null;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onDeleteTransaction: (entry: ActivityEntry) => void;
    onOpenChange: (open: boolean) => void;
    restoreFocusRef: RefObject<HTMLElement | null>;
}) {
    const [addingTransactionOpen, setAddingTransactionOpen] = useState(false);
    const [previousItem, setPreviousItem] = useState<BudgetItemView | null>(
        item
    );
    const [renderedItem, setRenderedItem] = useState<BudgetItemView | null>(
        item
    );

    if (item !== previousItem) {
        setPreviousItem(item);
        setAddingTransactionOpen(false);
        if (item) setRenderedItem(item);
    }

    if (!renderedItem) return null;

    return (
        <NavigationDetail
            floatingAction={
                <button
                    className='navigation-detail-add-transaction'
                    type='button'
                    aria-label={`Add transaction for ${renderedItem.name}`}
                    aria-haspopup='dialog'
                    aria-expanded={addingTransactionOpen}
                    onClick={() => setAddingTransactionOpen(true)}
                >
                    <Plus size={27} strokeWidth={2.25} />
                </button>
            }
            open={item !== null}
            onOpenChange={onOpenChange}
            restoreFocusRef={restoreFocusRef}
            title={renderedItem.name}
            titleContent={
                <EditableItemTitle
                    key={renderedItem.definitionId}
                    item={renderedItem}
                    snapshot={snapshot}
                    mutate={mutate}
                />
            }
        >
            <EditItemForm
                key={renderedItem.id}
                item={renderedItem}
                snapshot={snapshot}
                mutate={mutate}
                onDeleteTransaction={onDeleteTransaction}
            />
            <TransactionSheet
                key={`add-${renderedItem.id}`}
                initialItemId={renderedItem.id}
                open={item !== null && addingTransactionOpen}
                onOpenChange={setAddingTransactionOpen}
                snapshot={snapshot}
                mutate={mutate}
                variant='full-screen-mobile'
            />
        </NavigationDetail>
    );
}
