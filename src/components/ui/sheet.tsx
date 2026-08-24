'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
    useEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
    type ReactNode
} from 'react';
import {
    createGestureFrameDriver,
    getCoalescedPointerSamples,
    getPredictedPointerSample,
    listenForRawPointerUpdates,
    updateGestureVelocity,
    type GestureFrameDriver
} from './gesture-frame';

interface DragState {
    pointerId: number;
    startY: number;
    lastPosition: number;
    lastTime: number;
    stopRawUpdates?: () => void;
    velocity: number;
}

function restoreSheetFocus(target: HTMLElement, focusVisible: boolean) {
    if (!focusVisible) target.dataset.sheetRestoredFocus = 'true';
    target.focus({ preventScroll: true });
    if (focusVisible) return;

    requestAnimationFrame(() => {
        if (document.activeElement !== target) {
            delete target.dataset.sheetRestoredFocus;

            return;
        }

        const clearRestoredFocus = () => {
            delete target.dataset.sheetRestoredFocus;
            target.removeEventListener('blur', clearRestoredFocus);
            target.removeEventListener('keydown', clearRestoredFocus);
        };

        target.addEventListener('blur', clearRestoredFocus, { once: true });
        target.addEventListener('keydown', clearRestoredFocus, { once: true });
    });
}

