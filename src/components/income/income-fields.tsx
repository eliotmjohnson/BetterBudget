'use client';

import { useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import type {
    CategoryTone,
    IncomePlanView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import {
    CategoryIcon,
    categoryIconOptions
} from '@/components/shared/category-icon';
import type { Mutate } from '@/components/shared/budget-view-helpers';

export type IncomeIconValue = (typeof categoryIconOptions)[number]['value'];

export const incomeToneOptions: Array<{
    value: CategoryTone;
    label: string;
}> = [
    { value: 'yellow', label: 'Yellow' },
    { value: 'coral', label: 'Coral' },
    { value: 'blue', label: 'Blue' },
    { value: 'mint', label: 'Mint' },
    { value: 'lilac', label: 'Lilac' }
];

export function incomeIconValue(icon: string): IncomeIconValue {
    return categoryIconOptions.some((option) => option.value === icon)
        ? (icon as IncomeIconValue)
        : 'wallet';
}

export function IncomeAppearancePicker({
    icon,
    onIconChange,
    onToneChange,
    tone
}: {
    icon: IncomeIconValue;
    onIconChange: (icon: IncomeIconValue) => void;
    onToneChange: (tone: CategoryTone) => void;
    tone: CategoryTone;
}) {
    return (
        <>
            <div className='field'>
                <label>Icon</label>
                <div
                    className='category-icon-picker'
                    role='group'
                    aria-label='Income source icon'
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
                    aria-label='Income source color'
                >
                    {incomeToneOptions.map((option) => (
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

export function EditableIncomeTitle({
    plan,
    snapshot,
    mutate
}: {
    plan: IncomePlanView;
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(plan.name);
    const commit = () => {
        const name = draft.trim();

        if (!name) {
            setDraft(plan.name);
            setEditing(false);

            return;
        }
        if (name !== plan.name)
            mutate({
                type: 'updateIncomePlan',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                incomePlanId: plan.id,
                expectedVersion: plan.version,
                name,
                icon: incomeIconValue(plan.icon),
                tone: plan.tone,
                expectedCents: plan.expectedCents
            });
        setDraft(name);
        setEditing(false);
    };

    return editing ? (
        <input
            className='navigation-detail-title-input'
            aria-label='Income source name'
            autoFocus
            maxLength={80}
            value={draft}
            onBlur={commit}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(plan.name);
                    setEditing(false);
                }
            }}
        />
    ) : (
        <button
            className='navigation-detail-title-button'
            type='button'
            aria-label={`Rename ${plan.name}`}
            onClick={() => {
                setDraft(plan.name);
                setEditing(true);
            }}
        >
            {plan.name}
        </button>
    );
}

export function IncomePlanInput({
    plan,
    snapshot,
    mutate
}: {
    plan: IncomePlanView;
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const [value, setValue] = useState<string>(plan.expectedCents);
    const commit = () => {
        const expectedCents = value || '0';

        if (expectedCents === plan.expectedCents) return;
        mutate({
            type: 'updateIncomePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: plan.id,
            expectedVersion: plan.version,
            name: plan.name,
            icon: incomeIconValue(plan.icon),
            tone: plan.tone,
            expectedCents
        });
    };

    return (
        <CurrencyInput
            id='income-source-expected'
            className='income-source-expected-input'
            aria-label={`Expected amount for ${plan.name}`}
            value={value}
            onValueChange={setValue}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
            }}
        />
    );
}
