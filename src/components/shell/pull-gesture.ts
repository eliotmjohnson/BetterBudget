'use client';

import type { RefObject } from 'react';

export interface PullContext {
    frameRef: RefObject<number | null>;
    refreshingRef: RefObject<boolean>;
    scrollRef: RefObject<HTMLDivElement | null>;
    settleTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
    surface: HTMLDivElement;
    touchingRef: RefObject<boolean>;
    triggerRefresh: () => void;
}

const pullFillStart = 29;
const pullTriggerDistance = 115;
const settleDuration = 440;
const blockingSelector =
    '.sheet-content, [data-drag-active], [data-long-press-active], [data-long-press-pending]';

function pullBlocked() {
    return (
        document.body.dataset.navigationDetailState === 'open' ||
        document.querySelector(blockingSelector) !== null
    );
}

export function writePullProgress(surface: HTMLDivElement, overscroll: number) {
    surface.style.setProperty(
        '--pull-progress',
        `${Math.min(1, Math.max(0, overscroll - pullFillStart) / (pullTriggerDistance - pullFillStart))}`
    );
}

function clearSettleTimer(ctx: PullContext) {
    if (!ctx.settleTimerRef.current) return;

    clearTimeout(ctx.settleTimerRef.current);
    ctx.settleTimerRef.current = null;
}

function readOverscroll(ctx: PullContext) {
    const scroller = ctx.scrollRef.current;

    return scroller ? Math.max(0, -scroller.scrollTop) : 0;
}

function trackOverscroll(ctx: PullContext, overscroll: number) {
    const { surface, touchingRef } = ctx;
    const state = surface.dataset.pullState;

    if (state === 'refreshing') return;
    if (touchingRef.current && overscroll > 0 && !pullBlocked()) {
        clearSettleTimer(ctx);
        surface.dataset.pullState = 'pulling';
        writePullProgress(surface, overscroll);

        return;
    }
    if (state !== 'pulling' && state !== 'returning') return;
    surface.dataset.pullState = 'returning';
    writePullProgress(surface, overscroll);
    if (overscroll === 0 && !touchingRef.current)
        delete surface.dataset.pullState;
}

export function observeOverscroll(ctx: PullContext) {
    const { frameRef, touchingRef } = ctx;

    if (frameRef.current !== null) return;

    const frame = () => {
        const overscroll = readOverscroll(ctx);

        frameRef.current = null;
        trackOverscroll(ctx, overscroll);
        if (touchingRef.current || overscroll > 0)
            frameRef.current = window.requestAnimationFrame(frame);
    };

    frameRef.current = window.requestAnimationFrame(frame);
}

export function cancelOverscrollObserver(ctx: PullContext) {
    if (ctx.frameRef.current === null) return;

    window.cancelAnimationFrame(ctx.frameRef.current);
    ctx.frameRef.current = null;
}

function markRelease(surface: HTMLDivElement, overscroll: number) {
    surface.style.setProperty('--pull-release', `${overscroll}px`);
    surface.dataset.pullState = 'releasing';
    void surface.offsetHeight;
}

export function holdPullAtRest(ctx: PullContext) {
    const { surface } = ctx;

    clearSettleTimer(ctx);
    surface.dataset.pullState = 'refreshing';
    surface.style.setProperty('--pull-progress', '1');
}

export function settlePull(ctx: PullContext) {
    const { settleTimerRef, surface } = ctx;

    clearSettleTimer(ctx);
    surface.dataset.pullState = 'settling';
    void surface.offsetHeight;
    writePullProgress(surface, 0);
    settleTimerRef.current = setTimeout(() => {
        delete surface.dataset.pullState;
        settleTimerRef.current = null;
    }, settleDuration);
}

export function startPullTouch(ctx: PullContext, event: TouchEvent) {
    ctx.touchingRef.current = event.touches.length > 0;
    observeOverscroll(ctx);
}

export function endPullTouch(ctx: PullContext, event: TouchEvent) {
    const { refreshingRef, surface, touchingRef } = ctx;

    touchingRef.current = event.touches.length > 0;
    if (touchingRef.current) return;

    const overscroll = readOverscroll(ctx);

    if (surface.dataset.pullState === 'pulling') {
        if (
            overscroll >= pullTriggerDistance &&
            !refreshingRef.current &&
            !pullBlocked()
        ) {
            markRelease(surface, overscroll);
            ctx.triggerRefresh();

            return;
        }
        surface.dataset.pullState = 'returning';
    }
    observeOverscroll(ctx);
}
