'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, X } from 'lucide-react';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject
} from 'react';
import { leftEdgeGestureWidth } from './left-edge-gesture-guard';

interface EdgeDragState {
    pointerId: number;
    width: number;
    originX: number;
    startX: number;
    startY: number;
    lastX: number;
    lastAt: number;
    velocity: number;
    dragging: boolean;
}

const mobileMedia = '(max-width: 759.98px)';
const directionThreshold = 8;
const settleDuration = 410;
const dismissDuration = 500;
const dismissOvershoot = 48;
const motionCleanupDelay = 480;

function clearBaseMotion() {
    delete document.body.dataset.navigationDetailDragging;
    delete document.body.dataset.navigationDetailDismissing;
    delete document.body.dataset.navigationDetailSettling;
    delete document.body.dataset.navigationDetailState;
    document.body.style.removeProperty('--navigation-detail-base-drag-x');
    document.body.style.removeProperty('--navigation-detail-dismiss-duration');
}

function setBaseDragPosition(distance: number, width: number) {
    const progress = Math.min(1, Math.max(0, distance / width));
    const restingOffset = Math.min(96, width * 0.22);

    document.body.style.setProperty(
        '--navigation-detail-base-drag-x',
        `${-restingOffset * (1 - progress)}px`
    );
}

