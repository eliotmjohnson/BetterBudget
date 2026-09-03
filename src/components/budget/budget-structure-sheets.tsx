'use client';

import { Trash2 } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Sheet } from '@/components/ui/sheet';
import { CategoryDetailsFields } from '@/components/shared/category-details-fields';
import type { BudgetStructureEditor } from './budget-structure-editor';

export function BudgetStructureSheets({
    editor
}: {
    editor: BudgetStructureEditor;
}) {
    return (
        <>
            <Sheet
                open={editor.categoryOpen}
                onOpenChange={editor.setCategoryOpen}
                title='Add category'
            >
                <div className='form-grid'>
                    <CategoryDetailsFields
                        idPrefix='budget-new-category'
                        name={editor.newName}
                        icon={editor.newCategoryIcon}
                        tone={editor.newCategoryTone}
                        placeholder='Childcare'
                        onNameChange={editor.setNewName}
                        onIconChange={editor.setNewCategoryIcon}
                        onToneChange={editor.setNewCategoryTone}
                    />
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!editor.newName.trim()}
                        onClick={editor.addCategory}
                    >
                        Add category
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={editor.itemCategory !== null}
                onOpenChange={(open) => {
                    if (!open) editor.setItemCategory(null);
                }}
                title={`Add to ${editor.itemCategory?.name ?? 'category'}`}
            >
                <div className='form-grid'>
                    <div className='field'>
                        <label htmlFor='budget-new-item'>
                            Budget item name
                        </label>
                        <input
                            id='budget-new-item'
                            placeholder='Daycare'
                            value={editor.newName}
                            onChange={(event) =>
                                editor.setNewName(event.target.value)
                            }
                        />
                    </div>
                    <div className='field'>
                        <label htmlFor='budget-new-item-plan'>
                            Planned this month
                        </label>
                        <CurrencyInput
                            id='budget-new-item-plan'
                            value={editor.newPlanned}
                            onValueChange={editor.setNewPlanned}
                        />
                    </div>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!editor.newName.trim()}
                        onClick={editor.addItem}
                    >
                        Add budget item
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={editor.editedCategory !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        editor.setCategoryDeleteState('closed');
                        editor.setEditedCategory(null);
                    }
                }}
                title='Edit category'
            >
                <div className='form-grid'>
                    <CategoryDetailsFields
                        idPrefix='budget-category'
                        name={editor.categoryName}
                        icon={editor.categoryIcon}
                        tone={editor.categoryTone}
                        onNameChange={editor.setCategoryName}
                        onIconChange={editor.setCategoryIcon}
                        onToneChange={editor.setCategoryTone}
                    />
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!editor.categoryName.trim()}
                        onClick={editor.saveCategory}
                    >
                        Save category
                    </button>
                    <div className='category-delete-slot'>
                        {editor.categoryDeleteState !== 'open' ? (
                            <button
                                className='text-button danger-text category-delete-option'
                                type='button'
                                onClick={(event) => {
                                    event.currentTarget.blur();
                                    editor.setCategoryDeleteState('open');
                                }}
                            >
                                <Trash2 size={17} />
                                Delete category
                            </button>
                        ) : null}
                        {editor.categoryDeleteState !== 'closed' ? (
                            <div
                                className='category-delete-confirmation'
                                data-state={editor.categoryDeleteState}
                                role='alert'
                                onAnimationEnd={(event) => {
                                    if (
                                        event.target === event.currentTarget &&
                                        editor.categoryDeleteState === 'closing'
                                    )
                                        editor.setCategoryDeleteState('closed');
                                }}
                            >
                                <div className='category-delete-confirmation-copy'>
                                    <strong>
                                        Delete{' '}
                                        {editor.editedCategory?.name ??
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
                                            editor.setCategoryDeleteState(
                                                'closing'
                                            )
                                        }
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className='text-button danger-text'
                                        type='button'
                                        onClick={editor.deleteCategory}
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
                open={editor.deleteItemTarget !== null}
                onOpenChange={(open) => {
                    if (!open) editor.setDeleteItemTarget(null);
                }}
                title='Delete budget item?'
            >
                <div className='form-grid'>
                    <p className='confirmation-copy'>
                        Remove{' '}
                        {editor.deleteItemTarget?.item.name ?? 'this item'} from
                        the budget? Past budget history will be preserved.
                    </p>
                    <button
                        className='primary-button primary-button--wide danger-button'
                        type='button'
                        onClick={editor.deleteItem}
                    >
                        Delete budget item
                    </button>
                    <button
                        className='text-button'
                        type='button'
                        onClick={() => editor.setDeleteItemTarget(null)}
                    >
                        Cancel
                    </button>
                </div>
            </Sheet>
        </>
    );
}
