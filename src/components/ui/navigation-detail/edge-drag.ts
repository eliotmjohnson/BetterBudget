'use client';

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
    getCoalescedPointerSamples,
    getPredictedPointerSample,
    listenForRawPointerUpdates,
    updateGestureVelocity,
    type GestureFrameDriver
} from '@/components/ui/gesture-frame';
import { leftEdgeGestureWidth } from '@/components/ui/left-edge-gesture-guard';
import { mobileMedia } from './title-motion';

export interface EdgeDragState {
    pointerId: number;
    captureTarget: HTMLDivElement;
    width: number;
    originX: number;
    startX: number;
    startY: number;
    lastPosition: number;
    lastTime: number;
    stopRawUpdates?: () => void;
    velocity: number;
    dragging: boolean;
}

const directionThreshold = 8;
const settleDuration = 410;
const dismissDuration = 620;
const dismissOvershoot = 48;

export function clearBaseMotion() {
    delete document.body.dataset.navigationDetailDragging;
    delete document.body.dataset.navigationDetailDismissing;
    delete document.body.dataset.navigationDetailSettling;
    delete document.body.dataset.navigationDetailState;
    document.body.style.removeProperty('--navigation-detail-base-drag-x');
    document.body.style.removeProperty('--navigation-detail-dismiss-duration');
}

export function setBaseDragPosition(distance: number, width: number) {
    const progress = Math.min(1, Math.max(0, distance / width));
    const restingOffset = Math.min(96, width * 0.22);

    document.body.style.setProperty(
        '--navigation-detail-base-drag-x',
        `${-restingOffset * (1 - progress)}px`
    );
}

export interface EdgeDragContext {
    contentRef: RefObject<HTMLDivElement | null>;
    dismissTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
    dragFrameRef: RefObject<GestureFrameDriver | null>;
    dragRef: RefObject<EdgeDragState | null>;
    dragWidthRef: RefObject<number>;
    gestureReadyRef: RefObject<boolean>;
    onOpenChange: (open: boolean) => void;
    resetSettleTimer: () => void;
    settleTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
}

