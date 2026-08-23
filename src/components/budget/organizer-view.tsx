'use client';

import {
    Archive,
    ArrowDown,
    ArrowUp,
    GripVertical,
    Info,
    MoreHorizontal,
    Plus
} from 'lucide-react';
import { useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import type {
    BudgetCategoryView,
    BudgetItemView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';
import { CategoryIcon } from './category-icon';

type Mutate = (input: BudgetMutation) => void;
type Selection =
    | { kind: 'category'; category: BudgetCategoryView }
    | { kind: 'item'; category: BudgetCategoryView; item: BudgetItemView };

export function OrganizerView({
    snapshot,
    mutate
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [itemCategory, setItemCategory] = useState<BudgetCategoryView | null>(
        null
    );
    const [selection, setSelection] = useState<Selection | null>(null);
    const [name, setName] = useState('');
    const [planned, setPlanned] = useState('');
    const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
    const [dragItem, setDragItem] = useState<{
        categoryId: string;
        itemId: string;
    } | null>(null);
    const reorderCategory = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const ids = snapshot.categories.map((category) => category.id);
        const from = ids.indexOf(fromId);
        const to = ids.indexOf(toId);

        if (from < 0 || to < 0) return;
        const [moved] = ids.splice(from, 1);

        ids.splice(to, 0, moved!);
        mutate({
            type: 'reorderCategories',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            categoryIds: ids
        });
    };
    const reorderItem = (
        category: BudgetCategoryView,
        fromId: string,
        toId: string
    ) => {
        if (fromId === toId) return;
        const ids = category.items.map((item) => item.definitionId);
        const from = ids.indexOf(fromId);
        const to = ids.indexOf(toId);

        if (from < 0 || to < 0) return;
        const [moved] = ids.splice(from, 1);

        ids.splice(to, 0, moved!);
        mutate({
            type: 'reorderItems',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            categoryId: category.id,
            itemIds: ids
        });
    };
    const moveSelection = (direction: -1 | 1) => {
        if (!selection) return;
        if (selection.kind === 'category') {
            const index = snapshot.categories.findIndex(
                (category) => category.id === selection.category.id
            );
            const target = snapshot.categories[index + direction];

            if (target) reorderCategory(selection.category.id, target.id);
        } else {
            const index = selection.category.items.findIndex(
                (item) => item.definitionId === selection.item.definitionId
            );
            const target = selection.category.items[index + direction];

            if (target)
                reorderItem(
                    selection.category,
                    selection.item.definitionId,
                    target.definitionId
                );
        }
        setSelection(null);
    };
    const rename = () => {
        if (!selection || !name.trim()) return;
        if (selection.kind === 'category')
            mutate({
                type: 'renameCategory',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                categoryId: selection.category.id,
                name,
                expectedVersion: selection.category.version
            });
        else
            mutate({
                type: 'renameItem',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                itemId: selection.item.definitionId,
                name,
                expectedVersion: selection.item.definitionVersion
            });
        setSelection(null);
    };
    const archive = () => {
        if (!selection) return;
        if (selection.kind === 'category')
            mutate({
                type: 'archiveCategory',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                categoryId: selection.category.id,
                expectedVersion: selection.category.version
            });
        else
            mutate({
                type: 'archiveItem',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                itemId: selection.item.definitionId,
                expectedVersion: selection.item.definitionVersion
            });
        setSelection(null);
    };
    const permanentlyDelete = () => {
        if (!selection) return;
        if (selection.kind === 'category')
            mutate({
                type: 'deleteCategory',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                categoryId: selection.category.id,
                expectedVersion: selection.category.version
            });
        else
            mutate({
                type: 'deleteItem',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                itemId: selection.item.definitionId,
                expectedVersion: selection.item.definitionVersion
            });
        setSelection(null);
    };

    return (
        <section className='organize-screen organize-screen--detail'>
            <div className='organize-detail-toolbar'>
                <p className='organize-note'>
                    <Info size={15} />
                    Drag to reorder on desktop, or use the item menu on touch
                    devices.
                </p>
                <button
                    className='primary-button compact-action'
                    aria-label='Add category'
                    aria-haspopup='dialog'
                    type='button'
                    onClick={() => {
                        setName('');
                        setCategoryOpen(true);
                    }}
                >
                    <Plus size={19} />
                    <span className='organize-action-label'>Category</span>
                </button>
            </div>
            {snapshot.categories.map((category) => (
                <section
                    className='organize-category'
                    key={category.id}
                    draggable
                    onDragStart={() => setDragCategoryId(category.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                        if (dragCategoryId)
                            reorderCategory(dragCategoryId, category.id);
                        setDragCategoryId(null);
                    }}
                >
                    <div className='organize-category-head'>
                        <GripVertical className='drag-handle' size={19} />
                        <CategoryIcon
                            icon={category.icon}
                            tone={category.tone}
                        />
                        <strong>{category.name}</strong>
                        <button
                            className='icon-button small-icon'
                            type='button'
                            aria-label={`Edit ${category.name}`}
                            onClick={() => {
                                setName(category.name);
                                setSelection({ kind: 'category', category });
                            }}
                        >
                            <MoreHorizontal size={19} />
                        </button>
                    </div>
                    {category.items.map((item) => (
                        <div
                            className='organize-item'
                            key={item.definitionId}
                            draggable
                            onDragStart={(event) => {
                                event.stopPropagation();
                                setDragItem({
                                    categoryId: category.id,
                                    itemId: item.definitionId
                                });
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.stopPropagation();
                                if (dragItem?.categoryId === category.id)
                                    reorderItem(
                                        category,
                                        dragItem.itemId,
                                        item.definitionId
                                    );
                                setDragItem(null);
                            }}
                        >
                            <GripVertical className='drag-handle' size={17} />
                            <span />
                            <span>
                                {item.name}
                                {item.carryoverEnabled ? (
                                    <em className='carry-pill'>Carry over</em>
                                ) : null}
                            </span>
                            <button
                                className='icon-button small-icon'
                                type='button'
                                aria-label={`Edit ${item.name}`}
                                onClick={() => {
                                    setName(item.name);
                                    setSelection({
                                        kind: 'item',
                                        category,
                                        item
                                    });
                                }}
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        </div>
                    ))}
                    <button
                        className='add-inline'
                        type='button'
                        onClick={() => {
                            setName('');
                            setPlanned('');
                            setItemCategory(category);
                        }}
                    >
                        <Plus size={17} /> Add budget item
                    </button>
                </section>
            ))}
            <button
                className='primary-button primary-button--wide organize-add'
                type='button'
                onClick={() => {
                    setName('');
                    setCategoryOpen(true);
                }}
            >
                <Plus size={20} />
                Add category
            </button>
            <Sheet
                layer='nested'
                open={categoryOpen}
                onOpenChange={setCategoryOpen}
                title='Add category'
            >
                <div className='form-grid'>
                    <div className='field'>
                        <label htmlFor='new-category'>Category name</label>
                        <input
                            id='new-category'
                            placeholder='Childcare'
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!name.trim()}
                        onClick={() => {
                            mutate({
                                type: 'addCategory',
                                clientMutationId: createUuid(),
                                monthKey: snapshot.monthKey,
                                name
                            });
                            setCategoryOpen(false);
                        }}
                    >
                        Add category
                    </button>
                </div>
            </Sheet>
            <Sheet
                layer='nested'
                open={itemCategory !== null}
                onOpenChange={(open) => {
                    if (!open) setItemCategory(null);
                }}
                title={`Add to ${itemCategory?.name ?? 'category'}`}
            >
                <div className='form-grid'>
                    <div className='field'>
                        <label htmlFor='new-item'>Budget item name</label>
                        <input
                            id='new-item'
                            placeholder='Daycare'
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <div className='field'>
                        <label htmlFor='new-item-plan'>
                            Planned this month
                        </label>
                        <CurrencyInput
                            id='new-item-plan'
                            value={planned}
                            onValueChange={setPlanned}
                        />
                    </div>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!name.trim()}
                        onClick={() => {
                            if (!itemCategory) return;
                            mutate({
                                type: 'addItem',
                                clientMutationId: createUuid(),
                                monthKey: snapshot.monthKey,
                                categoryId: itemCategory.id,
                                name,
                                plannedCents: planned || '0'
                            });
                            setItemCategory(null);
                        }}
                    >
                        Add budget item
                    </button>
                </div>
            </Sheet>
            <Sheet
                layer='nested'
                open={selection !== null}
                onOpenChange={(open) => {
                    if (!open) setSelection(null);
                }}
                title={
                    selection?.kind === 'category'
                        ? 'Category options'
                        : 'Budget item options'
                }
            >
                <div className='form-grid'>
                    <div className='field'>
                        <label htmlFor='rename-selection'>Name</label>
                        <input
                            id='rename-selection'
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        onClick={rename}
                    >
                        Save name
                    </button>
                    <div className='move-actions'>
                        <button
                            className='soft-button'
                            type='button'
                            onClick={() => moveSelection(-1)}
                        >
                            <ArrowUp size={17} />
                            Move up
                        </button>
                        <button
                            className='soft-button'
                            type='button'
                            onClick={() => moveSelection(1)}
                        >
                            <ArrowDown size={17} />
                            Move down
                        </button>
                    </div>
                    <button
                        className='text-button danger-text'
                        type='button'
                        onClick={archive}
                    >
                        <Archive size={17} />
                        Archive with history
                    </button>
                    <button
                        className='text-button subtle-danger'
                        type='button'
                        onClick={permanentlyDelete}
                    >
                        Permanently delete if unused
                    </button>
                </div>
            </Sheet>
        </section>
    );
}
