'use client';

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
    createPointerTrack,
    exitMotion,
    getCoalescedPointerSamples,
    recordPointerSamples,
    releaseVelocity,
    type PointerTrack
} from '@/components/ui/gesture-release';
import { leftEdgeGestureWidth } from '@/components/ui/left-edge-gesture-guard';
import { mobileMedia } from './title-motion';

export interface EdgeDragState {
    pointerId: number;
    captureTarget: HTMLDivElement;
    frame: HTMLElement | null;
    width: number;
    originX: number;
    startX: number;
    startY: number;
    track: PointerTrack;
    dragging: boolean;
}

const directionThreshold = 8;
const settleDuration = 500;
const dismissDistance = 150;
const flickDistance = 24;
const flickVelocity = 0.55;
const restingParallax = 128;
const translateX = (distance: number) => `translate3d(${distance}px, 0, 0)`;

function findAppFrame() {
    return document.querySelector<HTMLElement>('.app-frame');
}

function renderedDistance(content: HTMLDivElement, width: number) {
    return Math.min(width, Math.max(0, content.getBoundingClientRect().left));
}

function writeLayerPositions(
    content: HTMLDivElement,
    frame: HTMLElement | null,
    distance: number,
    width: number
) {
    const progress = Math.min(1, Math.max(0, distance / width));

    content.style.transform = translateX(distance);
    if (frame)
        frame.style.transform = translateX(-restingParallax * (1 - progress));
}

export function clearBaseMotion() {
    delete document.body.dataset.navigationDetailDragging;
    delete document.body.dataset.navigationDetailSettling;
    delete document.body.dataset.navigationDetailState;
    document.body.style.removeProperty('--navigation-detail-dismiss-duration');
    clearLayerMotion(findAppFrame());
}

export function clearLayerMotion(element: HTMLElement | null) {
    element?.style.removeProperty('transform');
    element?.style.removeProperty('transition');
}

export interface EdgeDragContext {
    contentRef: RefObject<HTMLDivElement | null>;
    dismissTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
    dragRef: RefObject<EdgeDragState | null>;
    gestureReadyRef: RefObject<boolean>;
    onOpenChange: (open: boolean) => void;
    resetSettleTimer: () => void;
    settleTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
}

