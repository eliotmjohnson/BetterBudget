'use client';

import { useState } from 'react';
import { AppSwitch } from '@/components/ui/app-switch';
import { Sheet } from '@/components/ui/sheet';
import type { BudgetItemView, MonthSnapshot } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';
import { money } from './budget-view-helpers';

export type Reassignment = NonNullable<
    Extract<BudgetMutation, { type: 'archiveItem' }>['reassignment']
>;

export interface DeletionImpact {
    transactionCount: number;
    plannedCents: bigint;
    hasLaterActivity: boolean;
}

export function deletionImpact(
    snapshot: MonthSnapshot,
    items: BudgetItemView[]
): DeletionImpact {
    const monthlyIds = new Set(items.map((item) => item.id));

    return {
        transactionCount: snapshot.activity.filter(
            (entry) =>
                entry.type !== 'income' &&
                entry.allocations?.some((allocation) =>
                    monthlyIds.has(allocation.monthlyItemId)
                )
        ).length,
        plannedCents: items.reduce(
            (total, item) => total + BigInt(item.plannedCents),
            0n
        ),
        hasLaterActivity: items.some((item) => item.hasLaterActivity)
    };
}

export const requiresDestination = (impact: DeletionImpact) =>
    impact.transactionCount > 0 || impact.hasLaterActivity;

export const offersReassignment = (impact: DeletionImpact) =>
    requiresDestination(impact) || impact.plannedCents > 0n;

function reassignmentCopy(impact: DeletionImpact, label: string) {
    const count = impact.transactionCount;

    if (count > 0)
        return `${count} ${count === 1 ? 'transaction' : 'transactions'} this month ${count === 1 ? 'uses' : 'use'} ${label}${impact.hasLaterActivity ? ', and later months have more' : ''}. Choose where to move ${count === 1 && !impact.hasLaterActivity ? 'it' : 'them'}.`;
    if (impact.hasLaterActivity)
        return `Later months have transactions that use ${label}. Choose where to move them.`;

    return `You can move its ${money(impact.plannedCents.toString())} plan to another budget item.`;
}

export function DeleteDefinitionSheet({
    open,
    onOpenChange,
    snapshot,
    sourceLabel,
    sourceItems,
    excludedCategoryId,
    pending,
    layer = 'base',
    onConfirm
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    snapshot: MonthSnapshot;
    sourceLabel: string;
    sourceItems: BudgetItemView[];
    excludedCategoryId?: string;
    pending: boolean;
    layer?: 'base' | 'nested';
    onConfirm: (reassignment: Reassignment | undefined) => void;
}) {
    const [destinationItemId, setDestinationItemId] = useState('');
    const [movePlan, setMovePlan] = useState(true);
    const impact = deletionImpact(snapshot, sourceItems);
    const required = requiresDestination(impact);
    const sourceDefinitionIds = new Set(
        sourceItems.map((item) => item.definitionId)
    );
    const destinations = snapshot.categories
        .filter((category) => category.id !== excludedCategoryId)
        .map((category) => ({
            ...category,
            items: category.items.filter(
                (item) =>
                    !sourceDefinitionIds.has(item.definitionId) &&
                    !item.id.startsWith('optimistic-')
            )
        }))
        .filter((category) => category.items.length > 0);
    const reassignment: Reassignment | undefined = destinationItemId
        ? {
              destinationItemId,
              movePlan: required ? movePlan : true
          }
        : undefined;
    const canConfirm = !pending && (!required || reassignment !== undefined);
    const planLabel = money(impact.plannedCents.toString());

    return (
        <Sheet
            open={open}
            onOpenChange={(nextOpen) => {
                if (pending) return;
                onOpenChange(nextOpen);
            }}
            onExitComplete={() => {
                setDestinationItemId('');
                setMovePlan(true);
            }}
            title={`Delete ${sourceLabel}?`}
            layer={layer}
            interactionDisabled={pending}
        >
            <div className='form-grid'>
                <p className='confirmation-copy'>
                    {sourceLabel} will be removed from {snapshot.label} and
                    later months. Earlier months keep their history.
                </p>
                {offersReassignment(impact) ? (
                    <>
                        <p className='confirmation-copy'>
                            {reassignmentCopy(impact, sourceLabel)}
                        </p>
                        {destinations.length > 0 ? (
                            <div className='field'>
                                <label htmlFor='delete-definition-destination'>
                                    {required
                                        ? 'Move transactions to'
                                        : 'Move plan to'}
                                </label>
                                <select
                                    id='delete-definition-destination'
                                    value={destinationItemId}
                                    onChange={(event) =>
                                        setDestinationItemId(event.target.value)
                                    }
                                >
                                    <option value=''>
                                        {required
                                            ? 'Choose a budget item'
                                            : 'Don’t move the plan'}
                                    </option>
                                    {destinations.map((category) => (
                                        <optgroup
                                            key={category.id}
                                            label={category.name}
                                        >
                                            {category.items.map((item) => (
                                                <option
                                                    key={item.definitionId}
                                                    value={item.definitionId}
                                                >
                                                    {item.name}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <p className='confirmation-copy'>
                                Add another budget item to {snapshot.label}{' '}
                                first so this activity has somewhere to go.
                            </p>
                        )}
                        {required &&
                        impact.plannedCents > 0n &&
                        destinationItemId ? (
                            <div className='switch-row'>
                                <div>
                                    <strong>Also move the plan</strong>
                                    <span>
                                        Adds {planLabel} to the item you chose
                                    </span>
                                </div>
                                <AppSwitch
                                    accessibilityLabel={`Also move the ${planLabel} plan`}
                                    checked={movePlan}
                                    onCheckedChange={setMovePlan}
                                    variant='carryover'
                                />
                            </div>
                        ) : null}
                    </>
                ) : null}
                <button
                    className='primary-button primary-button--wide danger-button'
                    type='button'
                    disabled={!canConfirm}
                    onClick={() => onConfirm(reassignment)}
                >
                    {pending
                        ? 'Deleting…'
                        : reassignment
                          ? 'Move and delete'
                          : `Delete ${sourceLabel}`}
                </button>
                <button
                    className='text-button'
                    type='button'
                    disabled={pending}
                    onClick={() => onOpenChange(false)}
                >
                    Cancel
                </button>
            </div>
        </Sheet>
    );
}
