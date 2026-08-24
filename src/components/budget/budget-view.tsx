'use client';

import {
    ChevronDown,
    ChevronRight,
    Copy,
    MoreHorizontal,
    Plus,
    Trash2
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type RefObject
} from 'react';
import { AppSwitch } from '@/components/ui/app-switch';
import { CurrencyInput } from '@/components/ui/currency-input';
import { NavigationDetail } from '@/components/ui/navigation-detail';
import { Sheet } from '@/components/ui/sheet';
import {
    useSortableList,
    type SortLongPressProps
} from '@/components/ui/sortable-list';
import { SwipeReveal } from '@/components/ui/swipe-reveal';
import {
    formatCurrency,
    formatCurrencyInput,
    monthLabel,
    shiftMonth
} from '@/domain/money';
import type { BudgetAmountView } from '@/domain/budget-preferences';
import type {
    ActivityEntry,
    BudgetCategoryView,
    BudgetItemView,
    CategoryTone,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';
import { CategoryIcon, categoryIconOptions } from './category-icon';
import {
    CategoryDetailsFields,
    type CategoryIconValue
} from './category-details-fields';
import { TransactionIcon } from './transaction-icon';
import { TransactionSheet } from './transaction-sheet';

type Mutate = (input: BudgetMutation) => void;
type DeleteItemTarget = { category: BudgetCategoryView; item: BudgetItemView };
type CategoryDeleteState = 'closed' | 'open' | 'closing';
type TransactionActivityEntry = ActivityEntry & {
    type: Exclude<ActivityEntry['type'], 'income'>;
};

const itemHistoryStateKey = 'betterBudgetItemDefinitionId';
const itemHistoryEvent = 'betterbudget:item-history';
const money = (value: string) => formatCurrency(value).replace('.00', '');
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
const remainingAvailableProgress = (remaining: bigint, spent: bigint) => {
    if (remaining <= 0n) return 0;
    const startingAvailable = remaining + spent;

    if (startingAvailable <= 0n) return 100;
    const basisPoints =
        (remaining * 10_000n + startingAvailable / 2n) / startingAvailable;

    return Math.min(100, Number(basisPoints) / 100);
};

function itemUrl(definitionId?: string) {
    const url = new URL(window.location.href);

    if (definitionId) url.searchParams.set('item', definitionId);
    else url.searchParams.delete('item');

    return `${url.pathname}${url.search}${url.hash}`;
}

function itemHistoryState(definitionId?: string) {
    const current = window.history.state;
    const next =
        current && typeof current === 'object'
            ? { ...(current as Record<string, unknown>) }
            : {};

    if (definitionId) next[itemHistoryStateKey] = definitionId;
    else delete next[itemHistoryStateKey];

    return next;
}

function itemDefinitionIdFromLocation() {
    return new URL(window.location.href).searchParams.get('item');
}

function subscribeToItemHistory(onStoreChange: () => void) {
    window.addEventListener('popstate', onStoreChange);
    window.addEventListener(itemHistoryEvent, onStoreChange);

    return () => {
        window.removeEventListener('popstate', onStoreChange);
        window.removeEventListener(itemHistoryEvent, onStoreChange);
    };
}

function notifyItemHistoryChange() {
    window.dispatchEvent(new Event(itemHistoryEvent));
}

function PlanInput({
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

function EditItemForm({
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

function EditableItemTitle({
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

function EditItemDetails({
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

function BudgetCategorySection({
    amountView,
    category,
    categoryLongPressProps,
    collapsed,
    mutate,
    onAddItem,
    onDeleteItem,
    onEditCategory,
    onSelectItem,
    onToggle,
    snapshot
}: {
    amountView: BudgetAmountView;
    category: BudgetCategoryView;
    categoryLongPressProps: SortLongPressProps;
    collapsed: boolean;
    mutate: Mutate;
    onAddItem: (category: BudgetCategoryView) => void;
    onDeleteItem: (category: BudgetCategoryView, item: BudgetItemView) => void;
    onEditCategory: (category: BudgetCategoryView) => void;
    onSelectItem: (item: BudgetItemView, trigger: HTMLButtonElement) => void;
    onToggle: (categoryId: string) => void;
    snapshot: MonthSnapshot;
}) {
    const pendingCategory = category.id.startsWith('optimistic-');
    const {
        containerRef: itemContainerRef,
        getKeyboardProps: getItemKeyboardProps,
        getLongPressProps: getItemLongPressProps,
        orderedItems
    } = useSortableList({
        items: category.items,
        getId: (item) => item.definitionId,
        getLabel: (item) => `${item.name} budget item`,
        onReorder: (itemIds) =>
            mutate({
                type: 'reorderItems',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                categoryId: category.id,
                itemIds
            }),
        previewSelector: '.swipe-reveal-content'
    });

    return (
        <section className={`category-section tone-${category.tone}`}>
            <div className='category-header' {...categoryLongPressProps}>
                <button
                    className='category-toggle'
                    type='button'
                    aria-expanded={!collapsed}
                    onClick={() => onToggle(category.id)}
                >
                    <CategoryIcon icon={category.icon} tone={category.tone} />
                    <span className='category-title'>{category.name}</span>
                    <ChevronDown
                        size={18}
                        style={{
                            transform: collapsed ? 'rotate(-90deg)' : 'none',
                            transition: 'transform 160ms ease'
                        }}
                    />
                </button>
                <button
                    className='icon-button category-edit-button'
                    data-sort-long-press-ignore
                    type='button'
                    disabled={pendingCategory}
                    aria-label={`Edit ${category.name} category`}
                    onClick={() => onEditCategory(category)}
                >
                    <MoreHorizontal size={20} />
                </button>
            </div>
            {collapsed ? null : (
                <>
                    <div className='column-labels'>
                        <span>Budget item</span>
                        <span>
                            {amountView === 'planned' ? 'Planned' : 'Available'}
                        </span>
                    </div>
                    <div
                        ref={itemContainerRef}
                        className='budget-item-sortable-list'
                        role='list'
                    >
                        {orderedItems.map((item) => {
                            const available = BigInt(item.availableCents);
                            const fill = remainingAvailableProgress(
                                available,
                                BigInt(item.spentCents)
                            );
                            const overBudget = available < 0n;
                            const pendingItem =
                                item.definitionId.startsWith('optimistic-');

                            return (
                                <div
                                    className='budget-item-sortable-item'
                                    data-sortable-item='true'
                                    data-sortable-id={item.definitionId}
                                    key={item.definitionId}
                                    role='listitem'
                                >
                                    <button
                                        className='sortable-keyboard-control'
                                        type='button'
                                        {...getItemKeyboardProps(
                                            item,
                                            pendingItem
                                        )}
                                    >
                                        Reorder {item.name}
                                    </button>
                                    <SwipeReveal
                                        actionLabel={`Delete ${item.name} budget item`}
                                        disabled={pendingItem}
                                        onAction={() =>
                                            onDeleteItem(category, item)
                                        }
                                    >
                                        <div
                                            className='budget-row'
                                            {...getItemLongPressProps(
                                                item,
                                                pendingItem
                                            )}
                                        >
                                            <div className='budget-row-grid'>
                                                <button
                                                    className='budget-item-button'
                                                    type='button'
                                                    onClick={(event) =>
                                                        onSelectItem(
                                                            item,
                                                            event.currentTarget
                                                        )
                                                    }
                                                >
                                                    {item.name}
                                                </button>
                                                {amountView === 'planned' ? (
                                                    <PlanInput
                                                        key={`${item.id}:${item.plannedCents}`}
                                                        item={item}
                                                        monthKey={
                                                            snapshot.monthKey
                                                        }
                                                        mutate={mutate}
                                                    />
                                                ) : (
                                                    <button
                                                        className={`money-cell money-cell-button ${BigInt(item.availableCents) < 0n ? 'available-negative' : BigInt(item.availableCents) > 0n ? 'available-positive' : ''}`}
                                                        type='button'
                                                        aria-label={`Open ${item.name}, ${money(item.availableCents)} remaining`}
                                                        onClick={(event) =>
                                                            onSelectItem(
                                                                item,
                                                                event.currentTarget
                                                            )
                                                        }
                                                    >
                                                        {money(
                                                            item.availableCents
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                            <div
                                                className={
                                                    overBudget
                                                        ? 'progress-track progress-track--negative'
                                                        : 'progress-track'
                                                }
                                                role='progressbar'
                                                aria-label={`${item.name} remaining`}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.round(fill)}
                                                aria-valuetext={
                                                    overBudget
                                                        ? `${money((-available).toString())} over budget`
                                                        : `${money(item.availableCents)} remaining`
                                                }
                                            >
                                                <div
                                                    className='progress-fill'
                                                    style={{
                                                        width: `${fill}%`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </SwipeReveal>
                                </div>
                            );
                        })}
                    </div>
                    {category.items.length === 0 ? (
                        <p className='budget-empty-category'>
                            No budget items yet.
                        </p>
                    ) : null}
                    <button
                        className='budget-add-item'
                        type='button'
                        disabled={pendingCategory}
                        onClick={() => onAddItem(category)}
                    >
                        <Plus size={17} />
                        Add budget item
                    </button>
                </>
            )}
        </section>
    );
}

export function BudgetView({
    amountView,
    animationKey,
    mutationPending,
    snapshot,
    mutate,
    onAmountViewChange,
    onDeleteTransaction
}: {
    amountView: BudgetAmountView;
    animationKey: number;
    mutationPending: boolean;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onAmountViewChange: (amountView: BudgetAmountView) => void;
    onDeleteTransaction: (entry: ActivityEntry) => void;
}) {
    const searchParams = useSearchParams();
    const requestedItemDefinitionId = useSyncExternalStore(
        subscribeToItemHistory,
        itemDefinitionIdFromLocation,
        () => searchParams.get('item')
    );
    const budgetLayoutRef = useRef<HTMLElement>(null);
    const previousAnimationKeyRef = useRef(animationKey);
    const summaryArcProgressRef = useRef<SVGPathElement>(null);
    const itemTriggerRef = useRef<HTMLElement | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [transactionOpen, setTransactionOpen] = useState(false);
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [itemCategory, setItemCategory] = useState<BudgetCategoryView | null>(
        null
    );
    const [editedCategory, setEditedCategory] =
        useState<BudgetCategoryView | null>(null);
    const [categoryDeleteState, setCategoryDeleteState] =
        useState<CategoryDeleteState>('closed');
    const [categoryName, setCategoryName] = useState('');
    const [categoryIcon, setCategoryIcon] =
        useState<CategoryIconValue>('sparkles');
    const [categoryTone, setCategoryTone] = useState<CategoryTone>('blue');
    const [deleteItemTarget, setDeleteItemTarget] =
        useState<DeleteItemTarget | null>(null);
    const [newName, setNewName] = useState('');
    const [newCategoryIcon, setNewCategoryIcon] =
        useState<CategoryIconValue>('sparkles');
    const [newCategoryTone, setNewCategoryTone] =
        useState<CategoryTone>('blue');
    const [newPlanned, setNewPlanned] = useState('');
    const selectedItem = requestedItemDefinitionId
        ? (snapshot.categories
              .flatMap((category) => category.items)
              .find(
                  (item) => item.definitionId === requestedItemDefinitionId
              ) ?? null)
        : null;

    useLayoutEffect(() => {
        const layout = budgetLayoutRef.current;

        if (!layout) return;
        const shouldRestartAnimation =
            previousAnimationKeyRef.current !== animationKey;

        previousAnimationKeyRef.current = animationKey;
        if (shouldRestartAnimation) {
            layout.classList.remove('budget-bars-enter');
            void layout.offsetWidth;
            layout.classList.add('budget-bars-enter');
        }
        const timer = window.setTimeout(
            () => layout.classList.remove('budget-bars-enter'),
            1_250
        );

        return () => window.clearTimeout(timer);
    }, [animationKey]);
    useEffect(() => {
        if (!requestedItemDefinitionId || selectedItem) return;

        window.history.replaceState(itemHistoryState(), '', itemUrl());
        notifyItemHistoryChange();
    }, [requestedItemDefinitionId, selectedItem]);
    const summaryAvailable = snapshot.categories.reduce(
        (total, category) => total + BigInt(category.availableCents),
        0n
    );
    const summarySpent = BigInt(snapshot.summary.spentCents);
    const leftToBudgetCents = BigInt(snapshot.summary.leftToBudgetCents);
    const isOverBudget = leftToBudgetCents < 0n;
    const budgetBalanceLabel = isOverBudget ? 'Over budget' : 'Left to budget';
    const budgetBalance = money(
        (isOverBudget ? -leftToBudgetCents : leftToBudgetCents).toString()
    );
    const summaryArcOverflow = Math.max(0, budgetBalance.length - 6);
    const summaryArcStyle = {
        '--summary-arc-width': `${Math.min(
            310,
            232 + summaryArcOverflow * 26
        )}px`,
        '--summary-amount-size': `${Math.max(
            36,
            50 - Math.max(0, budgetBalance.length - 9) * 3
        )}px`
    } as CSSProperties;
    const progress = remainingAvailableProgress(summaryAvailable, summarySpent);
    const summaryArcProgressAngle = Math.PI + (Math.PI * progress) / 100;
    const summaryArcProgressEndX = 116 + 98 * Math.cos(summaryArcProgressAngle);
    const summaryArcProgressEndY = 108 + 98 * Math.sin(summaryArcProgressAngle);

    useLayoutEffect(() => {
        const path = summaryArcProgressRef.current;

        if (!path) return;
        const updateProgressLength = () => {
            const matrix = path.getScreenCTM();

            if (!matrix) return;
            const pathLength = path.getTotalLength();
            const sampleCount = 64;
            const firstPoint = path.getPointAtLength(0);
            let previousX = matrix.a * firstPoint.x + matrix.c * firstPoint.y;
            let previousY = matrix.b * firstPoint.x + matrix.d * firstPoint.y;
            let renderedLength = 0;

            for (let index = 1; index <= sampleCount; index += 1) {
                const point = path.getPointAtLength(
                    (pathLength * index) / sampleCount
                );
                const x = matrix.a * point.x + matrix.c * point.y;
                const y = matrix.b * point.x + matrix.d * point.y;

                renderedLength += Math.hypot(x - previousX, y - previousY);
                previousX = x;
                previousY = y;
            }
            path.style.setProperty(
                '--summary-arc-progress-length',
                `${renderedLength}px`
            );
        };

        updateProgressLength();
        const resizeObserver = new ResizeObserver(updateProgressLength);

        if (path.ownerSVGElement) resizeObserver.observe(path.ownerSVGElement);

        return () => resizeObserver.disconnect();
    }, [progress]);
    const {
        containerRef: categoryContainerRef,
        getKeyboardProps: getCategoryKeyboardProps,
        getLongPressProps: getCategoryLongPressProps,
        orderedItems: orderedCategories
    } = useSortableList({
        items: snapshot.categories,
        getId: (category) => category.id,
        getLabel: (category) => `${category.name} category`,
        onReorder: (categoryIds) =>
            mutate({
                type: 'reorderCategories',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                categoryIds
            }),
        previewSelector: '.category-header'
    });
    const openCategoryCreator = () => {
        setNewName('');
        setNewCategoryIcon('sparkles');
        setNewCategoryTone('blue');
        setCategoryOpen(true);
    };
    const copyPreviousMonth = () =>
        mutate({
            type: 'copyPreviousMonth',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey
        });
    const addCategory = () => {
        const name = newName.trim();

        if (!name) return;
        mutate({
            type: 'addCategory',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            name,
            icon: newCategoryIcon,
            tone: newCategoryTone
        });
        setCategoryOpen(false);
    };
    const addItem = () => {
        if (!itemCategory) return;
        const name = newName.trim();

        if (!name) return;
        mutate({
            type: 'addItem',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            categoryId: itemCategory.id,
            name,
            plannedCents: newPlanned || '0'
        });
        setItemCategory(null);
    };
    const openCategoryEditor = (category: BudgetCategoryView) => {
        setCategoryName(category.name);
        setCategoryIcon(
            categoryIconOptions.some((option) => option.value === category.icon)
                ? (category.icon as CategoryIconValue)
                : 'wallet'
        );
        setCategoryTone(category.tone);
        setCategoryDeleteState('closed');
        setEditedCategory(category);
    };
    const saveCategory = () => {
        if (!editedCategory) return;
        const name = categoryName.trim();

        if (!name) return;
        if (
            name !== editedCategory.name ||
            categoryIcon !== editedCategory.icon ||
            categoryTone !== editedCategory.tone
        ) {
            mutate({
                type: 'renameCategory',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                categoryId: editedCategory.id,
                name,
                icon: categoryIcon,
                tone: categoryTone,
                expectedVersion: editedCategory.version
            });
        }
        setEditedCategory(null);
    };
    const deleteCategory = () => {
        if (!editedCategory) return;
        mutate({
            type: 'archiveCategory',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            categoryId: editedCategory.id,
            expectedVersion: editedCategory.version
        });
        setCategoryDeleteState('closed');
        setEditedCategory(null);
    };
    const deleteItem = () => {
        if (!deleteItemTarget) return;
        mutate({
            type: 'archiveItem',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            itemId: deleteItemTarget.item.definitionId,
            expectedVersion: deleteItemTarget.item.definitionVersion
        });
        setDeleteItemTarget(null);
    };
    const openItemDetails = (
        item: BudgetItemView,
        trigger: HTMLButtonElement
    ) => {
        itemTriggerRef.current = trigger;
        window.history.pushState(
            itemHistoryState(item.definitionId),
            '',
            itemUrl(item.definitionId)
        );
        notifyItemHistoryChange();
    };
    const closeItemDetails = () => {
        const currentState = window.history.state;
        const openedFromBudget =
            currentState &&
            typeof currentState === 'object' &&
            (currentState as Record<string, unknown>)[itemHistoryStateKey] ===
                requestedItemDefinitionId;

        if (openedFromBudget) {
            window.history.back();

            return;
        }
        window.history.replaceState(itemHistoryState(), '', itemUrl());
        notifyItemHistoryChange();
    };

    return (
        <section
            ref={budgetLayoutRef}
            className='screen budget-layout budget-bars-enter'
        >
            <div className='budget-main'>
                <div className='summary-card budget-summary'>
                    <div className='summary-arc' style={summaryArcStyle}>
                        <svg
                            viewBox='0 0 232 118'
                            preserveAspectRatio='none'
                            aria-hidden='true'
                        >
                            <path
                                d='M18 108 A98 98 0 0 1 214 108'
                                pathLength='100'
                                fill='none'
                                stroke='#eef0f3'
                                strokeWidth='18'
                                strokeLinecap='round'
                                vectorEffect='non-scaling-stroke'
                            />
                            {progress > 0 ? (
                                <path
                                    ref={summaryArcProgressRef}
                                    className='summary-arc-progress'
                                    d={`M18 108 A98 98 0 0 1 ${summaryArcProgressEndX} ${summaryArcProgressEndY}`}
                                    fill='none'
                                    stroke='#5a91ed'
                                    strokeWidth='18'
                                    strokeLinecap='round'
                                    vectorEffect='non-scaling-stroke'
                                />
                            ) : null}
                        </svg>
                        <div className='summary-focus'>
                            <span className='summary-label'>
                                {budgetBalanceLabel}
                            </span>
                            <strong
                                className={`summary-amount${isOverBudget ? ' budget-balance-over' : ''}`}
                            >
                                {budgetBalance}
                            </strong>
                        </div>
                    </div>
                    <div className='desktop-summary-copy'>
                        <span className='summary-label'>
                            {budgetBalanceLabel}
                        </span>
                        <strong
                            className={`summary-amount${isOverBudget ? ' budget-balance-over' : ''}`}
                        >
                            {budgetBalance}
                        </strong>
                    </div>
                    <div className='desktop-bars' aria-label='Month totals'>
                        <div className='desktop-bar'>
                            <div
                                className='desktop-bar-fill'
                                style={{
                                    height: '92px',
                                    background: 'var(--mint)'
                                }}
                            />
                            <span>Income</span>
                            <strong>
                                {money(snapshot.summary.expectedIncomeCents)}
                            </strong>
                        </div>
                        <div className='desktop-bar'>
                            <div
                                className='desktop-bar-fill'
                                style={{
                                    height: '82px',
                                    background: 'var(--sky)'
                                }}
                            />
                            <span>Planned</span>
                            <strong>
                                {money(snapshot.summary.plannedCents)}
                            </strong>
                        </div>
                        <div className='desktop-bar'>
                            <div
                                className='desktop-bar-fill'
                                style={{
                                    height: '61px',
                                    background: 'var(--coral)'
                                }}
                            />
                            <span>Spent</span>
                            <strong>
                                {money(snapshot.summary.spentCents)}
                            </strong>
                        </div>
                        <div className='desktop-bar'>
                            <div
                                className='desktop-bar-fill'
                                style={{
                                    height: '14px',
                                    background: 'var(--blue)'
                                }}
                            />
                            <span>{isOverBudget ? 'Over' : 'Left'}</span>
                            <strong
                                className={
                                    isOverBudget
                                        ? 'budget-balance-over'
                                        : undefined
                                }
                            >
                                {budgetBalance}
                            </strong>
                        </div>
                    </div>
                    <div className='summary-stats'>
                        <div className='summary-stat'>
                            <span>Income</span>
                            <strong>
                                {money(snapshot.summary.expectedIncomeCents)}
                            </strong>
                        </div>
                        <div className='summary-stat'>
                            <span>Planned</span>
                            <strong>
                                {money(snapshot.summary.plannedCents)}
                            </strong>
                        </div>
                        <div className='summary-stat'>
                            <span>Spent</span>
                            <strong>
                                {money(snapshot.summary.spentCents)}
                            </strong>
                        </div>
                    </div>
                </div>
                {snapshot.categories.length === 0 ? (
                    <div className='budget-empty-month'>
                        <div
                            className='budget-empty-month-icon'
                            aria-hidden='true'
                        >
                            <Copy size={24} />
                        </div>
                        <h2>Nothing budgeted for {snapshot.label} yet</h2>
                        <p>
                            Copy {monthLabel(shiftMonth(snapshot.monthKey, -1))}
                            &apos;s budget to bring its categories and line
                            items forward, or start fresh with a new budget
                            category.
                        </p>
                        <div className='budget-empty-month-actions'>
                            <button
                                className='primary-button'
                                type='button'
                                disabled={mutationPending}
                                onClick={copyPreviousMonth}
                            >
                                <Copy size={18} />
                                {mutationPending
                                    ? 'Copying budget…'
                                    : `Copy ${monthLabel(shiftMonth(snapshot.monthKey, -1))} budget`}
                            </button>
                            <button
                                className='soft-button'
                                type='button'
                                onClick={openCategoryCreator}
                            >
                                <Plus size={18} />
                                Start with a new category
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <button
                            className='primary-button budget-primary-action'
                            type='button'
                            onClick={() => setTransactionOpen(true)}
                        >
                            <Plus size={20} />
                            Add transaction
                        </button>
                        <div className='budget-list-toolbar'>
                            <div
                                className='budget-amount-switch'
                                role='group'
                                aria-label='Budget amount display'
                            >
                                <button
                                    className='budget-amount-label planned'
                                    type='button'
                                    aria-pressed={amountView === 'planned'}
                                    onClick={() =>
                                        onAmountViewChange('planned')
                                    }
                                >
                                    Planned
                                </button>
                                <AppSwitch
                                    accessibilityLabel='Show available amounts'
                                    checked={amountView === 'available'}
                                    onCheckedChange={(available) =>
                                        onAmountViewChange(
                                            available ? 'available' : 'planned'
                                        )
                                    }
                                    variant='budget-view'
                                />
                                <button
                                    className='budget-amount-label available'
                                    type='button'
                                    aria-pressed={amountView === 'available'}
                                    onClick={() =>
                                        onAmountViewChange('available')
                                    }
                                >
                                    Available
                                </button>
                            </div>
                        </div>
                        <div className='category-list'>
                            <div
                                ref={categoryContainerRef}
                                className='category-sortable-list'
                                role='list'
                            >
                                {orderedCategories.map((category) => (
                                    <div
                                        className='category-sortable-item'
                                        data-sortable-item='true'
                                        data-sortable-id={category.id}
                                        key={category.id}
                                        role='listitem'
                                    >
                                        <button
                                            className='sortable-keyboard-control'
                                            type='button'
                                            {...getCategoryKeyboardProps(
                                                category,
                                                category.id.startsWith(
                                                    'optimistic-'
                                                )
                                            )}
                                        >
                                            Reorder {category.name}
                                        </button>
                                        <BudgetCategorySection
                                            amountView={amountView}
                                            category={category}
                                            categoryLongPressProps={getCategoryLongPressProps(
                                                category,
                                                category.id.startsWith(
                                                    'optimistic-'
                                                )
                                            )}
                                            collapsed={collapsed.has(
                                                category.id
                                            )}
                                            mutate={mutate}
                                            onAddItem={(selectedCategory) => {
                                                setNewName('');
                                                setNewPlanned('');
                                                setItemCategory(
                                                    selectedCategory
                                                );
                                            }}
                                            onDeleteItem={(
                                                selectedCategory,
                                                item
                                            ) =>
                                                setDeleteItemTarget({
                                                    category: selectedCategory,
                                                    item
                                                })
                                            }
                                            onEditCategory={openCategoryEditor}
                                            onSelectItem={openItemDetails}
                                            onToggle={(categoryId) =>
                                                setCollapsed((current) => {
                                                    const next = new Set(
                                                        current
                                                    );

                                                    if (next.has(categoryId))
                                                        next.delete(categoryId);
                                                    else next.add(categoryId);

                                                    return next;
                                                })
                                            }
                                            snapshot={snapshot}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button
                                className='budget-add-category-bottom'
                                type='button'
                                onClick={openCategoryCreator}
                            >
                                <Plus size={18} />
                                Add budget category
                            </button>
                        </div>
                    </>
                )}
            </div>
            <aside className='right-rail'>
                <div className='rail-section'>
                    <h2 className='rail-title'>{snapshot.label} Summary</h2>
                    <div className='rail-stat'>
                        <span>{budgetBalanceLabel}</span>
                        <strong
                            className={`budget-balance${isOverBudget ? ' budget-balance-over' : ''}`}
                        >
                            {budgetBalance}
                        </strong>
                    </div>
                    <div className='rail-stat'>
                        <span>Income</span>
                        <strong>
                            {money(snapshot.summary.expectedIncomeCents)}
                        </strong>
                    </div>
                    <div className='rail-stat'>
                        <span>Planned</span>
                        <strong>{money(snapshot.summary.plannedCents)}</strong>
                    </div>
                    <div className='rail-stat'>
                        <span>Spent</span>
                        <strong>{money(snapshot.summary.spentCents)}</strong>
                    </div>
                </div>
                <div className='rail-section'>
                    <h2 className='rail-title'>Recent transactions</h2>
                    {snapshot.activity
                        .filter((entry) => entry.type !== 'income')
                        .slice(0, 5)
                        .map((entry) => (
                            <div className='rail-activity' key={entry.id}>
                                <span>{entry.occurredOn.slice(5)}</span>
                                <strong>{entry.title}</strong>
                                <span>-{money(entry.amountCents)}</span>
                            </div>
                        ))}
                </div>
            </aside>
            <TransactionSheet
                open={transactionOpen}
                onOpenChange={setTransactionOpen}
                snapshot={snapshot}
                mutate={mutate}
            />
            <EditItemDetails
                item={selectedItem}
                snapshot={snapshot}
                mutate={mutate}
                onDeleteTransaction={onDeleteTransaction}
                onOpenChange={(open) => {
                    if (!open) closeItemDetails();
                }}
                restoreFocusRef={itemTriggerRef}
            />
            <Sheet
                open={categoryOpen}
                onOpenChange={setCategoryOpen}
                title='Add category'
            >
                <div className='form-grid'>
                    <CategoryDetailsFields
                        idPrefix='budget-new-category'
                        name={newName}
                        icon={newCategoryIcon}
                        tone={newCategoryTone}
                        placeholder='Childcare'
                        onNameChange={setNewName}
                        onIconChange={setNewCategoryIcon}
                        onToneChange={setNewCategoryTone}
                    />
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!newName.trim()}
                        onClick={addCategory}
                    >
                        Add category
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={itemCategory !== null}
                onOpenChange={(open) => {
                    if (!open) setItemCategory(null);
                }}
                title={`Add to ${itemCategory?.name ?? 'category'}`}
            >
                <div className='form-grid'>
                    <div className='field'>
                        <label htmlFor='budget-new-item'>
                            Budget item name
                        </label>
                        <input
                            id='budget-new-item'
                            placeholder='Daycare'
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                        />
                    </div>
                    <div className='field'>
                        <label htmlFor='budget-new-item-plan'>
                            Planned this month
                        </label>
                        <CurrencyInput
                            id='budget-new-item-plan'
                            value={newPlanned}
                            onValueChange={setNewPlanned}
                        />
                    </div>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!newName.trim()}
                        onClick={addItem}
                    >
                        Add budget item
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={editedCategory !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setCategoryDeleteState('closed');
                        setEditedCategory(null);
                    }
                }}
                title='Edit category'
            >
                <div className='form-grid'>
                    <CategoryDetailsFields
                        idPrefix='budget-category'
                        name={categoryName}
                        icon={categoryIcon}
                        tone={categoryTone}
                        onNameChange={setCategoryName}
                        onIconChange={setCategoryIcon}
                        onToneChange={setCategoryTone}
                    />
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!categoryName.trim()}
                        onClick={saveCategory}
                    >
                        Save category
                    </button>
                    <div className='category-delete-slot'>
                        {categoryDeleteState !== 'open' ? (
                            <button
                                className='text-button danger-text category-delete-option'
                                type='button'
                                onClick={(event) => {
                                    event.currentTarget.blur();
                                    setCategoryDeleteState('open');
                                }}
                            >
                                <Trash2 size={17} />
                                Delete category
                            </button>
                        ) : null}
                        {categoryDeleteState !== 'closed' ? (
                            <div
                                className='category-delete-confirmation'
                                data-state={categoryDeleteState}
                                role='alert'
                                onAnimationEnd={(event) => {
                                    if (
                                        event.target === event.currentTarget &&
                                        categoryDeleteState === 'closing'
                                    )
                                        setCategoryDeleteState('closed');
                                }}
                            >
                                <div className='category-delete-confirmation-copy'>
                                    <strong>
                                        Delete{' '}
                                        {editedCategory?.name ??
                                            'this category'}
                                        ?
                                    </strong>
                                    <span>
                                        Its items are removed. Past history
                                        stays.
                                    </span>
                                </div>
                                <div className='category-delete-confirmation-actions'>
                                    <button
                                        className='text-button'
                                        type='button'
                                        onClick={() =>
                                            setCategoryDeleteState('closing')
                                        }
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className='text-button danger-text'
                                        type='button'
                                        onClick={deleteCategory}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </Sheet>
            <Sheet
                open={deleteItemTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteItemTarget(null);
                }}
                title='Delete budget item?'
            >
                <div className='form-grid'>
                    <p className='confirmation-copy'>
                        Remove {deleteItemTarget?.item.name ?? 'this item'} from
                        the budget? Past budget history will be preserved.
                    </p>
                    <button
                        className='primary-button primary-button--wide danger-button'
                        type='button'
                        onClick={deleteItem}
                    >
                        Delete budget item
                    </button>
                    <button
                        className='text-button'
                        type='button'
                        onClick={() => setDeleteItemTarget(null)}
                    >
                        Cancel
                    </button>
                </div>
            </Sheet>
        </section>
    );
}
