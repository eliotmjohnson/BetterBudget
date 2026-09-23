'use client';

import type { BudgetItemView } from '@/domain/types';
import { fitAmountStyle, money } from '@/components/shared/budget-view-helpers';

function itemRemaining(item: BudgetItemView) {
    const remainingCents = BigInt(item.availableCents);
    const over = remainingCents < 0n;

    return {
        amount: money((over ? -remainingCents : remainingCents).toString()),
        label: over ? 'Over budget this month' : 'Remaining this month',
        over,
        state: over ? 'negative' : remainingCents > 0n ? 'positive' : 'neutral'
    };
}

export function ItemRemainingCard({ item }: { item: BudgetItemView }) {
    const { amount, label, over, state } = itemRemaining(item);

    return (
        <div className='line-item-remaining' data-state={state}>
            <span className='line-item-remaining-label'>{label}</span>
            <strong
                data-navigation-detail-summary-anchor
                style={fitAmountStyle(amount)}
            >
                {amount}
            </strong>
            <span className='line-item-remaining-note'>
                {over
                    ? "Beyond this month's available funds"
                    : "Available after this month's activity"}
            </span>
        </div>
    );
}

export function ItemRemainingStrip({ item }: { item: BudgetItemView }) {
    const { amount, label, state } = itemRemaining(item);

    return (
        <div className='line-item-remaining-strip' data-state={state}>
            <span className='line-item-remaining-label'>{label}</span>
            <strong>{amount}</strong>
        </div>
    );
}