export function settleDrag(
    ctx: EdgeDragContext,
    content: HTMLDivElement,
    width: number
) {
    const { dragFrameRef, resetSettleTimer, settleTimerRef } = ctx;

    resetSettleTimer();
    dragFrameRef.current?.cancel();
    delete content.dataset.dragging;
    content.dataset.settling = 'true';
    document.body.dataset.navigationDetailSettling = 'true';
    delete document.body.dataset.navigationDetailDragging;
    void content.offsetHeight;
    content.style.setProperty('--navigation-detail-drag-x', '0px');
    setBaseDragPosition(0, width);
    settleTimerRef.current = setTimeout(() => {
        delete content.dataset.settling;
        delete document.body.dataset.navigationDetailSettling;
        document.body.style.removeProperty('--navigation-detail-base-drag-x');
        settleTimerRef.current = null;
    }, settleDuration);
}
export function completeDragDismissal(
    ctx: EdgeDragContext,
    content: HTMLDivElement
) {
    const { dismissTimerRef, onOpenChange } = ctx;

    if (content.dataset.dismissing !== 'true') return;

    delete content.dataset.dismissing;
    document.body.dataset.navigationDetailState = 'closed';
    delete document.body.dataset.navigationDetailDismissing;
    content.style.setProperty('--navigation-detail-dismiss-duration', '1ms');
    document.body.style.setProperty(
        '--navigation-detail-dismiss-duration',
        '1ms'
    );
    if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
    }
    onOpenChange(false);
}
export function stopPendingDrag(ctx: EdgeDragContext, pointerId: number) {
    const { contentRef, dragFrameRef, dragRef } = ctx;
    const drag = dragRef.current;
    const content = contentRef.current;

    if (!drag || !content || drag.pointerId !== pointerId) return;
    drag.stopRawUpdates?.();
    dragRef.current = null;
    dragFrameRef.current?.cancel();
    if (drag.captureTarget.hasPointerCapture(pointerId))
        drag.captureTarget.releasePointerCapture(pointerId);
    settleDrag(ctx, content, drag.width);
}
export function moveDragFromPointer(
    ctx: EdgeDragContext,
    event: PointerEvent,
    preventDefault?: () => void
) {
    const { contentRef, dragFrameRef, dragRef } = ctx;
    const drag = dragRef.current;
    const content = contentRef.current;

    if (!drag || !content || drag.pointerId !== event.pointerId) return;
    const samples = getCoalescedPointerSamples(event);
    const latestSample = samples[samples.length - 1] ?? event;
    const visualSample = getPredictedPointerSample(event, latestSample);
    const deltaX = latestSample.clientX - drag.startX;
    const deltaY = latestSample.clientY - drag.startY;

    if (!drag.dragging) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < directionThreshold)
            return;
        if (Math.abs(deltaY) >= Math.abs(deltaX) || deltaX <= 0) {
            stopPendingDrag(ctx, event.pointerId);

            return;
        }
        drag.dragging = true;
    }

    preventDefault?.();
    updateGestureVelocity(drag, samples, 'clientX');
    dragFrameRef.current?.schedule(
        Math.min(
            drag.width,
            Math.max(0, drag.originX + visualSample.clientX - drag.startX)
        )
    );
}
export const moveDrag = (
    ctx: EdgeDragContext,
    event: ReactPointerEvent<HTMLDivElement>
) => moveDragFromPointer(ctx, event.nativeEvent, () => event.preventDefault());
export function startDrag(
    ctx: EdgeDragContext,
    event: ReactPointerEvent<HTMLDivElement>
) {
    const {
        contentRef,
        dragFrameRef,
        dragRef,
        dragWidthRef,
        gestureReadyRef,
        resetSettleTimer
    } = ctx;

    if (
        event.button !== 0 ||
        dragRef.current ||
        !gestureReadyRef.current ||
        !window.matchMedia(mobileMedia).matches ||
        document.querySelector('.sheet-content') ||
        (event.target as Element).closest('button, input, textarea, select, a')
    )
        return;

    const content = contentRef.current;

    if (!content) return;
    dragFrameRef.current?.cancel();
    const contentBounds = content.getBoundingClientRect();
    const currentDistance = Math.min(
        contentBounds.width,
        Math.max(0, contentBounds.left)
    );
    const atViewportEdge = event.clientX <= leftEdgeGestureWidth;
    const atContentEdge =
        event.clientX >= currentDistance &&
        event.clientX <= currentDistance + leftEdgeGestureWidth;

    if (!atViewportEdge && !atContentEdge) return;

    const frame = document.querySelector<HTMLElement>('.app-frame');
    const currentBaseX = frame?.getBoundingClientRect().left;

    resetSettleTimer();
    dragWidthRef.current = contentBounds.width;
    dragFrameRef.current?.reset(currentDistance);
    if (currentBaseX !== undefined)
        document.body.style.setProperty(
            '--navigation-detail-base-drag-x',
            `${currentBaseX}px`
        );
    delete content.dataset.settling;
    delete document.body.dataset.navigationDetailSettling;
    content.dataset.hasDragged = 'true';
    content.dataset.dragging = 'true';
    document.body.dataset.navigationDetailDragging = 'true';
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
        width: contentBounds.width,
        originX: currentDistance,
        startX: event.clientX,
        startY: event.clientY,
        lastPosition: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        dragging: false
    };
    dragRef.current.stopRawUpdates = listenForRawPointerUpdates(
        event.currentTarget,
        (rawEvent) => moveDragFromPointer(ctx, rawEvent)
    );
}
export function finishDrag(
    ctx: EdgeDragContext,
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false
) {
    const { contentRef, dismissTimerRef, dragFrameRef, dragRef } = ctx;
    const drag = dragRef.current;
    const content = contentRef.current;

    if (!drag || !content || drag.pointerId !== event.pointerId) return;
    const samples = getCoalescedPointerSamples(event.nativeEvent);
    const latestSample = samples[samples.length - 1] ?? event.nativeEvent;

    if (drag.dragging) updateGestureVelocity(drag, samples, 'clientX');
    drag.stopRawUpdates?.();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.dragging) {
        settleDrag(ctx, content, drag.width);

        return;
    }

    const distance = Math.min(
        drag.width,
        Math.max(0, drag.originX + latestSample.clientX - drag.startX)
    );
    const threshold = drag.width * 0.3;
    const projectedDistance = distance + Math.max(0, drag.velocity) * 180;
    const dismiss =
        !cancelled &&
        (distance >= threshold ||
            (distance >= 24 &&
                (drag.velocity >= 0.55 || projectedDistance >= threshold)));

    dragFrameRef.current?.cancel();
    void content.offsetHeight;
    delete content.dataset.dragging;
    delete document.body.dataset.navigationDetailDragging;
    if (dismiss) {
        const exitDistance = drag.width + dismissOvershoot;
        const duration = dismissDuration;
        const durationValue = `${duration}ms`;

        content.style.setProperty(
            '--navigation-detail-dismiss-duration',
            durationValue
        );
        document.body.style.setProperty(
            '--navigation-detail-dismiss-duration',
            durationValue
        );
        content.dataset.dismissing = 'true';
        document.body.dataset.navigationDetailDismissing = 'true';
        void content.offsetHeight;
        content.style.setProperty(
            '--navigation-detail-drag-x',
            `${exitDistance}px`
        );
        document.body.style.setProperty(
            '--navigation-detail-base-drag-x',
            '0px'
        );
        dismissTimerRef.current = setTimeout(
            () => completeDragDismissal(ctx, content),
            duration + 80
        );

        return;
    }
    settleDrag(ctx, content, drag.width);
}
