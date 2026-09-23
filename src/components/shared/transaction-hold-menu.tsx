'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useHoldMenu } from '@/components/ui/hold-menu';
import { useToast } from '@/components/ui/toast-provider';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';

type TransactionEntry = ActivityEntry & {
    type: Exclude<ActivityEntry['type'], 'income'>;
};

export function useTransactionHoldMenu<Entry extends TransactionEntry>({
    monthKey,
    mutate,
    onDelete,
    onEdit
}: {
    monthKey: MonthSnapshot['monthKey'];
    mutate: (input: BudgetMutation) => boolean | void;
    onDelete: (entry: ActivityEntry) => void;
    onEdit: (entry: Entry) => void;
}) {
    const { getTriggerProps, menu } = useHoldMenu();
    const showToast = useToast();
    const duplicate = (entry: Entry) => {
        const sent = mutate({
            type: 'addTransaction',
            clientMutationId: createUuid(),
            monthKey,
            kind: entry.type,
            merchant: entry.title,
            occurredOn: entry.occurredOn,
            totalCents: entry.amountCents,
            note: entry.note || undefined,
            splits: (entry.allocations ?? []).map((allocation) => ({
                monthlyItemId: allocation.monthlyItemId,
                amountCents: allocation.amountCents
            }))
        });

        if (sent !== false)
            showToast({ message: `${entry.title} duplicated.` });
    };
    const getRowProps = (entry: Entry) =>
        getTriggerProps(`${entry.title} actions`, () => [
            [
                {
                    key: 'edit',
                    label: 'Edit',
                    icon: <Pencil size={20} />,
                    onSelect: () => onEdit(entry)
                },
                {
                    key: 'duplicate',
                    label: 'Duplicate',
                    icon: <Copy size={20} />,
                    onSelect: () => duplicate(entry)
                }
            ],
            [
                {
                    key: 'delete',
                    label: 'Delete',
                    icon: <Trash2 size={20} />,
                    destructive: true,
                    onSelect: () => onDelete(entry)
                }
            ]
        ]);

    return { getRowProps, menu };
}
