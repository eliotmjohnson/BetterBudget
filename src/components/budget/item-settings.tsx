'use client';

import { Bell, ChevronRight, Repeat } from 'lucide-react';
import { useRef, useState } from 'react';
import {
    BillReminderSheet,
    billReminderSummary,
    updateBillReminder
} from '@/components/budget/bill-reminder-sheet';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';
import { usePushNotifications } from '@/components/shared/use-push-notifications';
import { AppSwitch } from '@/components/ui/app-switch';
import { monthLabel, shiftMonth, type MonthKey } from '@/domain/money';
import type { BudgetItemView } from '@/domain/types';
import { createUuid } from '@/domain/uuid';

export function ItemSettings({
    item,
    monthKey,
    mutate
}: {
    item: BudgetItemView;
    monthKey: MonthKey;
    mutate: Mutate;
}) {
    const { state: pushState } = usePushNotifications();
    const [billSheetOpen, setBillSheetOpen] = useState(false);
    const [billRestoreFocusVisible, setBillRestoreFocusVisible] =
        useState(false);
    const billRowRef = useRef<HTMLButtonElement>(null);

    return (
        <>
            <div className='settings-list item-settings'>
                <div className='settings-row static-row'>
                    <Repeat size={20} />
                    <span>
                        <strong>Carry over</strong>
                        <small>Add any remaining balance next month</small>
                    </span>
                    <AppSwitch
                        accessibilityLabel='Carry over remaining balance'
                        checked={item.carryoverEnabled}
                        onCheckedChange={(enabled) =>
                            mutate({
                                type: 'toggleCarryover',
                                clientMutationId: createUuid(),
                                monthKey,
                                monthlyItemId: item.id,
                                enabled,
                                expectedVersion: item.version
                            })
                        }
                        variant='setting'
                    />
                </div>
                <div className='settings-row item-settings-split-row'>
                    <button
                        ref={billRowRef}
                        className='item-settings-row-button'
                        type='button'
                        disabled={!item.billReminderEnabled}
                        aria-haspopup='dialog'
                        aria-expanded={billSheetOpen}
                        onClick={(event) => {
                            setBillRestoreFocusVisible(event.detail === 0);
                            setBillSheetOpen(true);
                        }}
                    >
                        <Bell size={20} />
                        <span>
                            <strong>Bill reminder</strong>
                            <small>{billReminderSummary(item)}</small>
                        </span>
                        {item.billReminderEnabled ? (
                            <ChevronRight
                                className='item-settings-chevron'
                                size={22}
                                strokeWidth={2.5}
                                aria-hidden='true'
                            />
                        ) : null}
                    </button>
                    <AppSwitch
                        accessibilityLabel='Bill reminder'
                        checked={item.billReminderEnabled}
                        onCheckedChange={(enabled) => {
                            updateBillReminder(mutate, item, monthKey, {
                                enabled
                            });
                            setBillRestoreFocusVisible(false);
                            setBillSheetOpen(enabled);
                        }}
                        variant='setting'
                    />
                </div>
            </div>
            {BigInt(item.carryInCents) !== 0n || item.carryoverEnabled ? (
                <div className='carryover-callout'>
                    <div className='carryover-callout-row'>
                        <span>
                            Carried over from{' '}
                            {monthLabel(shiftMonth(monthKey, -1))}
                        </span>
                        <strong>{money(item.carryInCents)}</strong>
                    </div>
                    {item.carryoverEnabled ? (
                        <div className='carryover-callout-row'>
                            <span>
                                Will carry over to{' '}
                                {monthLabel(shiftMonth(monthKey, 1))}
                            </span>
                            <strong>{money(item.availableCents)}</strong>
                        </div>
                    ) : null}
                </div>
            ) : null}
            <BillReminderSheet
                item={item}
                monthKey={monthKey}
                mutate={mutate}
                open={billSheetOpen}
                onOpenChange={setBillSheetOpen}
                pushState={pushState}
                restoreFocusRef={billRowRef}
                restoreFocusVisible={billRestoreFocusVisible}
            />
        </>
    );
}
