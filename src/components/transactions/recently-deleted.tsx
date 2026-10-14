'use client';

import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast-provider';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import { CategoryIcon } from '@/components/shared/category-icon';
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
    selected,
    onSelectedChange,
    onChooseDestination
}: {
    entry: DeletedTransactionEntry;
    selected: boolean;
    onSelectedChange: (selected: boolean) => void;
    onChooseDestination: () => void;
}) {
    const description = `${entry.title}, ${signedAmount(entry)}, ${shortDay(entry.occurredOn)}`;
    const content = (
        <>
            <TransactionIcon type={entry.type} tone={entry.tone} />
            <span className='activity-copy'>
                <strong>{entry.title}</strong>
                {entry.needsDestination ? null : (
                    <span title={entry.subtitle}>{entry.subtitle}</span>
                )}
                {entry.split ? <span className='split-tag'>Split</span> : null}
            </span>
            <span className={`activity-amount ${entry.type}`}>
                {signedAmount(entry)}
            </span>
        </>
    );

    if (entry.needsDestination)
        return (
            <div
                className='activity-row deleted-transaction-row'
                data-needs-destination='true'
            >
                {content}
                <button
                    className='soft-button deleted-transaction-restore'
                    type='button'
                    aria-haspopup='dialog'
                    aria-label={`Choose an item for ${description}`}
                    onClick={onChooseDestination}
                >
                    Choose item
                </button>
            </div>
        );

    return (
        <label
            className='activity-row deleted-transaction-row'
            data-selected={selected ? 'true' : 'false'}
        >
            {content}
            <input
                className='deleted-transaction-check'
                type='checkbox'
                checked={selected}
                aria-label={`Select ${description}`}
                onChange={(event) =>
                    onSelectedChange(event.currentTarget.checked)
                }
            />
        </label>
    );
}

/**
 * The Recently deleted list: date groups of checkable rows, with a Choose item
 * button instead of a checkbox on rows whose item was deleted.
 */
