'use client';

import {
    ChevronDown,
    Info,
    ListTree,
    MoreHorizontal,
    Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type MouseEvent } from 'react';
import { Sheet } from '@/components/ui/sheet';
import {
    useSortableList,
    type SortLongPressProps
} from '@/components/ui/sortable-list';
import type {
    BudgetCategoryView,
    BudgetItemView,
    CategoryTone,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';
import {
    CategoryDetailsFields,
    type CategoryIconValue
} from './category-details-fields';
import { CategoryIcon, categoryIconOptions } from './category-icon';

type Mutate = (input: BudgetMutation) => void;
type ConfirmedMutate = (input: BudgetMutation) => Promise<boolean>;
type Selection =
    | { kind: 'category'; category: BudgetCategoryView }
    | { kind: 'item'; category: BudgetCategoryView; item: BudgetItemView };
type DeleteIntent = 'safe' | 'permanent' | null;
type DeleteConfirmationState = 'closed' | 'open' | 'closing';

const organizerScrollContainer = '.navigation-detail-body';

function categoryIconValue(icon: string): CategoryIconValue {
    return categoryIconOptions.some((option) => option.value === icon)
        ? (icon as CategoryIconValue)
        : 'wallet';
}

function OrganizerCategorySection({
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

export function OrganizerView({
    snapshot,
    mutate,
    mutateConfirmed
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
    mutateConfirmed: ConfirmedMutate;
}) {
    const editorTriggerRef = useRef<HTMLElement | null>(null);
    const [editorRestoreFocusVisible, setEditorRestoreFocusVisible] =
        useState(true);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [selection, setSelection] = useState<Selection | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [name, setName] = useState('');
    const [categoryIcon, setCategoryIcon] =
        useState<CategoryIconValue>('wallet');
    const [categoryTone, setCategoryTone] = useState<CategoryTone>('blue');
    const [deleteIntent, setDeleteIntent] = useState<DeleteIntent>(null);
    const [deleteConfirmationState, setDeleteConfirmationState] =
        useState<DeleteConfirmationState>('closed');
    const [pendingAction, setPendingAction] = useState<
        'save' | 'delete' | null
    >(null);
    const actionPending = pendingAction !== null;
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
        overlayLayer: 'nested',
        previewSelector: '.organizer-category-header',
        scrollContainerSelector: organizerScrollContainer
    });
    const selectedLabel =
        selection?.kind === 'category'
            ? selection.category.name
            : selection?.item.name;
    const deleteKindLabel =
        selection?.kind === 'category' ? 'category' : 'line item';
    const closeEditor = () => {
        if (actionPending) return;
        setEditorOpen(false);
    };
    const finishEditorClose = () => {
        setDeleteIntent(null);
        setDeleteConfirmationState('closed');
        setSelection(null);
    };
    const openCategoryEditor = (
        category: BudgetCategoryView,
        trigger: HTMLButtonElement,
        focusVisible: boolean
    ) => {
        editorTriggerRef.current = trigger;
        setEditorRestoreFocusVisible(focusVisible);
        setName(category.name);
        setCategoryIcon(categoryIconValue(category.icon));
        setCategoryTone(category.tone);
        setDeleteIntent(null);
        setDeleteConfirmationState('closed');
        setSelection({ kind: 'category', category });
        setEditorOpen(true);
    };
    const openItemEditor = (
        category: BudgetCategoryView,
        item: BudgetItemView,
        trigger: HTMLButtonElement,
        focusVisible: boolean
    ) => {
        editorTriggerRef.current = trigger;
        setEditorRestoreFocusVisible(focusVisible);
        setName(item.name);
        setDeleteIntent(null);
        setDeleteConfirmationState('closed');
        setSelection({ kind: 'item', category, item });
        setEditorOpen(true);
    };
    const runConfirmed = async (
        input: BudgetMutation,
        action: 'save' | 'delete'
    ) => {
        setPendingAction(action);
        const saved = await mutateConfirmed(input);

        setPendingAction(null);
        if (!saved) return;
        if (action === 'delete') editorTriggerRef.current = null;
        setEditorOpen(false);
    };
    const saveSelection = async () => {
        if (!selection) return;
        const nextName = name.trim();

        if (!nextName) return;
        if (selection.kind === 'category') {
            if (
                nextName === selection.category.name &&
                categoryIcon === selection.category.icon &&
                categoryTone === selection.category.tone
            ) {
                closeEditor();

                return;
            }
            await runConfirmed(
                {
                    type: 'renameCategory',
                    clientMutationId: createUuid(),
                    monthKey: snapshot.monthKey,
                    categoryId: selection.category.id,
                    name: nextName,
                    icon: categoryIcon,
                    tone: categoryTone,
                    expectedVersion: selection.category.version
                },
                'save'
            );

            return;
        }
        if (nextName === selection.item.name) {
            closeEditor();

            return;
        }
        await runConfirmed(
            {
                type: 'renameItem',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                itemId: selection.item.definitionId,
                name: nextName,
                expectedVersion: selection.item.definitionVersion
            },
            'save'
        );
    };
    const deleteSelection = async () => {
        if (!selection || !deleteIntent) return;
        const permanent = deleteIntent === 'permanent';

        await runConfirmed(
            selection.kind === 'category'
                ? {
                      type: permanent ? 'deleteCategory' : 'archiveCategory',
                      clientMutationId: createUuid(),
                      monthKey: snapshot.monthKey,
                      categoryId: selection.category.id,
                      expectedVersion: selection.category.version
                  }
                : {
                      type: permanent ? 'deleteItem' : 'archiveItem',
                      clientMutationId: createUuid(),
                      monthKey: snapshot.monthKey,
                      itemId: selection.item.definitionId,
                      expectedVersion: selection.item.definitionVersion
                  },
            'delete'
        );
    };

    return (
        <section className='organize-screen organize-screen--detail'>
            {snapshot.categories.length === 0 ? (
                <div className='organizer-empty-state'>
                    <div className='organizer-empty-icon' aria-hidden='true'>
                        <ListTree size={24} />
                    </div>
                    <h3>Nothing to organize yet</h3>
                    <p>
                        Add categories and budget items from the Budget page,
                        then return here to rename, reorder, or delete them.
                    </p>
                    <Link
                        className='primary-button'
                        href={`/?month=${snapshot.monthKey}`}
                    >
                        Go to Budget
                    </Link>
                </div>
            ) : (
                <>
                    <p className='organize-note'>
                        <Info size={15} />
                        Hold a category or item, then drag to reorder.
                    </p>
                    <div
                        ref={categoryContainerRef}
                        className='category-list organizer-category-list'
                        role='list'
                    >
                        {orderedCategories.map((category) => (
                            <div
                                className='category-sortable-item organizer-category-sortable-item'
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
                                        category.id.startsWith('optimistic-')
                                    )}
                                >
                                    Reorder {category.name}
                                </button>
                                <OrganizerCategorySection
                                    category={category}
                                    categoryLongPressProps={getCategoryLongPressProps(
                                        category,
                                        category.id.startsWith('optimistic-')
                                    )}
                                    collapsed={collapsed.has(category.id)}
                                    mutate={mutate}
                                    onEditCategory={openCategoryEditor}
                                    onEditItem={openItemEditor}
                                    onToggle={(categoryId) =>
                                        setCollapsed((current) => {
                                            const next = new Set(current);

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
                </>
            )}
            <Sheet
                layer='nested'
                open={editorOpen}
                onOpenChange={(open) => {
                    if (!open) closeEditor();
                }}
                onExitComplete={finishEditorClose}
                title={
                    selection?.kind === 'category'
                        ? 'Edit category'
                        : 'Edit budget item'
                }
                restoreFocusRef={editorTriggerRef}
                restoreFocusVisible={editorRestoreFocusVisible}
                interactionDisabled={actionPending}
            >
                <div className='form-grid organizer-editor-form'>
                    {selection?.kind === 'category' ? (
                        <CategoryDetailsFields
                            idPrefix='organizer-category'
                            name={name}
                            icon={categoryIcon}
                            tone={categoryTone}
                            onNameChange={setName}
                            onIconChange={setCategoryIcon}
                            onToneChange={setCategoryTone}
                        />
                    ) : (
                        <div className='field'>
                            <label htmlFor='organizer-item-name'>Name</label>
                            <input
                                id='organizer-item-name'
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter')
                                        void saveSelection();
                                }}
                            />
                        </div>
                    )}
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!name.trim() || actionPending}
                        onClick={() => void saveSelection()}
                    >
                        {pendingAction === 'save' ? 'Saving…' : 'Save changes'}
                    </button>
                    <div className='organizer-delete-slot'>
                        {deleteConfirmationState !== 'open' ? (
                            <>
                                <button
                                    className='text-button danger-text organizer-delete-action'
                                    type='button'
                                    onClick={(event) => {
                                        event.currentTarget.blur();
                                        setDeleteIntent('safe');
                                        setDeleteConfirmationState('open');
                                    }}
                                >
                                    <Trash2 size={17} />
                                    Delete {deleteKindLabel}
                                </button>
                                <button
                                    className='text-button subtle-danger organizer-permanent-action'
                                    type='button'
                                    onClick={(event) => {
                                        event.currentTarget.blur();
                                        setDeleteIntent('permanent');
                                        setDeleteConfirmationState('open');
                                    }}
                                >
                                    Delete {deleteKindLabel} permanently
                                </button>
                            </>
                        ) : null}
                        {deleteConfirmationState !== 'closed' ? (
                            <div
                                className='category-delete-confirmation organizer-delete-confirmation'
                                data-state={deleteConfirmationState}
                                role='alert'
                                onAnimationEnd={(event) => {
                                    if (
                                        event.target === event.currentTarget &&
                                        deleteConfirmationState === 'closing'
                                    ) {
                                        setDeleteIntent(null);
                                        setDeleteConfirmationState('closed');
                                    }
                                }}
                            >
                                <div className='category-delete-confirmation-copy'>
                                    <strong>
                                        {deleteIntent === 'permanent'
                                            ? `Delete ${selectedLabel ?? `this ${deleteKindLabel}`} permanently?`
                                            : `Delete ${selectedLabel ?? `this ${deleteKindLabel}`}?`}
                                    </strong>
                                    <span>
                                        {deleteIntent === 'permanent'
                                            ? `${selectedLabel ?? `This ${deleteKindLabel}`} must be unused. This cannot be undone.`
                                            : selection?.kind === 'category'
                                              ? 'Its items are removed. Past history stays.'
                                              : 'It is removed from future budgets. Past history stays.'}
                                    </span>
                                </div>
                                <div className='category-delete-confirmation-actions'>
                                    <button
                                        className='text-button'
                                        type='button'
                                        disabled={actionPending}
                                        onClick={() =>
                                            setDeleteConfirmationState(
                                                'closing'
                                            )
                                        }
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className='text-button danger-text'
                                        type='button'
                                        disabled={actionPending}
                                        onClick={() => void deleteSelection()}
                                    >
                                        {pendingAction === 'delete'
                                            ? 'Deleting…'
                                            : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </Sheet>
        </section>
    );
}
