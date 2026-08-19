'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { formatCurrency, type Cents } from '@/domain/money';
import type { BudgetCategoryView } from '@/domain/types';

const maximumAllocations = 20;
const money = (value: Cents | string) =>
    formatCurrency(value).replace('.00', '');

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
            restoreFocusRef={restoreFocusRef}
            footer={
                <div className='allocation-picker-footer-content'>
                    <span aria-live='polite'>
                        {selectedCount === maximumAllocations
                            ? `${selectedCount} selected · Maximum reached`
                            : `${selectedCount} selected`}
                    </span>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        onClick={() => onApply(selectedIds)}
                    >
                        Done
                    </button>
                </div>
            }
        >
            <div className='allocation-picker-list'>
                {categories.map((category) => {
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
                                {category.items.map((item, itemIndex) => {
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
