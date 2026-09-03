'use client';

import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { type MouseEvent } from 'react';
import {
    useSortableList,
    type SortLongPressProps
} from '@/components/ui/sortable-list';
import type {
    BudgetCategoryView,
    BudgetItemView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';
import { CategoryIcon } from '@/components/shared/category-icon';

export type Mutate = (input: BudgetMutation) => void;

export const organizerScrollContainer = '.navigation-detail-body';

export function OrganizerCategorySection({
    category,
    categoryLongPressProps,
    collapsed,
    mutate,
    onEditCategory,
    onEditItem,
    onToggle,
    snapshot
}: {
    category: BudgetCategoryView;
    categoryLongPressProps: SortLongPressProps;
    collapsed: boolean;
    mutate: Mutate;
    onEditCategory: (
        category: BudgetCategoryView,
        trigger: HTMLButtonElement,
        focusVisible: boolean
    ) => void;
    onEditItem: (
        category: BudgetCategoryView,
        item: BudgetItemView,
        trigger: HTMLButtonElement,
        focusVisible: boolean
    ) => void;
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
        overlayLayer: 'nested',
        previewSelector: '.organizer-item-row',
        scrollContainerSelector: organizerScrollContainer
    });
    const openCategory = (
        event: MouseEvent<HTMLButtonElement>,
        selectedCategory: BudgetCategoryView
    ) =>
        onEditCategory(
            selectedCategory,
            event.currentTarget,
            event.detail === 0
        );
    const openItem = (
        event: MouseEvent<HTMLButtonElement>,
        item: BudgetItemView
    ) => onEditItem(category, item, event.currentTarget, event.detail === 0);

    return (
        <section
            className={`category-section organizer-category-section tone-${category.tone}`}
        >
            <div
                className='category-header organizer-category-header'
                {...categoryLongPressProps}
            >
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
                        className='organizer-category-chevron'
                        data-collapsed={collapsed ? 'true' : 'false'}
                    />
                </button>
                <button
                    className='icon-button category-edit-button'
                    data-sort-long-press-ignore
                    type='button'
                    disabled={pendingCategory}
                    aria-label={`Edit ${category.name} category`}
                    onClick={(event) => openCategory(event, category)}
                >
                    <MoreHorizontal size={20} />
                </button>
            </div>
            {collapsed ? null : (
                <div
                    ref={itemContainerRef}
                    className='organizer-item-sortable-list'
                    role='list'
                >
                    {orderedItems.length === 0 ? (
                        <p className='organizer-empty-category'>
                            No budget items in this category.
                        </p>
                    ) : (
                        orderedItems.map((item) => {
                            const pendingItem =
                                item.definitionId.startsWith('optimistic-');

                            return (
                                <div
                                    className='organizer-item-sortable-item'
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
                                    <div
                                        className='organizer-item-row'
                                        {...getItemLongPressProps(
                                            item,
                                            pendingItem
                                        )}
                                    >
                                        <button
                                            className='organizer-item-edit'
                                            type='button'
                                            disabled={pendingItem}
                                            onClick={(event) =>
                                                openItem(event, item)
                                            }
                                        >
                                            {item.name}
                                        </button>
                                        <button
                                            className='icon-button organizer-item-menu'
                                            data-sort-long-press-ignore
                                            type='button'
                                            disabled={pendingItem}
                                            aria-label={`Edit ${item.name} budget item`}
                                            onClick={(event) =>
                                                openItem(event, item)
                                            }
                                        >
                                            <MoreHorizontal size={19} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </section>
    );
}