function settleDrag(
    ctx: EdgeDragContext,
    content: HTMLDivElement,
    frame: HTMLElement | null,
    width: number
) {
    const { resetSettleTimer, settleTimerRef } = ctx;

    resetSettleTimer();
    content.style.removeProperty('transition');
    frame?.style.removeProperty('transition');
    delete content.dataset.dragging;
    content.dataset.settling = 'true';
    document.body.dataset.navigationDetailSettling = 'true';
    delete document.body.dataset.navigationDetailDragging;
    void content.offsetHeight;
    writeLayerPositions(content, frame, 0, width);
    settleTimerRef.current = setTimeout(() => {
        delete content.dataset.settling;
        delete document.body.dataset.navigationDetailSettling;
        content.style.removeProperty('transform');
        frame?.style.removeProperty('transform');
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
    content.style.setProperty('--navigation-detail-drag-x', '100%');
    document.body.dataset.navigationDetailState = 'closed';
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

function stopPendingDrag(ctx: EdgeDragContext, pointerId: number) {
    const { contentRef, dragRef } = ctx;
    const drag = dragRef.current;
    const content = contentRef.current;

    if (!drag || !content || drag.pointerId !== pointerId) return;
    dragRef.current = null;
    if (drag.captureTarget.hasPointerCapture(pointerId))
        drag.captureTarget.releasePointerCapture(pointerId);
    settleDrag(ctx, content, drag.frame, drag.width);
}

export function moveDrag(
    ctx: EdgeDragContext,
    event: ReactPointerEvent<HTMLDivElement>
) {
    const { contentRef, dragRef } = ctx;
    const drag = dragRef.current;
    const content = contentRef.current;

    if (!drag || !content || drag.pointerId !== event.pointerId) return;
    const samples = getCoalescedPointerSamples(event.nativeEvent);
    const latestSample = samples[samples.length - 1] ?? event.nativeEvent;
    const deltaX = latestSample.clientX - drag.startX;
    const deltaY = latestSample.clientY - drag.startY;

    recordPointerSamples(drag.track, samples);

    if (!drag.dragging) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < directionThreshold)
            return;
        if (Math.abs(deltaY) >= Math.abs(deltaX) || deltaX <= 0) {
            stopPendingDrag(ctx, event.pointerId);

            return;
        }
        drag.dragging = true;
        drag.startX = latestSample.clientX;
    }

    event.preventDefault();
    writeLayerPositions(
        content,
        drag.frame,
        Math.min(
            drag.width,
            Math.max(0, drag.originX + latestSample.clientX - drag.startX)
        ),
        drag.width
    );
}

export function startDrag(
    ctx: EdgeDragContext,
    event: ReactPointerEvent<HTMLDivElement>
) {
    const { contentRef, dragRef, gestureReadyRef, resetSettleTimer } = ctx;

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
    const width = content.getBoundingClientRect().width;
    const currentDistance = renderedDistance(content, width);
    const atViewportEdge = event.clientX <= leftEdgeGestureWidth;
    const atContentEdge =
        event.clientX >= currentDistance &&
        event.clientX <= currentDistance + leftEdgeGestureWidth;

    if (!atViewportEdge && !atContentEdge) return;

    const frame = findAppFrame();
    const currentBaseX = frame?.getBoundingClientRect().left;

    resetSettleTimer();
    content.style.removeProperty('transition');
    frame?.style.removeProperty('transition');
    content.style.transform = translateX(currentDistance);
    if (frame && currentBaseX !== undefined)
        frame.style.transform = translateX(currentBaseX);
    delete content.dataset.settling;
    delete document.body.dataset.navigationDetailSettling;
    content.dataset.hasDragged = 'true';
    content.dataset.dragging = 'true';
    document.body.dataset.navigationDetailDragging = 'true';
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
        frame,
        width,
        originX: currentDistance,
        startX: event.clientX,
        startY: event.clientY,
        track: createPointerTrack(event.nativeEvent, 'clientX'),
        dragging: false
    };
}

function dismissDrag(
    ctx: EdgeDragContext,
    content: HTMLDivElement,
    drag: EdgeDragState,
    { distance, velocity }: { distance: number; velocity: number }
) {
    const { duration, transition } = exitMotion(
        drag.width - distance,
        velocity
    );

    content.dataset.dismissing = 'true';
    void content.offsetHeight;
    content.style.transition = transition;
    if (drag.frame) drag.frame.style.transition = transition;
    writeLayerPositions(content, drag.frame, drag.width, drag.width);
    ctx.dismissTimerRef.current = setTimeout(
        () => completeDragDismissal(ctx, content),
        duration + 80
    );
}

export function finishDrag(
    ctx: EdgeDragContext,
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false
) {
    const { contentRef, dragRef } = ctx;
    const drag = dragRef.current;
    const content = contentRef.current;

    if (!drag || !content || drag.pointerId !== event.pointerId) return;
    const samples = getCoalescedPointerSamples(event.nativeEvent);
    const latestSample = samples[samples.length - 1] ?? event.nativeEvent;
    const velocity = releaseVelocity(drag.track, event.nativeEvent, samples);

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.dragging) {
        settleDrag(ctx, content, drag.frame, drag.width);

        return;
    }

    const releaseDistance = Math.min(
        drag.width,
        Math.max(0, drag.originX + latestSample.clientX - drag.startX)
    );
    const dismiss =
        !cancelled &&
        (releaseDistance >= dismissDistance ||
            (releaseDistance >= flickDistance && velocity >= flickVelocity));
    const distance = renderedDistance(content, drag.width);

    delete content.dataset.dragging;
    delete document.body.dataset.navigationDetailDragging;
    if (dismiss) {
        dismissDrag(ctx, content, drag, { distance, velocity });

        return;
    }
    settleDrag(ctx, content, drag.frame, drag.width);
}
