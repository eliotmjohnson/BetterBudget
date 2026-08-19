'use client';

import {
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    List,
    PieChart,
    Settings
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { shiftMonth, type MonthKey } from '@/domain/money';
import { MonthPicker } from './month-picker';

export type AppView =
    'budget' | 'transactions' | 'income' | 'settings' | 'organize';

const nav = [
    { view: 'budget' as const, href: '/', label: 'Budget', icon: PieChart },
    {
        view: 'transactions' as const,
        href: '/transactions',
        label: 'Transactions',
        icon: List
    },
    {
        view: 'income' as const,
        href: '/income',
        label: 'Income',
        icon: CircleDollarSign
    },
    {
        view: 'settings' as const,
        href: '/settings',
        label: 'Settings',
        icon: Settings
    }
];

export function AppShell({
    view,
    monthKey,
    monthLabel,
    onViewChange,
    onMonthActions,
    online,
    syncing,
    mutationPending,
    children
}: {
    view: AppView;
    monthKey: MonthKey;
    monthLabel: string;
    onViewChange: (view: AppView) => void;
    onMonthActions: () => void;
    online: boolean;
    syncing: boolean;
    mutationPending: boolean;
    children: ReactNode;
}) {
    const router = useRouter();
    const path = view === 'budget' ? '/' : `/${view}`;
    const monthHref = (month: MonthKey) => `${path}?month=${month}`;
    const navigate = (
        event: MouseEvent<HTMLAnchorElement>,
        nextView: AppView
    ) => {
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        )
            return;
        event.preventDefault();
        onViewChange(nextView);
    };

    return (
        <div className='app-frame'>
            <aside className='desktop-sidebar'>
                <BrandMark />
                <nav className='desktop-nav' aria-label='Primary navigation'>
                    {nav.map(({ view: itemView, href, label, icon: Icon }) => (
                        <a
                            key={itemView}
                            className={`nav-item ${view === itemView || (view === 'organize' && itemView === 'settings') ? 'active' : ''}`}
                            href={`${href}?month=${monthKey}`}
                            aria-current={
                                view === itemView ? 'page' : undefined
                            }
                            onClick={(event) => navigate(event, itemView)}
                        >
                            <Icon size={19} strokeWidth={1.8} />
                            <span>{label}</span>
                        </a>
                    ))}
                </nav>
            </aside>
            <main className='app-main'>
                <header className='mobile-header'>
                    <BrandMark compact />
                    <div
                        className='month-switcher'
                        aria-label={`Selected month ${monthLabel}`}
                    >
                        <Link
                            className='icon-button'
                            href={monthHref(shiftMonth(monthKey, -1))}
                            aria-label='Previous month'
                        >
                            <ChevronLeft size={20} />
                        </Link>
                        <MonthPicker
                            monthKey={monthKey}
                            monthLabel={monthLabel}
                            onSelect={(month) => router.push(monthHref(month))}
                        />
                        <Link
                            className='icon-button'
                            href={monthHref(shiftMonth(monthKey, 1))}
                            aria-label='Next month'
                        >
                            <ChevronRight size={20} />
                        </Link>
                    </div>
                    <button
                        className='icon-button'
                        onClick={onMonthActions}
                        disabled={mutationPending}
                        aria-label={
                            mutationPending
                                ? 'Month actions unavailable while saving'
                                : view === 'budget'
                                  ? 'Month actions'
                                  : 'Settings'
                        }
                    >
                        <Settings size={21} strokeWidth={1.8} />
                    </button>
                </header>
                {online ? null : (
                    <div className='offline-banner' role='status'>
                        You’re offline. Unsaved changes will stay in their forms
                        until you reconnect.
                    </div>
                )}
                {syncing ? (
                    <div className='sync-indicator' role='status'>
                        <span className='sync-dot' />
                        Still saving…
                    </div>
                ) : null}
                <div
                    key={`${view}-${monthKey}`}
                    className='app-content app-content--enter'
                >
                    {children}
                </div>
            </main>
            <nav className='bottom-nav' aria-label='Primary navigation'>
                {nav.map(({ view: itemView, href, label, icon: Icon }) => (
                    <a
                        key={itemView}
                        className={`nav-item ${view === itemView || (view === 'organize' && itemView === 'settings') ? 'active' : ''}`}
                        href={`${href}?month=${monthKey}`}
                        aria-current={view === itemView ? 'page' : undefined}
                        onClick={(event) => navigate(event, itemView)}
                    >
                        <Icon size={21} strokeWidth={1.7} />
                        <span>{label}</span>
                    </a>
                ))}
            </nav>
        </div>
    );
}