export function DeletedTransactionsList({
    snapshot,
    entries,
    formatDay,
    restore
}: {
    snapshot: MonthSnapshot;
    entries: DeletedTransactionEntry[];
    formatDay: (date: string) => string;
    restore: DeletedTransactionRestore;
}) {
    if (entries.length === 0)
        return (
            <div className='empty-state'>
                <Trash2 size={28} />
                <h2>
                    {snapshot.deletedTransactions.length === 0
                        ? 'Nothing deleted'
                        : 'No matching deleted transactions'}
                </h2>
                <p>
                    {snapshot.deletedTransactions.length === 0
                        ? `Transactions you delete from ${snapshot.label} show up here.`
                        : 'Try a different search or filter.'}
                </p>
            </div>
        );

    return (
        <>
            <div className='deleted-transactions-caption'>
                <p>Select transactions to put them back.</p>
                {restore.selectableCount > 0 ? (
                    <button
                        className='text-button'
                        type='button'
                        onClick={restore.toggleAll}
                    >
                        {restore.allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                ) : null}
            </div>
            {[...Map.groupBy(entries, (entry) => entry.occurredOn)].map(
                ([date, dayEntries]) => (
                    <section key={date}>
                        <h2 className='activity-date'>{formatDay(date)}</h2>
                        <div className='activity-list'>
                            {dayEntries.map((entry) => (
                                <DeletedTransactionRow
                                    key={entry.id}
                                    entry={entry}
                                    selected={restore.isSelected(entry.id)}
                                    onSelectedChange={(selected) =>
                                        restore.setSelected(entry.id, selected)
                                    }
                                    onChooseDestination={() =>
                                        restore.chooseDestination(entry)
                                    }
                                />
                            ))}
                        </div>
                    </section>
                )
            )}
        </>
    );
}

function RestoreDestinationItem({
    item,
    categoryName,
    onChoose
}: {
    item: BudgetCategoryView['items'][number];
    categoryName: string;
    onChoose: () => void;
}) {
    return (
        <button
            className='restore-destination-item'
            type='button'
            aria-label={`Restore to ${item.name}, ${categoryName}`}
            onClick={onChoose}
        >
            <span className='allocation-picker-item-copy'>
                <strong>{item.name}</strong>
                <span
                    className={
                        BigInt(item.availableCents) < 0n
                            ? 'negative'
                            : undefined
                    }
                >
                    {`${money(item.availableCents)} available`}
                </span>
            </span>
            <RotateCcw size={17} strokeWidth={2.2} aria-hidden='true' />
        </button>
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
            variant='full-screen-mobile'
            showHandle={false}
            headerAccessory={
                <p className='confirmation-copy restore-destination-copy'>
                    {partial
                        ? `${orphaned} of ${entry.title} was on a deleted item. Pick a new one for it; the rest stays put.`
                        : `${entry.title}’s item was deleted. Pick a new one for its ${orphaned}.`}
                </p>
            }
        >
            <div className='restore-destination-sheet'>
                {categories.some((category) => category.items.length > 0) ? (
                    <div className='restore-destination-list'>
                        {categories
                            .filter((category) => category.items.length > 0)
                            .map((category) => (
                                <section
                                    className='restore-destination-category'
                                    key={category.id}
                                >
                                    <h3>
                                        <CategoryIcon
                                            icon={category.icon}
                                            tone={category.tone}
                                            size={15}
                                        />
                                        {category.name}
                                    </h3>
                                    <div className='restore-destination-items'>
                                        {category.items.map((item) => (
                                            <RestoreDestinationItem
                                                key={item.id}
                                                item={item}
                                                categoryName={category.name}
                                                onChoose={() =>
                                                    onChoose(item.id)
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                    </div>
                ) : (
                    <p className='restore-destination-empty'>
                        {snapshotEmptyCopy}
                    </p>
                )}
            </div>
        </Sheet>
    );
}

/**
 * The trash tile: a gray badge counts the month's deleted transactions while
 * the list is closed, and a blue one counts the checked ones while it is open.
 */
export function DeletedTransactionsToggle({
    count,
    selectedCount,
    active,
    onToggle
}: {
    count: number;
    selectedCount: number;
    active: boolean;
    onToggle: () => void;
}) {
    const badge = active ? selectedCount : count;

    return (
        <span className='transaction-filter-control deleted-transactions-control'>
            <button
                className='icon-button bordered-icon'
                type='button'
                data-filtered={active ? 'true' : 'false'}
                aria-pressed={active}
                aria-label={`Recently deleted, ${count} ${count === 1 ? 'transaction' : 'transactions'}${active ? `, ${selectedCount} selected` : ''}`}
                onClick={onToggle}
            >
                <Trash2 size={19} />
            </button>
            {badge > 0 ? (
                <span
                    className='transaction-filter-count'
                    data-tone={active ? undefined : 'muted'}
                    aria-hidden='true'
                >
                    {badge}
                </span>
            ) : null}
        </span>
    );
}

/**
 * Restores the checked deleted transactions in one mutation, or opens Restore
 * to for one whose item was deleted, and calls `onEmptied` when the last one
 * is restored. Only checked rows still in `visible` count as selected.
 */
export function useDeletedTransactionRestore({
    snapshot,
    mutate,
    visible,
    onEmptied
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
    visible: DeletedTransactionEntry[];
    onEmptied: () => void;
}) {
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
        () => new Set()
    );
    const [choosing, setChoosing] = useState<DeletedTransactionEntry | null>(
        null
    );
    const [choosingOpen, setChoosingOpen] = useState(false);
    const showToast = useToast();
    const selectable = visible.filter((entry) => !entry.needsDestination);
    const selected = selectable.filter((entry) => selectedIds.has(entry.id));
    const allSelected =
        selectable.length > 0 && selected.length === selectable.length;
    const finish = (restoredCount: number, message: string) => {
        if (snapshot.deletedTransactions.length === restoredCount) onEmptied();
        showToast({ message });
    };
    const restoreSelected = () => {
        const [first] = selected;

        if (!first) return;
        const sent = mutate({
            type: 'restoreTransactions',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            transactions: selected.map((entry) => ({
                transactionId: entry.id,
                expectedVersion: entry.version
            }))
        });

        if (!sent) return;
        setSelectedIds(new Set());
        finish(
            selected.length,
            selected.length === 1
                ? `${first.title} restored.`
                : `${selected.length} transactions restored.`
        );
    };
    const restoreTo = (
        entry: DeletedTransactionEntry,
        destination: { id: string; name: string }
    ) => {
        const sent = mutate({
            type: 'undoDeleteTransaction',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            transactionId: entry.id,
            expectedVersion: entry.version,
            destinationItemId: destination.id
        });

        if (!sent) return;
        setChoosingOpen(false);
        finish(1, `${entry.title} restored to ${destination.name}.`);
    };
    const itemName = (monthlyItemId: string) =>
        snapshot.categories
            .flatMap((category) => category.items)
            .find((item) => item.id === monthlyItemId)?.name ?? 'budget item';
    const destinationSheet = choosing ? (
        <RestoreDestinationSheet
            key={choosing.id}
            entry={choosing}
            categories={snapshot.categories}
            open={choosingOpen}
            onOpenChange={setChoosingOpen}
            onExitComplete={() => setChoosing(null)}
            onChoose={(monthlyItemId) =>
                restoreTo(choosing, {
                    id: monthlyItemId,
                    name: itemName(monthlyItemId)
                })
            }
        />
    ) : null;

    return {
        allSelected,
        selectableCount: selectable.length,
        selectedCount: selected.length,
        destinationSheet,
        isSelected: (id: string) => selectedIds.has(id),
        setSelected: (id: string, checked: boolean) =>
            setSelectedIds((current) => {
                const next = new Set(current);

                if (checked) next.add(id);
                else next.delete(id);

                return next;
            }),
        toggleAll: () =>
            setSelectedIds(
                allSelected
                    ? new Set()
                    : new Set(selectable.map((entry) => entry.id))
            ),
        clearSelection: () => setSelectedIds(new Set()),
        chooseDestination: (entry: DeletedTransactionEntry) => {
            setChoosing(entry);
            setChoosingOpen(true);
        },
        restoreSelected
    };
}

type DeletedTransactionRestore = ReturnType<
    typeof useDeletedTransactionRestore
>;
