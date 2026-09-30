'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import {
    money,
    signedMoney,
    spentView,
    type Mutate
} from '@/components/shared/budget-view-helpers';
import { budgetBalanceView } from './budget-summary-card';

const shortDayLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));

export function BudgetRail({
    snapshot,
    mutate,
    onAddTransaction,
    onDeleteTransaction
}: {
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onAddTransaction: (() => void) | null;
    onDeleteTransaction: (entry: ActivityEntry) => void;
}) {
    const [selectedTransaction, setSelectedTransaction] =
        useState<ActivityEntry | null>(null);
    const [editingOpen, setEditingOpen] = useState(false);
    const balance = budgetBalanceView(snapshot);
    const spent = spentView(snapshot.summary.spentCents);
    const recent = snapshot.activity
        .filter((entry) => entry.type !== 'income')
        .slice(0, 5);

    return (
        <aside className='right-rail'>
            {onAddTransaction ? (
                <div className='rail-section'>
                    <button
                        className='primary-button rail-primary-action'
                        type='button'
                        onClick={onAddTransaction}
                    >
                        <Plus size={18} />
                        Add transaction
                    </button>
                </div>
            ) : null}
            <div className='rail-section'>
                <h2 className='rail-title'>{snapshot.label} Summary</h2>
                <div className='rail-stat'>
                    <span>{balance.label}</span>
                    <strong
                        className={`budget-balance${balance.isOverBudget ? ' budget-balance-over' : ''}`}
                    >
                        {balance.amount}
                    </strong>
                </div>
                <div className='rail-stat'>
                    <span>Income</span>
                    <strong>
                        {money(snapshot.summary.expectedIncomeCents)}
                    </strong>
                </div>
                <div className='rail-stat'>
                    <span>Planned</span>
                    <strong>{money(snapshot.summary.plannedCents)}</strong>
                </div>
                <div className='rail-stat'>
                    <span>{spent.label}</span>
                    <strong className={spent.added ? 'positive' : undefined}>
                        {spent.amount}
                    </strong>
                </div>
            </div>
            <div className='rail-section'>
                <h2 className='rail-title'>Recent transactions</h2>
                {recent.length === 0 ? (
                    <p className='rail-empty'>No transactions this month.</p>
                ) : null}
                {recent.map((entry) => (
                    <button
                        className='rail-activity'
                        type='button'
                        key={entry.id}
                        aria-label={`Edit ${entry.title}, ${signedMoney(entry.type, entry.amountCents)}`}
                        onClick={() => {
                            setSelectedTransaction(entry);
                            setEditingOpen(true);
                        }}
                    >
                        <span>{shortDayLabel(entry.occurredOn)}</span>
                        <strong>{entry.title}</strong>
                        <span>
                            {signedMoney(entry.type, entry.amountCents)}
                        </span>
                    </button>
                ))}
            </div>
            {selectedTransaction ? (
                <TransactionSheet
                    key={selectedTransaction.id}
                    open={editingOpen}
                    onOpenChange={setEditingOpen}
                    onExitComplete={() => setSelectedTransaction(null)}
                    snapshot={snapshot}
                    mutate={mutate}
                    transaction={selectedTransaction}
                    onDelete={onDeleteTransaction}
                />
            ) : null}
        </aside>
    );
}
