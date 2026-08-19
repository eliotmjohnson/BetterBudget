'use client';

import { ChevronRight, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { formatCurrency } from '@/domain/money';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';
import { TransactionIcon } from './transaction-icon';
import { TransactionSheet } from './transaction-sheet';

type Mutate = (input: BudgetMutation) => void;
type Filter = 'all' | 'expense' | 'refund';
type SplitFilter = 'all' | 'split' | 'single';
type TransactionActivityEntry = ActivityEntry & {
    type: Exclude<ActivityEntry['type'], 'income'>;
};

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
    const [adding, setAdding] = useState(false);
    const [selected, setSelected] = useState<TransactionActivityEntry | null>(
        null
    );
    const [editingOpen, setEditingOpen] = useState(false);
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
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();

        return snapshot.activity.filter(
            (entry): entry is TransactionActivityEntry => {
                if (entry.type === 'income') return false;
                const matchesFilter = filter === 'all' || entry.type === filter;
                const matchesItem =
                    effectiveItemFilter === 'all' ||
                    (entry.allocations?.some(
                        (allocation) =>
                            allocation.monthlyItemId === effectiveItemFilter
                    ) ??
                        false);
                const matchesSplit =
                    splitFilter === 'all' ||
                    (splitFilter === 'split' ? entry.split : !entry.split);

                return (
                    matchesFilter &&
                    matchesItem &&
                    matchesSplit &&
                    (!query ||
                        `${entry.title} ${entry.subtitle} ${entry.note ?? ''}`
                            .toLocaleLowerCase()
                            .includes(query))
                );
            }
        );
    }, [effectiveItemFilter, filter, search, snapshot.activity, splitFilter]);
    const groups = useMemo(
        () => Map.groupBy(filtered, (entry) => entry.occurredOn),
        [filtered]
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
        <section className='screen standard-screen'>
            <div className='screen-heading-row'>
                <div>
                    <p className='eyebrow'>{snapshot.label}</p>
                    <h1 className='screen-heading'>Transactions</h1>
                </div>
                <button
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
                    <input
                        aria-label='Search transactions'
                        placeholder='Search merchant, item, or note'
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
                    {activeFilterCount ? (
                        <span
                            className='transaction-filter-count'
                            aria-hidden='true'
                        >
                            {activeFilterCount}
                        </span>
                    ) : null}
                </button>
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
            </div>
            {filtered.length === 0 ? (
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
                                <button
                                    className='activity-row'
                                    type='button'
                                    key={entry.id}
                                    onClick={() => {
                                        setSelected(entry);
                                        setEditingOpen(true);
                                    }}
                                >
                                    <TransactionIcon
                                        type={entry.type}
                                        tone={entry.tone}
                                    />
                                    <span className='activity-copy'>
                                        <strong>{entry.title}</strong>
                                        <span>{entry.subtitle}</span>
                                        {entry.split ? (
                                            <span className='split-tag'>
                                                Split
                                            </span>
                                        ) : null}
                                    </span>
                                    <span
                                        className={`activity-amount ${entry.type}`}
                                    >
                                        {money(entry)}
                                    </span>
                                    <ChevronRight size={17} color='#a2a7af' />
                                </button>
                            ))}
                        </div>
                    </section>
                ))
            )}
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
