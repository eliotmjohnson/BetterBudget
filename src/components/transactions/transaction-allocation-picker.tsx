'use client';

import { Search, X } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { StillInput } from '@/components/ui/still-focus';
import { formatCurrency, type Cents } from '@/domain/money';
import type { BudgetCategoryView } from '@/domain/types';

const maximumAllocations = 20;
const money = (value: Cents | string) =>
    formatCurrency(value).replace('.00', '');

/**
 * The categories and items a picker search shows: a category whose name
 * matches keeps all its items, otherwise only its matching items, and
 * categories left without items are hidden.
 */
function matchingCategories(categories: BudgetCategoryView[], search: string) {
    const query = search.trim().toLocaleLowerCase();

    return categories.flatMap((category) => {
        const items =
            !query || category.name.toLocaleLowerCase().includes(query)
                ? category.items
                : category.items.filter((item) =>
                      item.name.toLocaleLowerCase().includes(query)
                  );

        return items.length > 0 || !query ? [{ category, items }] : [];
    });
}

export function TransactionAllocationPicker({
    categories,
    initialSplits,
    movingToAnotherMonth,
    onApply,
    onExitComplete,
    onOpenChange,
    open,
    projectedRemaining,
    restoreFocusRef
}: {
    categories: BudgetCategoryView[];
    initialSplits: Array<{ monthlyItemId: string; amount: string }>;
    movingToAnotherMonth: boolean;
    onApply: (selectedIds: ReadonlySet<string>) => void;
    onExitComplete: () => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    projectedRemaining: (
        monthlyItemId: string,
        draftAmountCents: string
    ) => Cents;
    restoreFocusRef: RefObject<HTMLElement | null>;
}) {
    const initialSelectedIds = useMemo(
        () => initialSplits.map((split) => split.monthlyItemId),
        [initialSplits]
    );
    const [selectedIds, setSelectedIds] = useState(
        () => new Set(initialSelectedIds)
    );
    const [search, setSearch] = useState('');
    const visibleCategories = useMemo(
        () => matchingCategories(categories, search),
        [categories, search]
    );
    const selectedCount = selectedIds.size;
    const selectedAmounts = useMemo(
        () =>
            new Map(
                initialSplits.map((split) => [
                    split.monthlyItemId,
                    split.amount
                ])
            ),
        [initialSplits]
    );

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onExitComplete={onExitComplete}
            title='Select budget items'
            variant='full-screen-mobile'
            layer='nested'
            showHandle={false}
            fitKeyboard={false}
            restoreFocusRef={restoreFocusRef}
            headerAccessory={
                <div className='search-box'>
                    <Search
                        className='search-box-icon'
                        size={18}
                        aria-hidden='true'
                    />
                    <StillInput
                        aria-label='Search budget items'
                        placeholder='Search budget items'
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    {search ? (
                        <button
                            className='search-clear-button'
                            type='button'
                            aria-label='Clear budget item search'
                            onClick={() => setSearch('')}
                        >
                            <X size={17} strokeWidth={2.2} />
                        </button>
                    ) : null}
                </div>
            }
            headerAction={
                <button
                    className='sheet-header-submit allocation-picker-done'
                    type='button'
                    aria-label={`Done, ${selectedCount} selected`}
                    onClick={() => onApply(selectedIds)}
                >
                    Done
                    {selectedCount > 0 ? (
                        <span
                            className='allocation-picker-count'
                            aria-hidden='true'
                        >
                            {selectedCount}
                        </span>
                    ) : null}
                    <span className='sr-only' aria-live='polite'>
                        {selectedCount === maximumAllocations
                            ? `${selectedCount} selected, maximum reached`
                            : `${selectedCount} selected`}
                    </span>
                </button>
            }
        >
            {visibleCategories.length === 0 && search.trim() ? (
                <div className='empty-state'>
                    <Search size={28} />
                    <h2>No matching budget items</h2>
                    <p>Try a different search.</p>
                </div>
            ) : null}
            <div className='allocation-picker-list'>
                {visibleCategories.map(({ category, items }) => {
                    const categoryRemaining = movingToAnotherMonth
                        ? null
                        : category.items
                              .reduce(
                                  (total, item) =>
                                      total +
                                      BigInt(
                                          projectedRemaining(
                                              item.id,
                                              selectedIds.has(item.id)
                                                  ? (selectedAmounts.get(
                                                        item.id
                                                    ) ?? '0')
                                                  : '0'
                                          )
                                      ),
                                  0n
                              )
                              .toString();

                    return (
                        <section
                            className='allocation-picker-category'
                            key={category.id}
                        >
                            <div className='allocation-picker-category-heading'>
                                <h3>{category.name}</h3>
                                <span
                                    className={
                                        categoryRemaining &&
                                        BigInt(categoryRemaining) < 0n
                                            ? 'negative'
                                            : undefined
                                    }
                                >
                                    {categoryRemaining === null
                                        ? 'Updates after save'
                                        : `${money(categoryRemaining)} remaining`}
                                </span>
                            </div>
                            <div className='allocation-picker-items'>
                                {items.map((item, itemIndex) => {
                                    const checked = selectedIds.has(item.id);
                                    const disabled =
                                        !checked &&
                                        selectedCount >= maximumAllocations;
                                    const remaining = movingToAnotherMonth
                                        ? null
                                        : projectedRemaining(
                                              item.id,
                                              checked
                                                  ? (selectedAmounts.get(
                                                        item.id
                                                    ) ?? '0')
                                                  : '0'
                                          );

                                    return (
                                        <label
                                            className='allocation-picker-item'
                                            data-disabled={
                                                disabled ? 'true' : 'false'
                                            }
                                            key={item.id}
                                        >
                                            <input
                                                autoFocus={
                                                    (checked &&
                                                        initialSelectedIds[0] ===
                                                            item.id) ||
                                                    (initialSelectedIds.length ===
                                                        0 &&
                                                        category ===
                                                            categories[0] &&
                                                        itemIndex === 0)
                                                }
                                                type='checkbox'
                                                checked={checked}
                                                disabled={disabled}
                                                aria-label={`${item.name}, ${category.name}`}
                                                onChange={(event) => {
                                                    const nextChecked =
                                                        event.currentTarget
                                                            .checked;

                                                    setSelectedIds(
                                                        (currentIds) => {
                                                            const nextIds =
                                                                new Set(
                                                                    currentIds
                                                                );

                                                            if (nextChecked)
                                                                nextIds.add(
                                                                    item.id
                                                                );
                                                            else
                                                                nextIds.delete(
                                                                    item.id
                                                                );

                                                            return nextIds;
                                                        }
                                                    );
                                                }}
                                            />
                                            <span className='allocation-picker-item-copy'>
                                                <strong>{item.name}</strong>
                                                <span
                                                    className={
                                                        remaining &&
                                                        BigInt(remaining) < 0n
                                                            ? 'negative'
                                                            : undefined
                                                    }
                                                >
                                                    {remaining === null
                                                        ? 'Balance updates after save'
                                                        : `${money(remaining)} remaining`}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
        </Sheet>
    );
}