export function NavigationDetail({
    backLabel = 'Budget',
    children,
    floatingAction,
    headerAction,
    open,
    onOpenChange,
    restoreFocusRef,
    title,
    titleContent
}: {
    backLabel?: string;
    children: ReactNode;
    floatingAction?: ReactNode;
    headerAction?: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    title: string;
    titleContent?: ReactNode;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<EdgeDragState | null>(null);
    const gestureReadyRef = useRef(false);
    const activeRef = useRef(false);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const motionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const gestureReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const resetSettleTimer = () => {
        if (!settleTimerRef.current) return;
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
    };

    useLayoutEffect(() => {
        if (motionCleanupTimerRef.current) {
            clearTimeout(motionCleanupTimerRef.current);
            motionCleanupTimerRef.current = null;
        }
        if (gestureReadyTimerRef.current) {
            clearTimeout(gestureReadyTimerRef.current);
            gestureReadyTimerRef.current = null;
        }

        if (open) {
            activeRef.current = true;
            gestureReadyRef.current = false;
            delete contentRef.current?.dataset.hasDragged;
            delete document.body.dataset.navigationDetailDragging;
            delete document.body.dataset.navigationDetailDismissing;
            delete document.body.dataset.navigationDetailSettling;
            document.body.style.removeProperty(
                '--navigation-detail-base-drag-x'
            );
            document.body.style.removeProperty(
                '--navigation-detail-dismiss-duration'
            );
            document.body.dataset.navigationDetailState = 'open';
            const reducedMotion = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches;

            gestureReadyTimerRef.current = setTimeout(
                () => {
                    gestureReadyRef.current = true;
                    gestureReadyTimerRef.current = null;
                },
                reducedMotion ? 0 : 620
            );
        } else if (activeRef.current) {
            gestureReadyRef.current = false;
            document.body.dataset.navigationDetailState = 'closed';
        }
    }, [open]);

    useEffect(
        () => () => {
            resetSettleTimer();
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            if (motionCleanupTimerRef.current)
                clearTimeout(motionCleanupTimerRef.current);
            if (gestureReadyTimerRef.current)
                clearTimeout(gestureReadyTimerRef.current);
            clearBaseMotion();
        },
        []
    );

    function settleDrag(content: HTMLDivElement, width: number) {
        resetSettleTimer();
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
            document.body.style.removeProperty(
                '--navigation-detail-base-drag-x'
            );
            settleTimerRef.current = null;
        }, settleDuration);
    }
    const completeDragDismissal = (content: HTMLDivElement) => {
        if (content.dataset.dismissing !== 'true') return;

        delete content.dataset.dismissing;
        document.body.dataset.navigationDetailState = 'closed';
        delete document.body.dataset.navigationDetailDismissing;
        content.style.setProperty(
            '--navigation-detail-dismiss-duration',
            '1ms'
        );
        document.body.style.setProperty(
            '--navigation-detail-dismiss-duration',
            '1ms'
        );
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        onOpenChange(false);
    };
    const stopPendingDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        settleDrag(content, drag.width);
    };
    const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (
            event.button !== 0 ||
            !gestureReadyRef.current ||
            !window.matchMedia(mobileMedia).matches ||
            document.querySelector('.sheet-content') ||
            (event.target as Element).closest(
                'button, input, textarea, select, a'
            )
        )
            return;

        const content = contentRef.current;

        if (!content) return;
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
        content.style.setProperty(
            '--navigation-detail-drag-x',
            `${currentDistance}px`
        );
        if (currentBaseX === undefined)
            setBaseDragPosition(currentDistance, contentBounds.width);
        else
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
            width: contentBounds.width,
            originX: currentDistance,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastAt: event.timeStamp,
            velocity: 0,
            dragging: false
        };
    };
    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        const distance = Math.min(
            drag.width,
            Math.max(0, drag.originX + deltaX)
        );

        if (!drag.dragging) {
            if (
                Math.max(Math.abs(deltaX), Math.abs(deltaY)) <
                directionThreshold
            )
                return;
            if (Math.abs(deltaY) >= Math.abs(deltaX) || deltaX <= 0) {
                stopPendingDrag(event);

                return;
            }
            drag.dragging = true;
        }

        event.preventDefault();
        const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
        const instantaneousVelocity = (event.clientX - drag.lastX) / elapsed;

        drag.velocity = drag.velocity * 0.68 + instantaneousVelocity * 0.32;
        drag.lastX = event.clientX;
        drag.lastAt = event.timeStamp;

        content.style.setProperty(
            '--navigation-detail-drag-x',
            `${distance}px`
        );
        setBaseDragPosition(distance, drag.width);
    };
    const finishDrag = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false
    ) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (!drag.dragging) {
            settleDrag(content, drag.width);

            return;
        }

        const distance = Math.min(
            drag.width,
            Math.max(0, drag.originX + event.clientX - drag.startX)
        );
        const threshold = drag.width * 0.3;
        const projectedDistance = distance + Math.max(0, drag.velocity) * 180;
        const dismiss =
            !cancelled &&
            (distance >= threshold ||
                (distance >= 24 &&
                    (drag.velocity >= 0.55 || projectedDistance >= threshold)));

        content.style.setProperty(
            '--navigation-detail-drag-x',
            `${distance}px`
        );
        setBaseDragPosition(distance, drag.width);
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
                () => completeDragDismissal(content),
                duration + 80
            );

            return;
        }
        settleDrag(content, drag.width);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay
                    className='navigation-detail-overlay'
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={(event) => finishDrag(event)}
                    onPointerCancel={(event) => finishDrag(event, true)}
                />
                <Dialog.Content
                    ref={contentRef}
                    className={`navigation-detail-content${
                        floatingAction
                            ? ' navigation-detail-content--with-floating-action'
                            : ''
                    }`}
                    onAnimationEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.currentTarget.dataset.state === 'closed'
                        ) {
                            activeRef.current = false;
                            motionCleanupTimerRef.current = setTimeout(() => {
                                clearBaseMotion();
                                motionCleanupTimerRef.current = null;
                            }, motionCleanupDelay);
                        }
                    }}
                    onCloseAutoFocus={(event) => {
                        const target = restoreFocusRef?.current;

                        if (!target) return;
                        event.preventDefault();
                        target.focus();
                    }}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        contentRef.current?.focus();
                    }}
                    onTransitionEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.propertyName === 'transform' &&
                            event.currentTarget.dataset.dismissing === 'true'
                        )
                            completeDragDismissal(event.currentTarget);
                    }}
                    onPointerDownOutside={(event) => {
                        if (window.matchMedia(mobileMedia).matches)
                            event.preventDefault();
                    }}
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={(event) => finishDrag(event)}
                    onPointerCancel={(event) => finishDrag(event, true)}
                >
                    <div
                        className='navigation-detail-handle'
                        aria-hidden='true'
                    />
                    <header className='navigation-detail-header'>
                        <button
                            className='navigation-detail-back'
                            type='button'
                            aria-label={`Back to ${backLabel}`}
                            onClick={() => onOpenChange(false)}
                        >
                            <ChevronLeft size={30} strokeWidth={2.1} />
                        </button>
                        <Dialog.Title
                            className='navigation-detail-title'
                            aria-label={title}
                        >
                            {titleContent ?? title}
                        </Dialog.Title>
                        {headerAction ? (
                            <div className='navigation-detail-header-action'>
                                {headerAction}
                            </div>
                        ) : null}
                        <Dialog.Close
                            className='icon-button navigation-detail-close'
                            aria-label='Close'
                        >
                            <X size={22} strokeWidth={2} />
                        </Dialog.Close>
                    </header>
                    <div className='navigation-detail-body'>{children}</div>
                    {floatingAction ? (
                        <div className='navigation-detail-floating-action'>
                            {floatingAction}
                        </div>
                    ) : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
