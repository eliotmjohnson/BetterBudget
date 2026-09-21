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
import {
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent,
    type ReactNode
} from 'react';
import { BrandMark } from '@/components/brand-mark';
import {
    ContinuousStroke,
    useContinuousCorners
} from '@/components/ui/continuous-corners';
import { shiftMonth, type MonthKey } from '@/domain/money';
import { MonthPicker } from './month-picker';
import { PullRefreshDial, PullToRefresh } from './pull-to-refresh';
import {
    beginArrowMonthChange,
    beginPickerMonthChange,
    usePageTransition
} from './page-transition';

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
    onRefresh,
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
    onRefresh?: () => Promise<void>;
    online: boolean;
    syncing: boolean;
    mutationPending: boolean;
    children: ReactNode;
}) {
    const router = useRouter();
    const path = view === 'budget' ? '/' : `/${view}`;
    const contentView = view === 'organize' ? 'settings' : view;
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollSurfaceRef = useRef<HTMLDivElement>(null);
    const refreshLabel =
        nav.find(({ view: itemView }) => itemView === contentView)?.label ??
        'Budget';

    usePageTransition(contentRef, contentView, monthKey);

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
                                contentView === itemView ? 'page' : undefined
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
                            onClick={() => beginArrowMonthChange(monthKey)}
                        >
                            <ChevronLeft size={20} />
                        </Link>
                        <MonthPicker
                            monthKey={monthKey}
                            monthLabel={monthLabel}
                            onSelect={(month) => {
                                beginPickerMonthChange();
                                router.push(monthHref(month));
                            }}
                        />
                        <Link
                            className='icon-button'
                            href={monthHref(shiftMonth(monthKey, 1))}
                            aria-label='Next month'
                            onClick={() => beginArrowMonthChange(monthKey)}
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
                <div ref={scrollSurfaceRef} className='app-scroll'>
                    {onRefresh ? (
                        <PullToRefresh
                            label={refreshLabel}
                            onRefresh={onRefresh}
                            scrollRef={contentRef}
                            surfaceRef={scrollSurfaceRef}
                        />
                    ) : null}
                    <div
                        key={`${contentView}-${monthKey}`}
                        ref={contentRef}
                        className='app-content app-content--enter'
                    >
                        {onRefresh ? <PullRefreshDial /> : null}
                        {children}
                    </div>
                </div>
            </main>
            <BottomNav
                contentView={contentView}
                monthKey={monthKey}
                onNavigate={navigate}
            />
        </div>
    );
}

function BottomNav({
    contentView,
    monthKey,
    onNavigate
}: {
    contentView: AppView;
    monthKey: MonthKey;
    onNavigate: (event: MouseEvent<HTMLAnchorElement>, view: AppView) => void;
}) {
    const activeIndex = nav.findIndex(
        ({ view: itemView }) => itemView === contentView
    );
    const [lens, setLens] = useState({ index: activeIndex, moves: 0 });
    const [surfaceRef, surfaceShape] = useContinuousCorners<HTMLSpanElement>();
    const [lensRef, lensShape] = useContinuousCorners<HTMLSpanElement>();

    if (lens.index !== activeIndex)
        setLens({ index: activeIndex, moves: lens.moves + 1 });

    return (
        <nav
            className='bottom-nav'
            data-ready={surfaceShape ? 'true' : undefined}
            aria-label='Primary navigation'
            style={{ '--bottom-nav-index': activeIndex } as CSSProperties}
        >
            <span ref={surfaceRef} className='bottom-nav-surface'>
                {surfaceShape ? (
                    <ContinuousStroke
                        shape={surfaceShape}
                        width={1}
                        gradient={(id) => (
                            <linearGradient id={id} x1='0' y1='0' x2='1' y2='1'>
                                <stop
                                    offset='0'
                                    stopColor='#fff'
                                    stopOpacity='0.95'
                                />
                                <stop
                                    offset='0.38'
                                    stopColor='#fff'
                                    stopOpacity='0.22'
                                />
                                <stop
                                    offset='0.62'
                                    stopColor='#fff'
                                    stopOpacity='0.08'
                                />
                                <stop
                                    offset='1'
                                    stopColor='#fff'
                                    stopOpacity='0.7'
                                />
                            </linearGradient>
                        )}
                    />
                ) : null}
            </span>
            <span className='bottom-nav-lens' aria-hidden='true'>
                <span
                    key={lens.moves}
                    ref={lensRef}
                    className='bottom-nav-lens-glass'
                    data-moving={lens.moves > 0 ? 'true' : undefined}
                >
                    {lensShape ? (
                        <ContinuousStroke
                            shape={lensShape}
                            width={0.75}
                            gradient={(id) => (
                                <linearGradient
                                    id={id}
                                    x1='0'
                                    y1='0'
                                    x2='0'
                                    y2='1'
                                >
                                    <stop
                                        offset='0'
                                        stopColor='#fff'
                                        stopOpacity='0.85'
                                    />
                                    <stop
                                        offset='0.5'
                                        stopColor='#fff'
                                        stopOpacity='0.4'
                                    />
                                    <stop
                                        offset='1'
                                        stopColor='#fff'
                                        stopOpacity='0.55'
                                    />
                                </linearGradient>
                            )}
                        />
                    ) : null}
                </span>
            </span>
            {nav.map(({ view: itemView, href, label, icon: Icon }) => (
                <a
                    key={itemView}
                    className={`nav-item ${contentView === itemView ? 'active' : ''}`}
                    href={`${href}?month=${monthKey}`}
                    draggable={false}
                    aria-current={contentView === itemView ? 'page' : undefined}
                    onClick={(event) => onNavigate(event, itemView)}
                >
                    <Icon size={21} strokeWidth={1.7} />
                    <span>{label}</span>
                </a>
            ))}
        </nav>
    );
}
