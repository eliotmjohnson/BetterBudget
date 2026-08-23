'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NavigationDetail } from '@/components/ui/navigation-detail';
import { useToast } from '@/components/ui/toast-provider';
import {
    BUDGET_AMOUNT_VIEW_COOKIE,
    type BudgetAmountView
} from '@/domain/budget-preferences';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import type { BudgetMutation } from '@/server/mutation-schema';
import { AppShell, type AppView } from './app-shell';
import { BudgetView } from './budget-view';
import { IncomeView } from './income-view';
import { MonthActionsSheet } from './month-actions-sheet';
import { optimisticSnapshot } from './optimistic';
import { OrganizerView } from './organizer-view';
import { SettingsView } from './settings-view';
import { TransactionsView } from './transactions-view';
import {
    useBudgetMutation,
    useBudgetSnapshot,
    useConnectivity,
    useDelayedSyncIndicator
} from './use-budget-data';

function viewFromPathname(pathname: string, fallback: AppView): AppView {
    if (pathname === '/transactions') return 'transactions';
    if (pathname === '/income') return 'income';
    if (pathname === '/settings') return 'settings';
    if (pathname === '/organize') return 'organize';
    if (pathname === '/') return 'budget';

    return fallback;
}

const organizerHistoryStateKey = 'betterBudgetOrganizerMonth';

