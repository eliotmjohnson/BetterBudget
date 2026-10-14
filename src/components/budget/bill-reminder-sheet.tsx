'use client';

import { useState, type RefObject } from 'react';
import type { Mutate } from '@/components/shared/budget-view-helpers';
import type { PushState } from '@/components/shared/use-push-notifications';
import { AppSwitch } from '@/components/ui/app-switch';
import { Sheet } from '@/components/ui/sheet';
import {
    BILL_LEAD_DAYS,
    isBillLeadDays,
    ordinalDay,
    type BillLeadDays
} from '@/domain/bill-reminders';
import { monthLabel, type MonthKey } from '@/domain/money';
import type { BudgetItemView } from '@/domain/types';
import { createUuid } from '@/domain/uuid';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const LEAD_LABELS: Record<BillLeadDays, string> = {
    0: 'On the due date',
    1: '1 day before',
    3: '3 days before',
    7: '7 days before'
};

export interface BillReminderChange {
    enabled?: boolean;
    dueDay?: number;
    leadDays?: BillLeadDays;
}

/** Commits a bill reminder change on the item definition, keeping the rest. */
export function updateBillReminder(
    mutate: Mutate,
    item: BudgetItemView,
    monthKey: MonthKey,
    changes: BillReminderChange
) {
    return mutate({
        type: 'updateBillReminder',
        clientMutationId: createUuid(),
        monthKey,
        itemId: item.definitionId,
        enabled: changes.enabled ?? item.billReminderEnabled,
        dueDay: changes.dueDay ?? item.billDueDay ?? 1,
        leadDays: changes.leadDays ?? item.billLeadDays,
        expectedVersion: item.definitionVersion
    });
}

/** The line-item row's secondary text for its bill reminder. */
export function billReminderSummary(item: BudgetItemView): string {
    if (!item.billReminderEnabled || item.billDueDay === null)
        return 'Get a notification before it’s due';
    const dueDay = item.billDueDayOverride ?? item.billDueDay;

    return `Due the ${ordinalDay(dueDay)} · ${LEAD_LABELS[item.billLeadDays]}`;
}

export function BillReminderSheet({
    item,
    monthKey,
    mutate,
    open,
    onOpenChange,
    pushState,
    restoreFocusRef,
    restoreFocusVisible
}: {
    item: BudgetItemView;
    monthKey: MonthKey;
    mutate: Mutate;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pushState: PushState;
    restoreFocusRef: RefObject<HTMLElement | null>;
    restoreFocusVisible: boolean;
}) {
    const update = (changes: BillReminderChange) =>
        updateBillReminder(mutate, item, monthKey, changes);
    const usualDay = item.billDueDay ?? 1;
    const [overrideChosen, setOverrideOpen] = useState(false);
    const overrideOpen = overrideChosen || item.billDueDayOverride !== null;

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) setOverrideOpen(false);
                onOpenChange(next);
            }}
            restoreFocusRef={restoreFocusRef}
            restoreFocusVisible={restoreFocusVisible}
            title='Bill reminder'
            variant='raised-mobile'
        >
            <div className='form-grid'>
                <div className='bill-reminder-fields'>
                    <div className='field'>
                        <label htmlFor='bill-due-day'>
                            Due every month on the
                        </label>
                        <select
                            id='bill-due-day'
                            value={usualDay}
                            onChange={(event) =>
                                update({
                                    dueDay: Number(event.target.value)
                                })
                            }
                        >
                            {DAYS.map((day) => (
                                <option key={day} value={day}>
                                    {ordinalDay(day)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className='field'>
                        <label htmlFor='bill-lead-days'>Notify me</label>
                        <select
                            id='bill-lead-days'
                            value={item.billLeadDays}
                            onChange={(event) => {
                                const leadDays = Number(event.target.value);

                                if (isBillLeadDays(leadDays))
                                    update({ leadDays });
                            }}
                        >
                            {BILL_LEAD_DAYS.map((days) => (
                                <option key={days} value={days}>
                                    {LEAD_LABELS[days]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <BillDueOverride
                    item={item}
                    monthKey={monthKey}
                    mutate={mutate}
                    open={overrideOpen}
                    onOpenChange={setOverrideOpen}
                />
                {item.billReminderEnabled &&
                pushState !== 'on' &&
                pushState !== 'loading' ? (
                    <p className='confirmation-copy'>
                        Turn on notifications in Settings to get these alerts on
                        this device.
                    </p>
                ) : null}
            </div>
        </Sheet>
    );
}

function BillDueOverride({
    item,
    monthKey,
    mutate,
    open,
    onOpenChange
}: {
    item: BudgetItemView;
    monthKey: MonthKey;
    mutate: Mutate;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const usualDay = item.billDueDay ?? 1;
    const setOverride = (dueDay: number | null) =>
        mutate({
            type: 'setBillDueOverride',
            clientMutationId: createUuid(),
            monthKey,
            monthlyItemId: item.id,
            dueDay,
            expectedVersion: item.version
        });

    return (
        <div className='switch-row bill-override-row'>
            <div>
                <strong>Different day this month</strong>
                <span>{monthLabel(monthKey)} only</span>
            </div>
            <div className='bill-override-controls'>
                {open ? (
                    <div className='field bill-override-field'>
                        <select
                            aria-label={`Due day in ${monthLabel(monthKey)}`}
                            value={item.billDueDayOverride ?? ''}
                            onChange={(event) =>
                                setOverride(Number(event.target.value))
                            }
                        >
                            {item.billDueDayOverride === null ? (
                                <option value='' disabled>
                                    Day
                                </option>
                            ) : null}
                            {DAYS.filter((day) => day !== usualDay).map(
                                (day) => (
                                    <option key={day} value={day}>
                                        {ordinalDay(day)}
                                    </option>
                                )
                            )}
                        </select>
                    </div>
                ) : null}
                <AppSwitch
                    accessibilityLabel={`Different due day in ${monthLabel(monthKey)}`}
                    checked={open}
                    onCheckedChange={(checked) => {
                        onOpenChange(checked);
                        if (!checked && item.billDueDayOverride !== null)
                            setOverride(null);
                    }}
                    variant='setting'
                />
            </div>
        </div>
    );
}
