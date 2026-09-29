'use client';

import { useLayoutEffect, useRef } from 'react';
import type { MonthSnapshot } from '@/domain/types';
import { trackDockedSummary } from '@/components/ui/docked-summary';
import { mobileMedia } from '@/components/ui/navigation-detail/title-motion';
import {
    budgetBalanceView,
    summaryArcProgress,
    summaryArcTrack
} from './budget-summary-card';

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

export function BudgetBalanceStrip({ snapshot }: { snapshot: MonthSnapshot }) {
    const dockRef = useRef<HTMLDivElement>(null);
    const { isOverBudget, label, amount } = budgetBalanceView(snapshot);
    const { progress, path } = summaryArcProgress(snapshot);

    useLayoutEffect(() => setupBalanceStrip(dockRef.current), []);

    return (
        <div ref={dockRef} className='budget-balance-dock' aria-hidden='true'>
            <div
                className='budget-balance-clip'
                data-scroll-progress={progressProperty}
            >
                <div
                    className='budget-balance-strip'
                    data-state={isOverBudget ? 'negative' : 'positive'}
                >
                    <svg
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
                    <span className='summary-label'>{label}</span>
                    <strong
                        className={`summary-amount${isOverBudget ? ' budget-balance-over' : ''}`}
                    >
                        {amount}
                    </strong>
                </div>
            </div>
        </div>
    );
}
