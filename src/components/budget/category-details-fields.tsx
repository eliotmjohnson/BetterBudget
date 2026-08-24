import type { CategoryTone } from '@/domain/types';
import { CategoryIcon, categoryIconOptions } from './category-icon';

export type CategoryIconValue = (typeof categoryIconOptions)[number]['value'];

const categoryToneOptions: Array<{ value: CategoryTone; label: string }> = [
    { value: 'yellow', label: 'Yellow' },
    { value: 'coral', label: 'Coral' },
    { value: 'blue', label: 'Blue' },
    { value: 'mint', label: 'Mint' },
    { value: 'lilac', label: 'Lilac' }
];

export function CategoryDetailsFields({
    icon,
    idPrefix,
    name,
    onIconChange,
    onNameChange,
    onToneChange,
    placeholder,
    tone
}: {
    icon: CategoryIconValue;
    idPrefix: string;
    name: string;
    onIconChange: (icon: CategoryIconValue) => void;
    onNameChange: (name: string) => void;
    onToneChange: (tone: CategoryTone) => void;
    placeholder?: string;
    tone: CategoryTone;
}) {
    return (
        <>
            <div className='category-editor-preview'>
                <CategoryIcon icon={icon} tone={tone} size={22} />
                <div>
                    <strong>{name.trim() || 'Category'}</strong>
                    <span>Category preview</span>
                </div>
            </div>
            <div className='field'>
                <label htmlFor={`${idPrefix}-name`}>Name</label>
                <input
                    id={`${idPrefix}-name`}
                    placeholder={placeholder}
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                />
            </div>
            <div className='field'>
                <label>Icon</label>
                <div
                    className='category-icon-picker'
                    role='group'
                    aria-label='Category icon'
                >
                    {categoryIconOptions.map((option) => (
                        <button
                            className={`category-icon-choice ${icon === option.value ? 'selected' : ''}`}
                            type='button'
                            key={option.value}
                            aria-label={`${option.label} icon`}
                            aria-pressed={icon === option.value}
                            onClick={() => onIconChange(option.value)}
                        >
                            <CategoryIcon icon={option.value} tone={tone} />
                        </button>
                    ))}
                </div>
            </div>
            <div className='field'>
                <label>Color</label>
                <div
                    className='category-tone-picker'
                    role='group'
                    aria-label='Category color'
                >
                    {categoryToneOptions.map((option) => (
                        <button
                            className={`category-tone-choice tone-${option.value}`}
                            type='button'
                            key={option.value}
                            aria-label={option.label}
                            aria-pressed={tone === option.value}
                            onClick={() => onToneChange(option.value)}
                        >
                            <span />
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}
