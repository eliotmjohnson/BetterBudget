'use client';

import type { RefObject } from 'react';
import type { GestureFrameDriver } from '@/components/ui/gesture-frame';

export interface PullGesture {
    identifier: number;
    startX: number;
    startY: number;
    claimed: boolean;
}

export interface PullContext {
    distanceRef: RefObject<number>;
    frameRef: RefObject<GestureFrameDriver | null>;
    gestureRef: RefObject<PullGesture | null>;
    refreshingRef: RefObject<boolean>;
    scrollRef: RefObject<HTMLDivElement | null>;
    settleTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
    surface: HTMLDivElement;
    triggerRefresh: () => void;
}

export const pullTriggerDistance = 62;
const claimDistance = 12;
const guardDistance = 4;
const maximumDistance = 148;
const settleDuration = 440;
const blockingSelector =
    '.sheet-content, [data-drag-active], [data-long-press-active], [data-long-press-pending]';

function resistedDistance(raw: number) {
    return (
        maximumDistance * (1 - Math.exp(-Math.max(0, raw) / maximumDistance))
    );
}

function pullBlocked(target: EventTarget | null) {
    return (
        document.body.dataset.navigationDetailState === 'open' ||
        document.querySelector(blockingSelector) !== null ||
        (target instanceof Element &&
            target.closest('.navigation-detail-content') !== null)
    );
}

export function writePullDistance(surface: HTMLDivElement, distance: number) {
    surface.style.setProperty('--pull-distance', `${distance}px`);
    surface.style.setProperty(
        '--pull-progress',
        `${Math.min(1, distance / pullTriggerDistance)}`
    );
}

function clearSettleTimer(ctx: PullContext) {
    if (!ctx.settleTimerRef.current) return;

    clearTimeout(ctx.settleTimerRef.current);
    ctx.settleTimerRef.current = null;
}

export function holdPullAtRest(ctx: PullContext) {
    const { frameRef, surface } = ctx;

    frameRef.current?.cancel();
    clearSettleTimer(ctx);
    surface.dataset.pullState = 'refreshing';
    void surface.offsetHeight;
    surface.style.removeProperty('--pull-distance');
    surface.style.setProperty('--pull-progress', '1');
}

export function settlePull(ctx: PullContext) {
    const { distanceRef, frameRef, settleTimerRef, surface } = ctx;

    frameRef.current?.cancel();
    clearSettleTimer(ctx);
    surface.dataset.pullState = 'settling';
    void surface.offsetHeight;
    distanceRef.current = 0;
    writePullDistance(surface, 0);
    settleTimerRef.current = setTimeout(() => {
        delete surface.dataset.pullState;
        settleTimerRef.current = null;
    }, settleDuration);
}

export function startPullGesture(ctx: PullContext, event: TouchEvent) {
    const { gestureRef, refreshingRef, scrollRef } = ctx;
    const touch = event.touches[0];
    const scroller = scrollRef.current;

    gestureRef.current = null;
    if (
        event.touches.length !== 1 ||
        !touch ||
        !scroller ||
        refreshingRef.current ||
        scroller.scrollTop > 0 ||
        pullBlocked(event.target)
    )
        return;

    gestureRef.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        claimed: false
    };
}

function claimPullGesture(
    ctx: PullContext,
    gesture: PullGesture,
    event: TouchEvent
) {
    const { frameRef, gestureRef, scrollRef, surface } = ctx;

    if ((scrollRef.current?.scrollTop ?? 0) > 0 || pullBlocked(event.target)) {
        gestureRef.current = null;

        return false;
    }
    clearSettleTimer(ctx);
    gesture.claimed = true;
    frameRef.current?.reset(0);
    surface.dataset.pullState = 'pulling';

    return true;
}

export function movePullGesture(ctx: PullContext, event: TouchEvent) {
    const { distanceRef, frameRef, gestureRef } = ctx;
    const gesture = gestureRef.current;
    const touch = event.touches[0];

    if (!gesture) return;
    if (
        event.touches.length !== 1 ||
        touch?.identifier !== gesture.identifier
    ) {
        gestureRef.current = null;

        return;
    }

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;

    if (!gesture.claimed) {
        if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
            if (Math.max(Math.abs(deltaX), -deltaY) >= claimDistance)
                gestureRef.current = null;

            return;
        }
        if (deltaY >= guardDistance && event.cancelable) event.preventDefault();
        if (deltaY < claimDistance) return;
        if (!claimPullGesture(ctx, gesture, event)) return;
    }
    if (event.cancelable) event.preventDefault();
    distanceRef.current = resistedDistance(deltaY - claimDistance);
    frameRef.current?.schedule(distanceRef.current);
}

export function endPullGesture(ctx: PullContext) {
    const { distanceRef, gestureRef, triggerRefresh } = ctx;
    const gesture = gestureRef.current;

    gestureRef.current = null;
    if (!gesture?.claimed) return;
    if (distanceRef.current >= pullTriggerDistance) {
        triggerRefresh();

        return;
    }
    settlePull(ctx);
}
