'use client';

import { Copy, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore
} from 'react';
import { AppSwitch } from '@/components/ui/app-switch';
import { useSortableList } from '@/components/ui/sortable-list';
import { monthLabel, shiftMonth } from '@/domain/money';
import type { BudgetAmountView } from '@/domain/budget-preferences';
import type {
    ActivityEntry,
    BudgetItemView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { createDetailHistory } from '@/components/shared/detail-history';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';
import { EditItemDetails } from './budget-item-editors';
import { BudgetCategorySection } from './budget-category-section';
import { BudgetSummaryCard, budgetBalanceView } from './budget-summary-card';
import { useBudgetStructureEditor } from './budget-structure-editor';
import { BudgetStructureSheets } from './budget-structure-sheets';

const itemHistory = createDetailHistory(
    'item',
    'betterBudgetItemDefinitionId',
    'betterbudget:item-history'
);

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
        itemHistory.subscribe,
        itemHistory.idFromLocation,
        () => searchParams.get('item')
    );
    const budgetLayoutRef = useRef<HTMLElement>(null);
    const previousAnimationKeyRef = useRef(animationKey);
    const itemTriggerRef = useRef<HTMLElement | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [transactionOpen, setTransactionOpen] = useState(false);
    const editor = useBudgetStructureEditor(snapshot, mutate);
    const balance = budgetBalanceView(snapshot);
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

        window.history.replaceState(itemHistory.state(), '', itemHistory.url());
        itemHistory.notifyChange();
    }, [requestedItemDefinitionId, selectedItem]);
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
    const copyPreviousMonth = () =>
        mutate({
            type: 'copyPreviousMonth',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey
        });
    const openItemDetails = (
        item: BudgetItemView,
        trigger: HTMLButtonElement
    ) => {
        itemTriggerRef.current = trigger;
        window.history.pushState(
            itemHistory.state(item.definitionId),
            '',
            itemHistory.url(item.definitionId)
        );
        itemHistory.notifyChange();
    };
    const closeItemDetails = () => {
        const openedFromBudget =
            itemHistory.idFromState(window.history.state) ===
            requestedItemDefinitionId;

        if (openedFromBudget) {
            window.history.back();

            return;
        }
        window.history.replaceState(itemHistory.state(), '', itemHistory.url());
        itemHistory.notifyChange();
    };

    return (
        <section
            ref={budgetLayoutRef}
            className='screen budget-layout budget-bars-enter'
        >
            <div className='budget-main'>
                <BudgetSummaryCard snapshot={snapshot} />
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
                                onClick={editor.openCategoryCreator}
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
                                                editor.setNewName('');
                                                editor.setNewPlanned('');
                                                editor.setItemCategory(
                                                    selectedCategory
                                                );
                                            }}
                                            onDeleteItem={(
                                                selectedCategory,
                                                item
                                            ) =>
                                                editor.setDeleteItemTarget({
                                                    category: selectedCategory,
                                                    item
                                                })
                                            }
                                            onEditCategory={
                                                editor.openCategoryEditor
                                            }
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
                                onClick={editor.openCategoryCreator}
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
                        <span>{balance.label}</span>
                        <strong
                            className={`budget-balance${balance.isOverBudget ? ' budget-balance-over' : ''}`}
                        >
                            {balance.amount}
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
            <BudgetStructureSheets editor={editor} />
        </section>
    );
}
