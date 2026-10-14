'use client';

import { Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { StillInput } from '@/components/ui/still-focus';
import { useScrolledPast } from '@/components/ui/use-scrolled-past';
import { formatCurrency } from '@/domain/money';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import { FloatingAddButton } from '@/components/shared/floating-add-button';
import { useTransactionHoldMenu } from '@/components/shared/transaction-hold-menu';
import { TransactionRow } from '@/components/shared/transaction-row';
import {
    DeletedTransactionRow,
    DeletedTransactionsToggle,
    useDeletedTransactionRestore
} from './recently-deleted';
import {
    filterTransactions,
    type SplitFilter,
    type TransactionEntry,
    type TypeFilter
} from './transaction-filters';
import { TransactionSheet } from './transaction-sheet';

type Filter = TypeFilter;
type TransactionActivityEntry = TransactionEntry;

const filterTabs: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'expense', label: 'Expenses' },
    { value: 'refund', label: 'Income' }
];
const splitFilterTabs: Array<{ value: SplitFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'split', label: 'Split only' },
    { value: 'single', label: 'Not split' }
];

function TransactionFilterTabs({
    className,
    filter,
    onFilterChange
}: {
    className?: string;
    filter: Filter;
    onFilterChange: (filter: Filter) => void;
}) {
    return (
        <div
            className={`filter-tabs${className ? ` ${className}` : ''}`}
            aria-label='Transaction type'
        >
            {filterTabs.map(({ label, value }) => (
                <button
                    className={`filter-tab ${filter === value ? 'active' : ''}`}
                    type='button'
                    key={value}
                    onClick={() => onFilterChange(value)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function SplitFilterTabs({
    filter,
    onFilterChange
}: {
    filter: SplitFilter;
    onFilterChange: (filter: SplitFilter) => void;
}) {
    return (
        <div
            className='filter-tabs transaction-filter-sheet-tabs'
            aria-label='Split status'
        >
            {splitFilterTabs.map(({ label, value }) => (
                <button
                    className={`filter-tab ${filter === value ? 'active' : ''}`}
                    type='button'
                    key={value}
                    onClick={() => onFilterChange(value)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
const money = (entry: ActivityEntry) =>
    `${entry.type === 'expense' ? '−' : '+'}${formatCurrency(entry.amountCents).replace('.00', '')}`;

export function TransactionsView({
    snapshot,
    mutate,
    onDelete
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onDelete: (entry: ActivityEntry) => void;
}) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [itemFilter, setItemFilter] = useState('all');
    const [splitFilter, setSplitFilter] = useState<SplitFilter>('all');
    const [draftFilter, setDraftFilter] = useState<Filter>('all');
    const [draftItemFilter, setDraftItemFilter] = useState('all');
    const [draftSplitFilter, setDraftSplitFilter] =
        useState<SplitFilter>('all');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [showingDeleted, setShowingDeleted] = useState(false);
    const deletedRestore = useDeletedTransactionRestore({
        snapshot,
        mutate,
        onEmptied: () => setShowingDeleted(false)
    });
    const [adding, setAdding] = useState(false);
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const addButtonPassed = useScrolledPast(addButtonRef);
    const [selected, setSelected] = useState<TransactionActivityEntry | null>(
        null
    );
    const [editingOpen, setEditingOpen] = useState(false);
    const editTransaction = (entry: TransactionActivityEntry) => {
        setSelected(entry);
        setEditingOpen(true);
    };
    const holdMenu = useTransactionHoldMenu({
        monthKey: snapshot.monthKey,
        mutate,
        onDelete,
        onEdit: editTransaction
    });
    const validItemIds = useMemo(
        () =>
            new Set(
                snapshot.categories.flatMap((category) =>
                    category.items.map((item) => item.id)
                )
            ),
        [snapshot.categories]
    );
    const effectiveItemFilter =
        itemFilter === 'all' || validItemIds.has(itemFilter)
            ? itemFilter
            : 'all';
    const effectiveDraftItemFilter =
        draftItemFilter === 'all' || validItemIds.has(draftItemFilter)
            ? draftItemFilter
            : 'all';
    const activeFilterCount =
        Number(filter !== 'all') +
        Number(effectiveItemFilter !== 'all') +
        Number(splitFilter !== 'all');
    const criteria = useMemo(
        () => ({
            search,
            type: filter,
            itemId: effectiveItemFilter,
            split: splitFilter
        }),
        [effectiveItemFilter, filter, search, splitFilter]
    );
    const filtered = useMemo(
        () => filterTransactions(snapshot.activity, criteria),
        [criteria, snapshot.activity]
    );
    const filteredDeleted = useMemo(
        () =>
            filterTransactions(
                snapshot.deletedTransactions.toSorted((a, b) =>
                    b.occurredOn.localeCompare(a.occurredOn)
                ),
                criteria
            ),
        [criteria, snapshot.deletedTransactions]
    );
    const groups = useMemo(
        () => Map.groupBy(filtered, (entry) => entry.occurredOn),
        [filtered]
    );
    const deletedGroups = useMemo(
        () => Map.groupBy(filteredDeleted, (entry) => entry.occurredOn),
        [filteredDeleted]
    );
    const clearFilters = () => {
        setFilter('all');
        setItemFilter('all');
        setSplitFilter('all');
    };
    const openFilterSheet = () => {
        setDraftFilter(filter);
        setDraftItemFilter(effectiveItemFilter);
        setDraftSplitFilter(splitFilter);
        setFiltersOpen(true);
    };

    return (
        <section className='screen screen--floating-add standard-screen'>
            <div className='screen-heading-row'>
                <div>
                    <p className='eyebrow'>{snapshot.label}</p>
                    <h1 className='screen-heading'>
                        {showingDeleted ? 'Recently deleted' : 'Transactions'}
                    </h1>
                </div>
                <button
                    ref={addButtonRef}
                    className='primary-button compact-action'
                    type='button'
                    onClick={() => setAdding(true)}
                >
                    <Plus size={19} />
                    Add
                </button>
            </div>
            <div className='activity-toolbar'>
                <div className='search-box'>
                    <Search
                        className='search-box-icon'
                        size={18}
                        aria-hidden='true'
                    />
                    <StillInput
                        aria-label='Search transactions'
                        placeholder='Search transactions'
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    {search ? (
                        <button
                            className='search-clear-button'
                            type='button'
                            aria-label='Clear transaction search'
                            onClick={() => setSearch('')}
                        >
                            <X size={17} strokeWidth={2.2} />
                        </button>
                    ) : null}
                </div>
                <span className='transaction-filter-control'>
                    <button
                        className='icon-button bordered-icon'
                        type='button'
                        data-filtered={activeFilterCount ? 'true' : 'false'}
                        aria-label={
                            activeFilterCount
                                ? `Transaction filters, ${activeFilterCount} active`
                                : 'Transaction filters'
                        }
                        aria-haspopup='dialog'
                        aria-expanded={filtersOpen}
                        onClick={openFilterSheet}
                    >
                        <SlidersHorizontal size={19} />
                    </button>
                    {activeFilterCount ? (
                        <span
                            className='transaction-filter-count'
                            aria-hidden='true'
                        >
                            {activeFilterCount}
                        </span>
                    ) : null}
                </span>
            </div>
            <div className='transaction-filter-summary-row'>
                <TransactionFilterTabs
                    className='transaction-filter-quick-tabs'
                    filter={filter}
                    onFilterChange={setFilter}
                />
                {activeFilterCount ? (
                    <button
                        className='transaction-filter-clear'
                        type='button'
                        aria-label='Clear transaction filters'
                        onClick={clearFilters}
                    >
                        <X size={15} strokeWidth={2.2} />
                        Clear
                    </button>
                ) : null}
                <DeletedTransactionsToggle
                    count={snapshot.deletedTransactions.length}
                    active={showingDeleted}
                    onToggle={() => setShowingDeleted((showing) => !showing)}
                />
            </div>
            {showingDeleted ? (
                <p className='deleted-transactions-caption'>
                    Deleted from {snapshot.label}. Restore puts a transaction
                    back where it was.
                </p>
            ) : null}
            {showingDeleted ? (
                filteredDeleted.length === 0 ? (
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
                ) : (
                    [...deletedGroups.entries()].map(([date, entries]) => (
                        <section key={date}>
                            <h2 className='activity-date'>{dayLabel(date)}</h2>
                            <div className='activity-list'>
                                {entries.map((entry) => (
                                    <DeletedTransactionRow
                                        key={entry.id}
                                        entry={entry}
                                        onRestore={() =>
                                            deletedRestore.restore(entry)
                                        }
                                    />
                                ))}
                            </div>
                        </section>
                    ))
                )
            ) : filtered.length === 0 ? (
                <div className='empty-state'>
                    <Search size={28} />
                    <h2>No matching transactions</h2>
                    <p>Try a different search or add a transaction.</p>
                </div>
            ) : (
                [...groups.entries()].map(([date, entries]) => (
                    <section key={date}>
                        <h2 className='activity-date'>{dayLabel(date)}</h2>
                        <div className='activity-list'>
                            {entries.map((entry) => (
                                <TransactionRow
                                    key={entry.id}
                                    amount={money(entry)}
                                    entry={entry}
                                    holdMenuProps={holdMenu.getRowProps(entry)}
                                    onOpen={() => editTransaction(entry)}
                                />
                            ))}
                        </div>
                    </section>
                ))
            )}
            {deletedRestore.destinationSheet}
            {holdMenu.menu}
            <FloatingAddButton
                visible={addButtonPassed}
                onAdd={() => setAdding(true)}
            />
            <TransactionSheet
                open={adding}
                onOpenChange={setAdding}
                snapshot={snapshot}
                mutate={mutate}
            />
            <Sheet
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                title='Transaction filters'
            >
                <div className='transaction-filter-form'>
                    <div className='field'>
                        <label>Transaction type</label>
                        <TransactionFilterTabs
                            className='transaction-filter-sheet-tabs'
                            filter={draftFilter}
                            onFilterChange={setDraftFilter}
                        />
                    </div>
                    <div className='field'>
                        <label htmlFor='transaction-filter-budget-item'>
                            Budget item
                        </label>
                        <select
                            id='transaction-filter-budget-item'
                            value={effectiveDraftItemFilter}
                            onChange={(event) =>
                                setDraftItemFilter(event.target.value)
                            }
                        >
                            <option value='all'>All budget items</option>
                            {snapshot.categories.map((category) => (
                                <optgroup
                                    key={category.id}
                                    label={category.name}
                                >
                                    {category.items.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className='field'>
                        <label>Split status</label>
                        <SplitFilterTabs
                            filter={draftSplitFilter}
                            onFilterChange={setDraftSplitFilter}
                        />
                    </div>
                    <div className='transaction-filter-actions'>
                        <button
                            className='soft-button'
                            type='button'
                            onClick={() => {
                                setDraftFilter('all');
                                setDraftItemFilter('all');
                                setDraftSplitFilter('all');
                            }}
                        >
                            Clear filters
                        </button>
                        <button
                            className='primary-button'
                            type='button'
                            onClick={() => {
                                setFilter(draftFilter);
                                setItemFilter(effectiveDraftItemFilter);
                                setSplitFilter(draftSplitFilter);
                                setFiltersOpen(false);
                            }}
                        >
                            Apply filters
                        </button>
                    </div>
                </div>
            </Sheet>
            {selected ? (
                <TransactionSheet
                    key={selected.id}
                    open={editingOpen}
                    onOpenChange={setEditingOpen}
                    onExitComplete={() => setSelected(null)}
                    snapshot={snapshot}
                    mutate={mutate}
                    transaction={selected}
                    onDelete={onDelete}
                />
            ) : null}
        </section>
    );
}
