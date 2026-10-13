'use client';

import { ChevronRight, Copy, Pencil, Trash2 } from 'lucide-react';
import { useHoldMenu } from '@/components/ui/hold-menu';
import { useToast } from '@/components/ui/toast-provider';
import type {
    IncomePlanView,
    IncomeReceiptView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';

export const receiptDayLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));

export function IncomeReceiptList({
    plan,
    snapshot,
    mutate,
    onDelete,
    onEdit
}: {
    plan: IncomePlanView;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onDelete: (receipt: IncomeReceiptView) => void;
    onEdit: (receipt: IncomeReceiptView) => void;
}) {
    const { getTriggerProps, menu } = useHoldMenu();
    const showToast = useToast();
    const duplicate = (receipt: IncomeReceiptView) => {
        const sent = mutate({
            type: 'addIncomeReceipt',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: plan.id,
            receivedOn: receipt.receivedOn,
            amountCents: receipt.amountCents,
            note: receipt.note || undefined
        });

        if (sent) showToast({ message: `${plan.name} duplicated.` });
    };

    return (
        <div className='income-receipt-list'>
            {plan.receipts.map((receipt) => {
                const amount = `+${money(receipt.amountCents)}`;
                const day = receiptDayLabel(receipt.receivedOn);

                return (
                    <button
                        className='income-receipt-row'
                        key={receipt.id}
                        type='button'
                        aria-haspopup='dialog'
                        onClick={() => onEdit(receipt)}
                        {...getTriggerProps(
                            `${amount} received on ${day} actions`,
                            () => [
                                [
                                    {
                                        key: 'edit',
                                        label: 'Edit',
                                        icon: <Pencil size={20} />,
                                        onSelect: () => onEdit(receipt)
                                    },
                                    {
                                        key: 'duplicate',
                                        label: 'Duplicate',
                                        icon: <Copy size={20} />,
                                        onSelect: () => duplicate(receipt)
                                    }
                                ],
                                [
                                    {
                                        key: 'delete',
                                        label: 'Delete',
                                        icon: <Trash2 size={20} />,
                                        destructive: true,
                                        onSelect: () => onDelete(receipt)
                                    }
                                ]
                            ]
                        )}
                    >
                        <span className='income-receipt-copy'>
                            <strong>{amount}</strong>
                            <span>{day}</span>
                            {receipt.note ? <span>{receipt.note}</span> : null}
                        </span>
                        <ChevronRight size={17} color='#a2a7af' />
                    </button>
                );
            })}
            {menu}
        </div>
    );
}