export function Sheet({
    open,
    onOpenChange,
    onExitComplete,
    title,
    variant = 'standard',
    layer = 'base',
    footer,
    headerAction,
    headerActionVisibility = 'all',
    showHandle = true,
    restoreFocusRef,
    restoreFocusVisible,
    interactionDisabled = false,
    children
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete?: () => void;
    title: string;
    variant?: 'standard' | 'raised-mobile' | 'full-screen-mobile';
    layer?: 'base' | 'nested';
    footer?: ReactNode;
    headerAction?: ReactNode;
    headerActionVisibility?: 'all' | 'mobile';
    showHandle?: boolean;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    restoreFocusVisible?: boolean;
    interactionDisabled?: boolean;
    children: ReactNode;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const dragFrameRef = useRef<GestureFrameDriver | null>(null);
    const restoreFocusVisibleRef = useRef(true);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const dragFrame = createGestureFrameDriver(
            (distance: number) => {
                contentRef.current?.style.setProperty(
                    '--sheet-drag-y',
                    `${distance}px`
                );
            },
            {
                shouldInterpolate: () =>
                    !window.matchMedia('(prefers-reduced-motion: reduce)')
                        .matches
            }
        );

        dragFrameRef.current = dragFrame;

        return () => {
            dragFrame.cancel();
            if (dragFrameRef.current === dragFrame) dragFrameRef.current = null;
            dragRef.current?.stopRawUpdates?.();
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (open) return;

        dragRef.current?.stopRawUpdates?.();
        dragRef.current = null;
        dragFrameRef.current?.cancel();
    }, [open]);

    const completeDragDismissal = (content: HTMLDivElement) => {
        if (content.dataset.dismissing !== 'true') return;

        delete content.dataset.dismissing;
        content.style.setProperty('--sheet-dismiss-duration', '1ms');
        overlayRef.current?.style.setProperty(
            '--sheet-dismiss-duration',
            '1ms'
        );
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        onOpenChange(false);
    };
    const moveDragFromPointer = (event: PointerEvent) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        const samples = getCoalescedPointerSamples(event);
        const latestSample = samples[samples.length - 1] ?? event;
        const visualSample = getPredictedPointerSample(event, latestSample);

        updateGestureVelocity(drag, samples, 'clientY');
        dragFrameRef.current?.schedule(
            Math.max(0, visualSample.clientY - drag.startY)
        );
    };
    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) =>
        moveDragFromPointer(event.nativeEvent);
    const finishDrag = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false
    ) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;

        const samples = getCoalescedPointerSamples(event.nativeEvent);
        const latestSample = samples[samples.length - 1] ?? event.nativeEvent;

        updateGestureVelocity(drag, samples, 'clientY');
        drag.stopRawUpdates?.();
        dragRef.current = null;
        const distance = Math.max(0, latestSample.clientY - drag.startY);

        dragFrameRef.current?.cancel();
        delete content.dataset.dragging;
        const height = content.getBoundingClientRect().height;
        const threshold = Math.min(180, height * 0.26);
        const projectedDistance = distance + Math.max(0, drag.velocity) * 180;
        const dismiss =
            !cancelled &&
            (distance >= threshold ||
                (distance >= 32 && drag.velocity >= 0.65) ||
                (distance >= 24 && projectedDistance >= threshold * 1.12));

        if (dismiss) {
            const exitDistance = height + 64;
            const remaining = Math.max(0, exitDistance - distance);
            const duration = Math.round(
                Math.max(180, Math.min(450, (450 * remaining) / exitDistance))
            );
            const dismissDuration = `${Math.round(duration)}ms`;

            content.style.setProperty(
                '--sheet-dismiss-duration',
                dismissDuration
            );
            content.dataset.dismissing = 'true';
            void content.offsetHeight;
            content.style.setProperty('--sheet-drag-y', `${exitDistance}px`);
            dismissTimerRef.current = setTimeout(
                () => completeDragDismissal(content),
                duration + 80
            );

            return;
        }

        content.dataset.settling = 'true';
        void content.offsetHeight;
        content.style.setProperty('--sheet-drag-y', '0px');
        settleTimerRef.current = setTimeout(() => {
            delete content.dataset.settling;
            settleTimerRef.current = null;
        }, 400);
    };
    const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (
            interactionDisabled ||
            dragRef.current ||
            event.button !== 0 ||
            window.matchMedia('(min-width: 760px)').matches ||
            (event.target as Element).closest('button')
        )
            return;
        const content = contentRef.current;

        if (!content) return;
        dragFrameRef.current?.reset(0);
        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
        delete content.dataset.settling;
        content.style.removeProperty('--sheet-dismiss-duration');
        overlayRef.current?.style.removeProperty('--sheet-dismiss-duration');
        content.dataset.dragging = 'true';
        content.dataset.hasDragged = 'true';
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastPosition: event.clientY,
            lastTime: event.timeStamp,
            velocity: 0
        };
        dragRef.current.stopRawUpdates = listenForRawPointerUpdates(
            event.currentTarget,
            moveDragFromPointer
        );
    };
    const changeOpen = (nextOpen: boolean) => {
        if (!nextOpen && interactionDisabled) return;
        onOpenChange(nextOpen);
    };

    return (
        <Dialog.Root open={open} onOpenChange={changeOpen}>
            <Dialog.Portal>
                <Dialog.Overlay
                    ref={overlayRef}
                    className='sheet-overlay'
                    data-layer={layer}
                />
                <Dialog.Content
                    ref={contentRef}
                    className='sheet-content'
                    data-has-footer={footer ? 'true' : 'false'}
                    data-interaction-disabled={
                        interactionDisabled ? 'true' : 'false'
                    }
                    data-layer={layer}
                    data-variant={variant}
                    inert={interactionDisabled}
                    onEscapeKeyDown={(event) => {
                        if (interactionDisabled) event.preventDefault();
                    }}
                    onCloseAutoFocus={(event) => {
                        const target = restoreFocusRef?.current;

                        if (!target) return;
                        event.preventDefault();
                        restoreSheetFocus(
                            target,
                            restoreFocusVisibleRef.current
                        );
                    }}
                    onOpenAutoFocus={(event) => {
                        restoreFocusVisibleRef.current =
                            restoreFocusVisible ??
                            restoreFocusRef?.current?.matches(
                                ':focus-visible'
                            ) ??
                            true;
                        event.preventDefault();
                        contentRef.current?.focus();
                    }}
                    onPointerDownOutside={(event) => {
                        if (interactionDisabled) event.preventDefault();
                    }}
                    onAnimationEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.currentTarget.dataset.state === 'closed'
                        ) {
                            onExitComplete?.();
                        }
                    }}
                    onTransitionEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.propertyName === 'transform' &&
                            event.currentTarget.dataset.dismissing === 'true'
                        )
                            completeDragDismissal(event.currentTarget);
                    }}
                >
                    <div
                        className='sheet-drag-region sheet-drag-region--active'
                        onPointerDown={startDrag}
                        onPointerMove={moveDrag}
                        onPointerUp={(event) => finishDrag(event)}
                        onPointerCancel={(event) => finishDrag(event, true)}
                    >
                        {showHandle ? (
                            <div className='sheet-handle' aria-hidden='true' />
                        ) : null}
                        <div className='sheet-header'>
                            <Dialog.Title className='sheet-title'>
                                {title}
                            </Dialog.Title>
                            {headerAction ? (
                                <div
                                    className='sheet-header-action'
                                    data-visibility={headerActionVisibility}
                                >
                                    {headerAction}
                                </div>
                            ) : null}
                            {!headerAction ||
                            headerActionVisibility === 'mobile' ? (
                                <Dialog.Close
                                    className='icon-button'
                                    aria-label='Close'
                                    data-visibility={
                                        headerAction
                                            ? 'desktop-with-mobile-action'
                                            : 'all'
                                    }
                                >
                                    <X size={22} strokeWidth={2} />
                                </Dialog.Close>
                            ) : null}
                        </div>
                    </div>
                    <div className='sheet-body'>{children}</div>
                    {footer ? (
                        <div className='sheet-footer'>{footer}</div>
                    ) : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
