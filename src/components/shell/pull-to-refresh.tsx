'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
    cancelOverscrollObserver,
    endPullTouch,
    holdPullAtRest,
    observeOverscroll,
    settlePull,
    startPullTouch,
    writePullProgress,
    type PullContext
} from './pull-gesture';

type PullStatus = 'idle' | 'refreshing' | 'refreshed' | 'failed';

const maximumSpinDuration = 5_000;
const minimumSpinDuration = 1_080;

function statusMessage(status: PullStatus, label: string) {
    switch (status) {
        case 'refreshing':
            return `Refreshing ${label}…`;
        case 'refreshed':
            return `${label} updated.`;
        case 'failed':
            return `${label} could not be refreshed.`;
        case 'idle':
            return '';
    }
}

function spinFor(duration: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, duration);
    });
}

async function requestRefresh(refresh: () => Promise<void>) {
    const [outcome] = await Promise.all([
        Promise.race([
            refresh().then(
                () => 'refreshed' as const,
                () => 'failed' as const
            ),
            spinFor(maximumSpinDuration).then(() => 'failed' as const)
        ]),
        spinFor(minimumSpinDuration)
    ]);

    return outcome;
}

export function PullToRefresh({
    label,
    onRefresh,
    scrollRef,
    surfaceRef
}: {
    label: string;
    onRefresh: () => Promise<void>;
    scrollRef: RefObject<HTMLDivElement | null>;
    surfaceRef: RefObject<HTMLDivElement | null>;
}) {
    const [status, setStatus] = useState<PullStatus>('idle');
    const contextRef = useRef<PullContext | null>(null);
    const frameRef = useRef<number | null>(null);
    const refreshRef = useRef(onRefresh);
    const refreshingRef = useRef(false);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchingRef = useRef(false);
    const triggerRef = useRef(() => {});
    const runRefresh = async () => {
        const context = contextRef.current;

        if (!context || refreshingRef.current) return;

        refreshingRef.current = true;
        holdPullAtRest(context);
        setStatus('refreshing');

        const outcome = await requestRefresh(refreshRef.current);

        refreshingRef.current = false;
        if (contextRef.current !== context) return;
        setStatus(outcome);
        settlePull(context);
    };

    useEffect(() => {
        refreshRef.current = onRefresh;
        triggerRef.current = () => void runRefresh();
    });

    useEffect(() => {
        const surface = surfaceRef.current;

        if (!surface) return;

        const context: PullContext = {
            frameRef,
            refreshingRef,
            scrollRef,
            settleTimerRef,
            surface,
            touchingRef,
            triggerRefresh: () => triggerRef.current()
        };
        const start = (event: TouchEvent) => startPullTouch(context, event);
        const end = (event: TouchEvent) => endPullTouch(context, event);
        const scroll = () => observeOverscroll(context);

        contextRef.current = context;
        surface.addEventListener('touchstart', start, { passive: true });
        surface.addEventListener('touchend', end, { passive: true });
        surface.addEventListener('touchcancel', end, { passive: true });
        surface.addEventListener('scroll', scroll, {
            capture: true,
            passive: true
        });

        return () => {
            surface.removeEventListener('touchstart', start);
            surface.removeEventListener('touchend', end);
            surface.removeEventListener('touchcancel', end);
            surface.removeEventListener('scroll', scroll, { capture: true });
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
            cancelOverscrollObserver(context);
            touchingRef.current = false;
            refreshingRef.current = false;
            contextRef.current = null;
            delete surface.dataset.pullState;
            writePullProgress(surface, 0);
        };
    }, [scrollRef, surfaceRef]);

    return (
        <>
            <div className='pull-refresh-float' aria-hidden='true'>
                <PullDial />
            </div>
            <p className='live-announcer' role='status'>
                {statusMessage(status, label)}
            </p>
        </>
    );
}

function PullDial() {
    return (
        <span className='pull-refresh-dial'>
            <svg viewBox='0 0 30 30'>
                <circle className='pull-refresh-track' cx='15' cy='15' r='11' />
                <circle className='pull-refresh-arc' cx='15' cy='15' r='11' />
            </svg>
        </span>
    );
}

export function PullRefreshDial() {
    return (
        <div className='pull-refresh' aria-hidden='true'>
            <PullDial />
        </div>
    );
}
