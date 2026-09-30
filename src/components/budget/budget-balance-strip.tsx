'use client';

import { useLayoutEffect, useRef } from 'react';
import type { BudgetAmountView } from '@/domain/budget-preferences';
import type { MonthSnapshot } from '@/domain/types';
import { AppSwitch } from '@/components/ui/app-switch';
import { trackDockedSummary } from '@/components/ui/docked-summary';
import { mobileMedia } from '@/components/ui/navigation-detail/title-motion';
import {
    budgetBalanceView,
    summaryArcProgress,
    summaryArcTrack
} from './budget-summary-card';

export const budgetBalanceStripHeight = 44;
const shadowReach = 40;
const anchorSelector = '[data-budget-balance-anchor]';
const progressProperty = '--budget-balance-progress';

function offsetWithin(element: HTMLElement, scroller: HTMLElement) {
    let top = 0;
    let current: Element | null = element;

    while (current instanceof HTMLElement && current !== scroller) {
        top += current.offsetTop;
        current = current.offsetParent;
    }

    return current === scroller ? top : null;
}

function setupBalanceStrip(dock: HTMLElement | null) {
    const scroller = dock?.closest<HTMLElement>('.app-content');
    const clip = dock?.firstElementChild;
    const anchor = scroller?.querySelector<HTMLElement>(anchorSelector);

    if (!dock || !scroller || !(clip instanceof HTMLElement) || !anchor) return;

    return trackDockedSummary({
        measure: () => {
            const anchorTop = offsetWithin(anchor, scroller);

            if (anchorTop === null) return null;

            const dockTop =
                (parseFloat(getComputedStyle(scroller).paddingTop) || 0) +
                (parseFloat(getComputedStyle(dock).top) || 0);
            const start = Math.max(0, anchorTop - dockTop - shadowReach);
            const end = Math.max(
                start + 1,
                anchorTop + anchor.offsetHeight - dockTop
            );

            dock.style.setProperty('--budget-balance-start', `${start}px`);
            dock.style.setProperty('--budget-balance-end', `${end}px`);

            return { start, end };
        },
        media: mobileMedia,
        observed: [scroller, anchor],
        progressProperty,
        scrollDriven:
            CSS.supports('animation-timeline: scroll()') &&
            CSS.supports('animation-range: 0px 1px'),
        scroller,
        summary: clip
    });
}

function StripAmountSwitch({
    amountView,
    visible,
    onAmountViewChange
}: {
    amountView: BudgetAmountView;
    visible: boolean;
    onAmountViewChange: (view: BudgetAmountView) => void;
}) {
    return (
        <div
            className='budget-balance-switch'
            role='group'
            aria-label='Budget amount display'
            data-visible={visible ? 'true' : 'false'}
            inert={!visible}
        >
            <button
                className='budget-balance-switch-label planned'
                type='button'
                aria-label='Planned'
                aria-pressed={amountView === 'planned'}
                onClick={() => onAmountViewChange('planned')}
            >
                P
            </button>
            <AppSwitch
                accessibilityLabel='Show available amounts'
                checked={amountView === 'available'}
                onCheckedChange={(available) =>
                    onAmountViewChange(available ? 'available' : 'planned')
                }
                variant='budget-view'
            />
            <button
                className='budget-balance-switch-label available'
                type='button'
                aria-label='Remaining'
                aria-pressed={amountView === 'available'}
                onClick={() => onAmountViewChange('available')}
            >
                R
            </button>
        </div>
    );
}

export function BudgetBalanceStrip({
    snapshot,
    amountView,
    switchVisible,
    onAmountViewChange
}: {
    snapshot: MonthSnapshot;
    amountView: BudgetAmountView;
    switchVisible: boolean;
    onAmountViewChange: (view: BudgetAmountView) => void;
}) {
    const dockRef = useRef<HTMLDivElement>(null);
    const { isOverBudget, label, amount } = budgetBalanceView(snapshot);
    const { progress, path } = summaryArcProgress(snapshot);

    useLayoutEffect(() => setupBalanceStrip(dockRef.current), []);

    return (
        <div ref={dockRef} className='budget-balance-dock'>
            <div
                className='budget-balance-clip'
                data-scroll-progress={progressProperty}
            >
                <div
                    className='budget-balance-strip'
                    data-state={isOverBudget ? 'negative' : 'positive'}
                    data-switch={switchVisible ? 'shown' : 'hidden'}
                >
                    <svg
                        aria-hidden='true'
                        className='budget-balance-arc'
                        viewBox='0 0 232 118'
                        preserveAspectRatio='none'
                    >
                        <path
                            d={summaryArcTrack}
                            fill='none'
                            stroke='#eef0f3'
                            strokeWidth='4'
                            strokeLinecap='round'
                            vectorEffect='non-scaling-stroke'
                        />
                        {progress > 0 ? (
                            <path
                                d={path}
                                fill='none'
                                stroke='#5a91ed'
                                strokeWidth='4'
                                strokeLinecap='round'
                                vectorEffect='non-scaling-stroke'
                            />
                        ) : null}
                    </svg>
                    <span className='summary-label' aria-hidden='true'>
                        {label}
                    </span>
                    <strong
                        className={`summary-amount${isOverBudget ? ' budget-balance-over' : ''}`}
                        aria-hidden='true'
                    >
                        {amount}
                    </strong>
                    <StripAmountSwitch
                        amountView={amountView}
                        visible={switchVisible}
                        onAmountViewChange={onAmountViewChange}
                    />
                </div>
            </div>
        </div>
    );
}
