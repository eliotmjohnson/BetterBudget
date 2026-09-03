'use client';

import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import { useSortableList } from '@/components/ui/sortable-list';
import type { SortLongPressProps } from '@/components/ui/sortable-list';
import { SwipeReveal } from '@/components/ui/swipe-reveal';
import type { BudgetAmountView } from '@/domain/budget-preferences';
import type {
    BudgetCategoryView,
    BudgetItemView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { CategoryIcon } from '@/components/shared/category-icon';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';
import { PlanInput } from './budget-item-editors';

export const remainingAvailableProgress = (
    remaining: bigint,
    spent: bigint
) => {
    if (remaining <= 0n) return 0;
    const startingAvailable = remaining + spent;

    if (startingAvailable <= 0n) return 100;
    const basisPoints =
        (remaining * 10_000n + startingAvailable / 2n) / startingAvailable;

    return Math.min(100, Number(basisPoints) / 100);
};

export function BudgetCategorySection({
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
