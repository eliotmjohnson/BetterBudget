'use client';

import { useState } from 'react';
import type {
    BudgetCategoryView,
    BudgetItemView,
    CategoryTone,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { categoryIconOptions } from '@/components/shared/category-icon';
import type { CategoryIconValue } from '@/components/shared/category-details-fields';
import type { Mutate } from '@/components/shared/budget-view-helpers';

export type DeleteItemTarget = {
    category: BudgetCategoryView;
    item: BudgetItemView;
};
export type CategoryDeleteState = 'closed' | 'open' | 'closing';

/**
 * Owns the category/item creation, edit, and delete sheet state so the Budget
 * view keeps only the state its own layout reads.
 */
export function useBudgetStructureEditor(
    snapshot: MonthSnapshot,
    mutate: Mutate
) {
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
    const openCategoryCreator = () => {
        setNewName('');
        setNewCategoryIcon('sparkles');
        setNewCategoryTone('blue');
        setCategoryOpen(true);
    };
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

    return {
        categoryOpen,
        setCategoryOpen,
        itemCategory,
        setItemCategory,
        editedCategory,
        setEditedCategory,
        categoryDeleteState,
        setCategoryDeleteState,
        categoryName,
        setCategoryName,
        categoryIcon,
        setCategoryIcon,
        categoryTone,
        setCategoryTone,
        deleteItemTarget,
        setDeleteItemTarget,
        newName,
        setNewName,
        newCategoryIcon,
        setNewCategoryIcon,
        newCategoryTone,
        setNewCategoryTone,
        newPlanned,
        setNewPlanned,
        openCategoryCreator,
        addCategory,
        addItem,
        openCategoryEditor,
        saveCategory,
        deleteCategory,
        deleteItem
    };
}

export type BudgetStructureEditor = ReturnType<typeof useBudgetStructureEditor>;
