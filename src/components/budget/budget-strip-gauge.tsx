'use client';

import type { BudgetAmountView } from '@/domain/budget-preferences';
import type { MonthSnapshot } from '@/domain/types';
import { StripButton } from '@/components/shared/strip-button';
import {
    budgetBalanceView,
    summaryArcProgress,
    summaryArcTrack
} from './budget-summary-card';

/**
 * The folded iPhone Duo's stand-in for the docked balance strip: the summary
 * arc and Left to budget in a glass capsule in the side strip. A tap flips the
 * rows between Planned and Remaining, as the strip's P/R switch does, and the
 * P·R mark under the amount shows which is on. It sits directly above the tab
 * bar, at its width, with the floating plus above it.
 */
export function BudgetStripGauge({
    snapshot,
    visible,
    amountView,
    onAmountViewChange
}: {
    snapshot: MonthSnapshot;
    visible: boolean;
    amountView: BudgetAmountView;
    onAmountViewChange: (view: BudgetAmountView) => void;
}) {
    const { isOverBudget, label, amount } = budgetBalanceView(snapshot);
    const { progress, path } = summaryArcProgress(snapshot);
    const available = amountView === 'available';

    return (
        <StripButton
            visible={visible}
            label={`${label} ${amount}. Show remaining amounts`}
            pressed={available}
            shape='tall'
            onPress={() =>
                onAmountViewChange(available ? 'planned' : 'available')
            }
        >
            <svg
                aria-hidden='true'
                className='budget-strip-gauge-arc'
                viewBox='0 0 232 118'
            >
                <path
                    d={summaryArcTrack}
                    fill='none'
                    stroke='#e3e7ee'
                    strokeWidth='5'
                    strokeLinecap='round'
                    vectorEffect='non-scaling-stroke'
                />
                {progress > 0 ? (
                    <path
                        d={path}
                        fill='none'
                        stroke='#5a91ed'
                        strokeWidth='5'
                        strokeLinecap='round'
                        vectorEffect='non-scaling-stroke'
                    />
                ) : null}
            </svg>
            <strong
                className='budget-strip-gauge-amount'
                data-state={isOverBudget ? 'negative' : 'positive'}
                aria-hidden='true'
            >
                {amount}
            </strong>
            <span
                className='budget-strip-gauge-view'
                data-view={amountView}
                aria-hidden='true'
            >
                <span className='planned'>P</span>
                <span className='budget-strip-gauge-dot' />
                <span className='available'>R</span>
            </span>
        </StripButton>
    );
}
