'use client';

import { Trash2 } from 'lucide-react';
import {
    useEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type ReactNode
} from 'react';

const actionWidth = 68;
const intentDistance = 6;
const verticalIntentDistance = 24;
const diagonalVerticalTolerance = 2.25;
const openDistance = actionWidth * 0.3;
const flickVelocity = 0.22;

type Gesture = {
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    lastX: number;
    lastAt: number;
    velocityX: number;
    axis: 'pending' | 'horizontal' | 'vertical';
    editableTarget: HTMLElement | null;
};

const clampedOffset = (value: number) =>
    Math.max(-actionWidth, Math.min(0, value));

export function SwipeReveal({
    actionLabel,
    children,
    disabled = false,
    onAction
}: {
    actionLabel: string;
    children: ReactNode;
    disabled?: boolean;
    onAction: () => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const gestureRef = useRef<Gesture | null>(null);
    const offsetRef = useRef(0);
    const openRef = useRef(false);
    const suppressClickRef = useRef(false);

    useEffect(() => {
        const content = contentRef.current;

        if (!content) return;
        const preventScrollAfterHorizontalLock = (event: TouchEvent) => {
            const gesture = gestureRef.current;
            const touch = event.touches[0];

            if (!gesture || !touch || event.touches.length !== 1) return;
            const deltaX = touch.clientX - gesture.startX;
            const deltaY = touch.clientY - gesture.startY;
            const horizontalDistance = Math.abs(deltaX);
            const verticalDistance = Math.abs(deltaY);
            const hasHorizontalIntent =
                gesture.axis === 'horizontal' ||
                ((openRef.current || deltaX < 0) &&
                    horizontalDistance >= intentDistance &&
                    verticalDistance <=
                        horizontalDistance * diagonalVerticalTolerance);

            if (hasHorizontalIntent && event.cancelable) event.preventDefault();
        };

        content.addEventListener(
            'touchmove',
            preventScrollAfterHorizontalLock,
            { passive: false }
        );

        return () => {
            content.removeEventListener(
                'touchmove',
                preventScrollAfterHorizontalLock
            );
        };
    }, []);

    const setOffset = (offset: number, settling: boolean) => {
        offsetRef.current = offset;
        const content = contentRef.current;

        if (!content) return;
        content.style.setProperty('--swipe-reveal-x', `${offset}px`);
        content.dataset.dragging = settling ? 'false' : 'true';
        content.dataset.settling = settling ? 'true' : 'false';
    };
    const settle = (open: boolean) => {
        const wasAtRest = offsetRef.current === 0;

        openRef.current = open;
        rootRef.current?.setAttribute('data-open', String(open));
        if (open) rootRef.current?.setAttribute('data-active', 'true');
        setOffset(open ? -actionWidth : 0, true);
        if (!open && wasAtRest)
            rootRef.current?.setAttribute('data-active', 'false');
    };
    const finishGesture = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false
    ) => {
        const gesture = gestureRef.current;

        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gestureRef.current = null;

        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (gesture.axis !== 'horizontal') {
            if (!cancelled && gesture.axis === 'pending' && !openRef.current)
                gesture.editableTarget?.focus();

            return;
        }

        suppressClickRef.current = true;
        window.setTimeout(() => {
            suppressClickRef.current = false;
        }, 350);

        const startedOpen = gesture.startOffset < 0;
        const movedOpen = startedOpen
            ? offsetRef.current <= -actionWidth * 0.6
            : offsetRef.current <= -openDistance;
        const flickedOpen = gesture.velocityX <= -flickVelocity;
        const flickedClosed = gesture.velocityX >= flickVelocity;
        const hasOpenIntent =
            flickedOpen || (movedOpen && (!startedOpen || !flickedClosed));
        const shouldOpen = hasOpenIntent && (!cancelled || movedOpen);

        settle(shouldOpen);
    };

    return (
        <div
            ref={rootRef}
            className='swipe-reveal'
            data-disabled={disabled || undefined}
            data-open='false'
            data-active='false'
        >
            <button
                className='swipe-reveal-action'
                type='button'
                disabled={disabled}
                aria-label={actionLabel}
                onFocus={() => settle(true)}
                onClick={() => {
                    settle(false);
                    onAction();
                }}
            >
                <Trash2 size={21} aria-hidden='true' />
            </button>
            <div
                ref={contentRef}
                className='swipe-reveal-content'
                data-dragging='false'
                data-settling='false'
                onPointerDown={(event) => {
                    if (
                        disabled ||
                        event.button !== 0 ||
                        !(event.target instanceof Element)
                    )
                        return;
                    const interactiveTarget = event.target.closest(
                        'input, textarea, select, [data-swipe-reveal-ignore]'
                    );

                    if (
                        interactiveTarget &&
                        !interactiveTarget.hasAttribute(
                            'data-swipe-reveal-allow'
                        )
                    )
                        return;
                    const editableTarget =
                        interactiveTarget instanceof HTMLElement
                            ? interactiveTarget
                            : null;

                    if (editableTarget) event.preventDefault();
                    gestureRef.current = {
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        startOffset: offsetRef.current,
                        lastX: event.clientX,
                        lastAt: event.timeStamp,
                        velocityX: 0,
                        axis: 'pending',
                        editableTarget
                    };
                }}
                onPointerMove={(event) => {
                    const gesture = gestureRef.current;

                    if (!gesture || gesture.pointerId !== event.pointerId)
                        return;
                    const deltaX = event.clientX - gesture.startX;
                    const deltaY = event.clientY - gesture.startY;

                    if (gesture.axis === 'pending') {
                        const horizontalDistance = Math.abs(deltaX);
                        const verticalDistance = Math.abs(deltaY);
                        const movesTowardAction = openRef.current || deltaX < 0;
                        const hasHorizontalIntent =
                            movesTowardAction &&
                            horizontalDistance >= intentDistance &&
                            verticalDistance <=
                                horizontalDistance * diagonalVerticalTolerance;
                        const hasVerticalIntent =
                            verticalDistance >= verticalIntentDistance &&
                            verticalDistance >
                                horizontalDistance * diagonalVerticalTolerance;
                        const hasClosedRightwardIntent =
                            !openRef.current &&
                            deltaX >= intentDistance &&
                            horizontalDistance > verticalDistance;

                        if (hasHorizontalIntent) {
                            gesture.axis = 'horizontal';
                            gesture.editableTarget?.blur();
                        } else if (
                            hasVerticalIntent ||
                            hasClosedRightwardIntent
                        ) {
                            gesture.axis = 'vertical';
                            if (openRef.current) settle(false);

                            return;
                        } else {
                            return;
                        }

                        rootRef.current?.setAttribute('data-active', 'true');
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }
                    if (gesture.axis !== 'horizontal') return;

                    event.preventDefault();
                    const elapsed = Math.max(
                        1,
                        event.timeStamp - gesture.lastAt
                    );

                    gesture.velocityX =
                        (event.clientX - gesture.lastX) / elapsed;
                    gesture.lastX = event.clientX;
                    gesture.lastAt = event.timeStamp;
                    setOffset(
                        clampedOffset(gesture.startOffset + deltaX),
                        false
                    );
                }}
                onPointerUp={(event) => finishGesture(event)}
                onPointerCancel={(event) => finishGesture(event, true)}
                onTransitionEnd={(event) => {
                    if (event.propertyName !== 'transform') return;
                    event.currentTarget.dataset.settling = 'false';
                    if (!openRef.current)
                        rootRef.current?.setAttribute('data-active', 'false');
                }}
                onClickCapture={(event) => {
                    if (suppressClickRef.current) {
                        event.preventDefault();
                        event.stopPropagation();
                        suppressClickRef.current = false;

                        return;
                    }
                    if (!openRef.current) return;
                    event.preventDefault();
                    event.stopPropagation();
                    settle(false);
                }}
            >
                {children}
            </div>
        </div>
    );
}