export function BudgetApp({
    initialBudgetAmountView,
    initialSnapshot,
    view
}: {
    initialBudgetAmountView: BudgetAmountView;
    initialSnapshot: MonthSnapshot;
    view: AppView;
}) {
    const pathname = usePathname();
    const { data: snapshot } = useBudgetSnapshot(initialSnapshot);
    const activeView = viewFromPathname(pathname, view);
    const online = useConnectivity();
    const syncing = useDelayedSyncIndicator();
    const showToast = useToast();
    const organizerTriggerRef = useRef<HTMLElement | null>(null);
    const organizerRestoreFocusVisibleRef = useRef(true);
    const [monthActionsOpen, setMonthActionsOpen] = useState(false);
    const [defaultBudgetAmountView, setDefaultBudgetAmountView] = useState(
        initialBudgetAmountView
    );
    const [budgetAnimationKey, setBudgetAnimationKey] = useState(0);
    const budgetMutation = useBudgetMutation(
        snapshot.monthKey,
        optimisticSnapshot,
        (message) => showToast({ message }),
        (input) => {
            if (input.type === 'copyPreviousMonth')
                setBudgetAnimationKey((current) => current + 1);
        }
    );
    const mutate = (input: BudgetMutation) => {
        if (!online) {
            showToast({
                message: 'Reconnect before saving financial changes.'
            });

            return false;
        }
        budgetMutation.mutate(input);

        return true;
    };
    const deleteTransaction = (entry: ActivityEntry) => {
        const deletion: BudgetMutation = {
            type: 'deleteTransaction',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            transactionId: entry.id,
            expectedVersion: entry.version
        };

        if (!mutate(deletion)) return;
        showToast({
            message: `${entry.title} deleted.`,
            actionLabel: 'Undo',
            action: () => {
                mutate({
                    type: 'undoDeleteTransaction',
                    clientMutationId: createUuid(),
                    monthKey: snapshot.monthKey,
                    transactionId: entry.id,
                    expectedVersion: entry.version + 1
                });
            }
        });
    };
    const navigateView = (nextView: AppView) => {
        if (nextView === activeView) return;
        const nextPath = nextView === 'budget' ? '/' : `/${nextView}`;

        window.history.pushState(
            null,
            '',
            `${nextPath}?month=${snapshot.monthKey}`
        );
    };
    const openOrganizer = (
        trigger: HTMLAnchorElement,
        restoreFocusVisible: boolean
    ) => {
        organizerTriggerRef.current = trigger;
        organizerRestoreFocusVisibleRef.current = restoreFocusVisible;
        if (restoreFocusVisible)
            delete trigger.dataset.navigationDetailRestoredFocus;
        else trigger.dataset.navigationDetailRestoredFocus = 'true';
        window.history.pushState(
            { [organizerHistoryStateKey]: snapshot.monthKey },
            '',
            `/organize?month=${snapshot.monthKey}`
        );
    };
    const closeOrganizer = () => {
        const currentState = window.history.state;
        const openedFromSettings =
            currentState &&
            typeof currentState === 'object' &&
            (currentState as Record<string, unknown>)[
                organizerHistoryStateKey
            ] === snapshot.monthKey;

        if (openedFromSettings) {
            window.history.back();

            return;
        }
        window.history.replaceState(
            null,
            '',
            `/settings?month=${snapshot.monthKey}`
        );
    };
    const settingsSurface =
        activeView === 'settings' || activeView === 'organize';
    const content =
        activeView === 'transactions' ? (
            <TransactionsView
                snapshot={snapshot}
                mutate={mutate}
                onDelete={deleteTransaction}
            />
        ) : activeView === 'income' ? (
            <IncomeView snapshot={snapshot} mutate={mutate} />
        ) : settingsSurface ? (
            <SettingsView
                defaultBudgetAmountView={defaultBudgetAmountView}
                monthKey={snapshot.monthKey}
                onDefaultBudgetAmountViewChange={(nextView) => {
                    setDefaultBudgetAmountView(nextView);
                    document.cookie = `${BUDGET_AMOUNT_VIEW_COOKIE}=${nextView}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
                }}
                onOrganize={openOrganizer}
                onMessage={(message) => showToast({ message })}
            />
        ) : (
            <BudgetScreen
                animationKey={budgetAnimationKey}
                defaultAmountView={defaultBudgetAmountView}
                mutationPending={budgetMutation.isPending}
                snapshot={snapshot}
                mutate={mutate}
                onDeleteTransaction={deleteTransaction}
            />
        );

    return (
        <AppShell
            view={activeView}
            monthKey={snapshot.monthKey}
            monthLabel={snapshot.label}
            onViewChange={navigateView}
            onMonthActions={() => setMonthActionsOpen(true)}
            online={online}
            syncing={syncing}
            mutationPending={budgetMutation.isPending}
        >
            {content}
            {settingsSurface ? (
                <NavigationDetail
                    backLabel='Settings'
                    open={activeView === 'organize'}
                    onOpenChange={(open) => {
                        if (!open) closeOrganizer();
                    }}
                    restoreFocusRef={organizerTriggerRef}
                    restoreFocusPreferenceRef={organizerRestoreFocusVisibleRef}
                    title='Organize budget'
                >
                    <OrganizerView snapshot={snapshot} mutate={mutate} />
                </NavigationDetail>
            ) : null}
            <MonthActionsSheet
                open={monthActionsOpen}
                onOpenChange={setMonthActionsOpen}
                snapshot={snapshot}
                mutate={mutate}
                mutationPending={budgetMutation.isPending}
            />
        </AppShell>
    );
}

function BudgetScreen({
    animationKey,
    defaultAmountView,
    mutationPending,
    snapshot,
    mutate,
    onDeleteTransaction
}: {
    animationKey: number;
    defaultAmountView: BudgetAmountView;
    mutationPending: boolean;
    snapshot: MonthSnapshot;
    mutate: (input: BudgetMutation) => boolean;
    onDeleteTransaction: (entry: ActivityEntry) => void;
}) {
    const [amountView, setAmountView] = useState(defaultAmountView);

    return (
        <BudgetView
            amountView={amountView}
            animationKey={animationKey}
            mutationPending={mutationPending}
            snapshot={snapshot}
            mutate={mutate}
            onAmountViewChange={setAmountView}
            onDeleteTransaction={onDeleteTransaction}
        />
    );
}
