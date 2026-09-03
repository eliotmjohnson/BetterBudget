'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { MonthSnapshot } from '@/domain/types';
import { money } from '@/components/shared/budget-view-helpers';
import { remainingAvailableProgress } from './budget-category-section';

export function budgetBalanceView(snapshot: MonthSnapshot) {
    const leftToBudgetCents = BigInt(snapshot.summary.leftToBudgetCents);
    const isOverBudget = leftToBudgetCents < 0n;

    return {
        isOverBudget,
        label: isOverBudget ? 'Over budget' : 'Left to budget',
        amount: money(
            (isOverBudget ? -leftToBudgetCents : leftToBudgetCents).toString()
        )
    };
}

export function BudgetSummaryCard({ snapshot }: { snapshot: MonthSnapshot }) {
    const summaryArcProgressRef = useRef<SVGPathElement>(null);
    const summaryAvailable = snapshot.categories.reduce(
        (total, category) => total + BigInt(category.availableCents),
        0n
    );
    const summarySpent = BigInt(snapshot.summary.spentCents);
    const {
        isOverBudget,
        label: budgetBalanceLabel,
        amount: budgetBalance
    } = budgetBalanceView(snapshot);
    const summaryArcOverflow = Math.max(0, budgetBalance.length - 6);
    const summaryArcStyle = {
        '--summary-arc-width': `${Math.min(
            310,
            232 + summaryArcOverflow * 26
        )}px`,
        '--summary-amount-size': `${Math.max(
            36,
            50 - Math.max(0, budgetBalance.length - 9) * 3
        )}px`
    } as CSSProperties;
    const progress = remainingAvailableProgress(summaryAvailable, summarySpent);
    const summaryArcProgressAngle = Math.PI + (Math.PI * progress) / 100;
    const summaryArcProgressEndX = 116 + 98 * Math.cos(summaryArcProgressAngle);
    const summaryArcProgressEndY = 108 + 98 * Math.sin(summaryArcProgressAngle);

    useLayoutEffect(() => {
        const path = summaryArcProgressRef.current;

        if (!path) return;
        const updateProgressLength = () => {
            const matrix = path.getScreenCTM();

            if (!matrix) return;
            const pathLength = path.getTotalLength();
            const sampleCount = 64;
            const firstPoint = path.getPointAtLength(0);
            let previousX = matrix.a * firstPoint.x + matrix.c * firstPoint.y;
            let previousY = matrix.b * firstPoint.x + matrix.d * firstPoint.y;
            let renderedLength = 0;

            for (let index = 1; index <= sampleCount; index += 1) {
                const point = path.getPointAtLength(
                    (pathLength * index) / sampleCount
                );
                const x = matrix.a * point.x + matrix.c * point.y;
                const y = matrix.b * point.x + matrix.d * point.y;

                renderedLength += Math.hypot(x - previousX, y - previousY);
                previousX = x;
                previousY = y;
            }
            path.style.setProperty(
                '--summary-arc-progress-length',
                `${renderedLength}px`
            );
        };

        updateProgressLength();
        const resizeObserver = new ResizeObserver(updateProgressLength);

        if (path.ownerSVGElement) resizeObserver.observe(path.ownerSVGElement);

        return () => resizeObserver.disconnect();
    }, [progress]);

    return (
        <div className='summary-card budget-summary'>
            <div className='summary-arc' style={summaryArcStyle}>
                <svg
                    viewBox='0 0 232 118'
                    preserveAspectRatio='none'
                    aria-hidden='true'
                >
                    <path
                        d='M18 108 A98 98 0 0 1 214 108'
                        pathLength='100'
                        fill='none'
                        stroke='#eef0f3'
                        strokeWidth='18'
                        strokeLinecap='round'
                        vectorEffect='non-scaling-stroke'
                    />
                    {progress > 0 ? (
                        <path
                            ref={summaryArcProgressRef}
                            className='summary-arc-progress'
                            d={`M18 108 A98 98 0 0 1 ${summaryArcProgressEndX} ${summaryArcProgressEndY}`}
                            fill='none'
                            stroke='#5a91ed'
                            strokeWidth='18'
                            strokeLinecap='round'
                            vectorEffect='non-scaling-stroke'
                        />
                    ) : null}
                </svg>
                <div className='summary-focus'>
                    <span className='summary-label'>{budgetBalanceLabel}</span>
                    <strong
                        className={`summary-amount${isOverBudget ? ' budget-balance-over' : ''}`}
                    >
                        {budgetBalance}
                    </strong>
                </div>
            </div>
            <div className='desktop-summary-copy'>
                <span className='summary-label'>{budgetBalanceLabel}</span>
                <strong
                    className={`summary-amount${isOverBudget ? ' budget-balance-over' : ''}`}
                >
                    {budgetBalance}
                </strong>
            </div>
            <div className='desktop-bars' aria-label='Month totals'>
                <div className='desktop-bar'>
                    <div
                        className='desktop-bar-fill'
                        style={{
                            height: '92px',
                            background: 'var(--mint)'
                        }}
                    />
                    <span>Income</span>
                    <strong>
                        {money(snapshot.summary.expectedIncomeCents)}
                    </strong>
                </div>
                <div className='desktop-bar'>
                    <div
                        className='desktop-bar-fill'
                        style={{
                            height: '82px',
                            background: 'var(--sky)'
                        }}
                    />
                    <span>Planned</span>
                    <strong>{money(snapshot.summary.plannedCents)}</strong>
                </div>
                <div className='desktop-bar'>
                    <div
                        className='desktop-bar-fill'
                        style={{
                            height: '61px',
                            background: 'var(--coral)'
                        }}
                    />
                    <span>Spent</span>
                    <strong>{money(snapshot.summary.spentCents)}</strong>
                </div>
                <div className='desktop-bar'>
                    <div
                        className='desktop-bar-fill'
                        style={{
                            height: '14px',
                            background: 'var(--blue)'
                        }}
                    />
                    <span>{isOverBudget ? 'Over' : 'Left'}</span>
                    <strong
                        className={
                            isOverBudget ? 'budget-balance-over' : undefined
                        }
                    >
                        {budgetBalance}
                    </strong>
                </div>
            </div>
            <div className='summary-stats'>
                <div className='summary-stat'>
                    <span>Income</span>
                    <strong>
                        {money(snapshot.summary.expectedIncomeCents)}
                    </strong>
                </div>
                <div className='summary-stat'>
                    <span>Planned</span>
                    <strong>{money(snapshot.summary.plannedCents)}</strong>
                </div>
                <div className='summary-stat'>
                    <span>Spent</span>
                    <strong>{money(snapshot.summary.spentCents)}</strong>
                </div>
            </div>
        </div>
    );
}
