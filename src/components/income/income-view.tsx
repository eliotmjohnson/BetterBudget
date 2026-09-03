'use client';

import { ChevronRight, CircleDollarSign, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { IncomePlanView, MonthSnapshot } from '@/domain/types';
import { CategoryIcon } from '@/components/shared/category-icon';
import { createDetailHistory } from '@/components/shared/detail-history';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';
import { AddIncomeSource, RecordIncome } from './income-forms';
import { IncomeSourceDetails } from './income-source-details';

const incomeHistory = createDetailHistory(
    'source',
    'betterBudgetIncomePlanId',
    'betterbudget:income-history'
);

export function IncomeView({
    snapshot,
    mutate
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
}) {
    const searchParams = useSearchParams();
    const requestedPlanId = useSyncExternalStore(
        incomeHistory.subscribe,
        incomeHistory.idFromLocation,
        () => searchParams.get('source')
    );
    const incomeTriggerRef = useRef<HTMLElement | null>(null);
    const [incomeRestoreFocusVisible, setIncomeRestoreFocusVisible] =
        useState(true);
    const [adding, setAdding] = useState(false);
    const [recordingPlanId, setRecordingPlanId] = useState<string | null>(null);
    const selectedPlan = requestedPlanId
        ? (snapshot.incomePlans.find((plan) => plan.id === requestedPlanId) ??
          null)
        : null;
    const recordingPlan =
        snapshot.incomePlans.find((plan) => plan.id === recordingPlanId) ??
        null;

    useEffect(() => {
        if (!requestedPlanId || selectedPlan) return;

        window.history.replaceState(
            incomeHistory.state(),
            '',
            incomeHistory.url()
        );
        incomeHistory.notifyChange();
    }, [requestedPlanId, selectedPlan]);
    const openIncomeSource = (
        plan: IncomePlanView,
        trigger: HTMLButtonElement,
        restoreFocusVisible: boolean
    ) => {
        incomeTriggerRef.current = trigger;
        setIncomeRestoreFocusVisible(restoreFocusVisible);
        window.history.pushState(
            incomeHistory.state(plan.id),
            '',
            incomeHistory.url(plan.id)
        );
        incomeHistory.notifyChange();
    };
    const closeIncomeSource = () => {
        const openedFromIncome =
            incomeHistory.idFromState(window.history.state) === requestedPlanId;

        if (openedFromIncome) {
            window.history.back();

            return;
        }
        window.history.replaceState(
            incomeHistory.state(),
            '',
            incomeHistory.url()
        );
        incomeHistory.notifyChange();
    };
    const expected = BigInt(snapshot.summary.expectedIncomeCents);
    const received = BigInt(snapshot.summary.receivedIncomeCents);
    const hasSurplus = received > expected;
    const expectedDifference = hasSurplus
        ? received - expected
        : expected - received;
    const progress =
        expected > 0n ? Math.min(100, Number((received * 100n) / expected)) : 0;

    return (
        <section className='screen standard-screen'>
            <div className='screen-heading-row'>
                <div>
                    <p className='eyebrow'>{snapshot.label}</p>
                    <h1 className='screen-heading'>Income</h1>
                </div>
                {snapshot.incomePlans.length > 0 ? (
                    <button
                        className='primary-button compact-action'
                        type='button'
                        onClick={() => setAdding(true)}
                    >
                        <Plus size={19} />
                        Add source
                    </button>
                ) : null}
            </div>
            <div className='summary-card income-summary'>
                <span className='summary-label'>Received</span>
                <strong className='summary-amount'>
                    {money(snapshot.summary.receivedIncomeCents)}
                </strong>
                <div className='summary-stats'>
                    <div className='summary-stat'>
                        <span>Expected</span>
                        <strong>
                            {money(snapshot.summary.expectedIncomeCents)}
                        </strong>
                    </div>
                    <div className='summary-stat'>
                        <span>{hasSurplus ? 'Surplus' : 'Remaining'}</span>
                        <strong className={hasSurplus ? 'positive' : ''}>
                            {money(expectedDifference.toString())}
                        </strong>
                    </div>
                    <div className='summary-stat'>
                        <span>Progress</span>
                        <strong>{progress}%</strong>
                    </div>
                </div>
            </div>
            <h2 className='section-title'>Income sources</h2>
            {snapshot.incomePlans.length === 0 ? (
                <div className='income-empty-state'>
                    <div className='income-empty-state-icon' aria-hidden='true'>
                        <CircleDollarSign size={26} />
                    </div>
                    <h3>No income sources for {snapshot.label} yet</h3>
                    <p>
                        Add a paycheck or another expected source to plan this
                        month&apos;s income. Record each payment when it
                        arrives.
                    </p>
                    <button
                        className='primary-button'
                        type='button'
                        onClick={() => setAdding(true)}
                    >
                        <Plus size={18} />
                        Add income source
                    </button>
                </div>
            ) : (
                <div className='income-list'>
                    {snapshot.incomePlans.map((plan) => {
                        const rowProgress =
                            BigInt(plan.expectedCents) > 0n
                                ? Math.min(
                                      100,
                                      Number(
                                          (BigInt(plan.receivedCents) * 100n) /
                                              BigInt(plan.expectedCents)
                                      )
                                  )
                                : 0;

                        return (
                            <button
                                className='income-row income-row-button'
                                type='button'
                                key={plan.id}
                                onClick={(event) =>
                                    openIncomeSource(
                                        plan,
                                        event.currentTarget,
                                        event.detail === 0
                                    )
                                }
                            >
                                <div className='income-row-top'>
                                    <CategoryIcon
                                        icon={plan.icon}
                                        tone={plan.tone}
                                    />
                                    <div className='activity-copy'>
                                        <strong>{plan.name}</strong>
                                        <span>
                                            Expected {money(plan.expectedCents)}
                                        </span>
                                    </div>
                                    <strong>{money(plan.receivedCents)}</strong>
                                    <ChevronRight size={19} />
                                </div>
                                <div className='income-progress'>
                                    <div style={{ width: `${rowProgress}%` }} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
            <AddIncomeSource
                open={adding}
                onOpenChange={setAdding}
                snapshot={snapshot}
                mutate={mutate}
            />
            <IncomeSourceDetails
                plan={selectedPlan}
                snapshot={snapshot}
                mutate={mutate}
                onRecordIncome={() => {
                    if (selectedPlan) setRecordingPlanId(selectedPlan.id);
                }}
                onOpenChange={(open) => {
                    if (!open) closeIncomeSource();
                }}
                restoreFocusRef={incomeTriggerRef}
                restoreFocusVisible={incomeRestoreFocusVisible}
            />
            <RecordIncome
                plan={recordingPlan}
                snapshot={snapshot}
                mutate={mutate}
                onOpenChange={(open) => {
                    if (!open) setRecordingPlanId(null);
                }}
            />
        </section>
    );
}
