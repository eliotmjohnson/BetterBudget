'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
    createGestureFrameDriver,
    type GestureFrameDriver
} from '@/components/ui/gesture-frame';
import {
    endPullGesture,
    holdPullAtRest,
    movePullGesture,
    settlePull,
    startPullGesture,
    writePullDistance,
    type PullContext,
    type PullGesture
} from './pull-gesture';

type PullStatus = 'idle' | 'refreshing' | 'refreshed' | 'failed';

const maximumSpinDuration = 5_000;
const minimumSpinDuration = 1_080;
const statusMessage: Record<PullStatus, string> = {
    idle: '',
    refreshing: 'Refreshing the budget…',
    refreshed: 'Budget updated.',
    failed: 'The budget could not be refreshed.'
};

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
    onRefresh,
    scrollRef,
    surfaceRef
}: {
    onRefresh: () => Promise<void>;
    scrollRef: RefObject<HTMLDivElement | null>;
    surfaceRef: RefObject<HTMLDivElement | null>;
}) {
    const [status, setStatus] = useState<PullStatus>('idle');
    const contextRef = useRef<PullContext | null>(null);
    const distanceRef = useRef(0);
    const frameRef = useRef<GestureFrameDriver | null>(null);
    const gestureRef = useRef<PullGesture | null>(null);
    const refreshRef = useRef(onRefresh);
    const refreshingRef = useRef(false);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

        const frame = createGestureFrameDriver(
            (distance) => writePullDistance(surface, distance),
            {
                shouldInterpolate: () =>
                    !window.matchMedia('(prefers-reduced-motion: reduce)')
                        .matches
            }
        );
        const context: PullContext = {
            distanceRef,
            frameRef,
            gestureRef,
            refreshingRef,
            scrollRef,
            settleTimerRef,
            surface,
            triggerRefresh: () => triggerRef.current()
        };
        const start = (event: TouchEvent) => startPullGesture(context, event);
        const move = (event: TouchEvent) => movePullGesture(context, event);
        const end = () => endPullGesture(context);

        frameRef.current = frame;
        contextRef.current = context;
        surface.addEventListener('touchstart', start, { passive: true });
        surface.addEventListener('touchmove', move, { passive: false });
        surface.addEventListener('touchend', end, { passive: true });
        surface.addEventListener('touchcancel', end, { passive: true });

        return () => {
            surface.removeEventListener('touchstart', start);
            surface.removeEventListener('touchmove', move);
            surface.removeEventListener('touchend', end);
            surface.removeEventListener('touchcancel', end);
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
            gestureRef.current = null;
            refreshingRef.current = false;
            contextRef.current = null;
            frame.cancel();
            if (frameRef.current === frame) frameRef.current = null;
            delete surface.dataset.pullState;
            writePullDistance(surface, 0);
        };
    }, [scrollRef, surfaceRef]);

    return (
        <>
            <div className='pull-refresh' aria-hidden='true'>
                <span className='pull-refresh-dial'>
                    <svg viewBox='0 0 30 30'>
                        <circle
                            className='pull-refresh-track'
                            cx='15'
                            cy='15'
                            r='11'
                        />
                        <circle
                            className='pull-refresh-arc'
                            cx='15'
                            cy='15'
                            r='11'
                        />
                    </svg>
                </span>
            </div>
            <p className='live-announcer' role='status'>
                {statusMessage[status]}
            </p>
        </>
    );
}
