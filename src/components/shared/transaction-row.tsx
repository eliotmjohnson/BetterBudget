'use client';

import { ChevronRight } from 'lucide-react';
import type { HoldMenuTriggerProps } from '@/components/ui/hold-menu';
import type { ActivityEntry } from '@/domain/types';
import { TransactionIcon } from './transaction-icon';

type TransactionEntry = ActivityEntry & {
    type: Exclude<ActivityEntry['type'], 'income'>;
};

export function TransactionRow({
    amount,
    className,
    entry,
    holdMenuProps,
    onOpen
}: {
    amount: string;
    className?: string;
    entry: TransactionEntry;
    holdMenuProps: HoldMenuTriggerProps;
    onOpen: () => void;
}) {
    return (
        <button
            className={`activity-row${className ? ` ${className}` : ''}`}
            type='button'
            onClick={onOpen}
            {...holdMenuProps}
        >
            <TransactionIcon type={entry.type} tone={entry.tone} />
            <span className='activity-copy'>
                <strong>{entry.title}</strong>
                <span title={entry.subtitle}>{entry.subtitle}</span>
                {entry.split ? <span className='split-tag'>Split</span> : null}
            </span>
            <span className={`activity-amount ${entry.type}`}>{amount}</span>
            <ChevronRight size={17} color='#a2a7af' />
        </button>
    );
}
