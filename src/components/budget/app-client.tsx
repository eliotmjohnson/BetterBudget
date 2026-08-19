'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';
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

export function BudgetApp({
    initialSnapshot,
    view
}: {
    initialSnapshot: MonthSnapshot;
    view: AppView;
}) {
    const pathname = usePathname();
    const { data: snapshot } = useBudgetSnapshot(initialSnapshot);
    const activeView = viewFromPathname(pathname, view);
    const online = useConnectivity();
    const syncing = useDelayedSyncIndicator();
    const showToast = useToast();
    const [monthActionsOpen, setMonthActionsOpen] = useState(false);
    const budgetMutation = useBudgetMutation(
        snapshot.monthKey,
        optimisticSnapshot,
        (message) => showToast({ message })
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
                    transactionId: entry.id
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
    const content =
        activeView === 'transactions' ? (
            <TransactionsView
                snapshot={snapshot}
                mutate={mutate}
                onDelete={deleteTransaction}
            />
        ) : activeView === 'income' ? (
            <IncomeView snapshot={snapshot} mutate={mutate} />
        ) : activeView === 'organize' ? (
            <OrganizerView snapshot={snapshot} mutate={mutate} />
        ) : activeView === 'settings' ? (
            <SettingsView onMessage={(message) => showToast({ message })} />
        ) : (
            <BudgetView
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
