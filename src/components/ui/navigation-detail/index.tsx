'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, X } from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
    type RefObject
} from 'react';
import {
    createGestureFrameDriver,
    type GestureFrameDriver
} from '@/components/ui/gesture-frame';
import {
    clearBaseMotion,
    completeDragDismissal,
    finishDrag,
    moveDrag,
    setBaseDragPosition,
    startDrag,
    type EdgeDragContext,
    type EdgeDragState
} from './edge-drag';
import {
    clearTitleMotion,
    mobileMedia,
    setupTitleMotion,
    titleEditTransitionCleanupDelay
} from './title-motion';

const motionCleanupDelay = 600;

function restoreDetailFocus(target: HTMLElement, focusVisible: boolean) {
    if (!focusVisible) target.dataset.navigationDetailRestoredFocus = 'true';
    target.focus({ preventScroll: true });
    if (focusVisible) return;

    requestAnimationFrame(() => {
        if (document.activeElement !== target) {
            delete target.dataset.navigationDetailRestoredFocus;

            return;
        }

        const clearRestoredFocus = () => {
            delete target.dataset.navigationDetailRestoredFocus;
            target.removeEventListener('blur', clearRestoredFocus);
            target.removeEventListener('keydown', clearRestoredFocus);
        };

        target.addEventListener('blur', clearRestoredFocus, { once: true });
        target.addEventListener('keydown', clearRestoredFocus, { once: true });
    });
}

export function NavigationDetail({
    backLabel = 'Budget',
    children,
    floatingAction,
    headerAction,
    open,
    onOpenChange,
    restoreFocusRef,
    restoreFocusPreferenceRef,
    restoreFocusVisible,
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
    restoreFocusPreferenceRef?: RefObject<boolean>;
    restoreFocusVisible?: boolean;
    title: string;
    titleContent?: ReactNode;
}) {
    const bodyRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentReady, setContentReady] = useState(false);
    const dragRef = useRef<EdgeDragState | null>(null);
    const dragFrameRef = useRef<GestureFrameDriver | null>(null);
    const dragWidthRef = useRef(1);
    const gestureReadyRef = useRef(false);
    const headerRef = useRef<HTMLElement>(null);
    const activeRef = useRef(false);
    const restoreFocusVisibleRef = useRef(true);
    const reducedMotionTitleCollapsedRef = useRef(false);
    const prepareTitleEditingRef = useRef<() => void>(() => undefined);
    const scheduleTitleMotionRef = useRef<() => void>(() => undefined);
    const titleEditingRef = useRef(false);
    const titleMotionOpenRef = useRef(false);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const titleSelectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const motionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const gestureReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const setContentRef = useCallback((element: HTMLDivElement | null) => {
        contentRef.current = element;
        setContentReady(element !== null);
    }, []);
    const resetSettleTimer = () => {
        if (!settleTimerRef.current) return;
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
    };
    const clearTitleSelectionTimer = () => {
        if (!titleSelectionTimerRef.current) return;
        clearTimeout(titleSelectionTimerRef.current);
        titleSelectionTimerRef.current = null;
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
            dragFrameRef.current?.cancel();
            dragRef.current?.stopRawUpdates?.();
            dragRef.current = null;
            gestureReadyRef.current = false;
            document.body.dataset.navigationDetailState = 'closed';
        }
    }, [open]);

    useLayoutEffect(() => {
        if (!open) {
            titleMotionOpenRef.current = false;
            prepareTitleEditingRef.current = () => undefined;
            scheduleTitleMotionRef.current = () => undefined;

            return;
        }

        return setupTitleMotion({
            bodyRef,
            contentRef,
            headerRef,
            prepareTitleEditingRef,
            reducedMotionTitleCollapsedRef,
            scheduleTitleMotionRef,
            titleEditingRef,
            titleMotionOpenRef,
            titleRef
        });
    }, [contentReady, open, title]);

    useEffect(() => {
        const dragFrame = createGestureFrameDriver(
            (distance) => {
                contentRef.current?.style.setProperty(
                    '--navigation-detail-drag-x',
                    `${distance}px`
                );
                setBaseDragPosition(distance, dragWidthRef.current);
            },
            {
                shouldInterpolate: () =>
                    !window.matchMedia('(prefers-reduced-motion: reduce)')
                        .matches
            }
        );

        dragFrameRef.current = dragFrame;

        return () => {
            resetSettleTimer();
            dragFrame.cancel();
            if (dragFrameRef.current === dragFrame) dragFrameRef.current = null;
            dragRef.current?.stopRawUpdates?.();

            // Reading the pending timer at teardown is the point: whatever the
            // dismissal scheduled last is what has to be cancelled.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            if (motionCleanupTimerRef.current)
                clearTimeout(motionCleanupTimerRef.current);
            if (gestureReadyTimerRef.current)
                clearTimeout(gestureReadyTimerRef.current);
            clearTitleSelectionTimer();
            clearTitleMotion(contentRef.current);
            clearBaseMotion();
        };
    }, []);

    const dragContext = (): EdgeDragContext => ({
        contentRef,
        dismissTimerRef,
        dragFrameRef,
        dragRef,
        dragWidthRef,
        gestureReadyRef,
        onOpenChange,
        resetSettleTimer,
        settleTimerRef
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay
                    className='navigation-detail-overlay'
                    onPointerDown={(event) => startDrag(dragContext(), event)}
                    onPointerMove={(event) => moveDrag(dragContext(), event)}
                    onPointerUp={(event) => finishDrag(dragContext(), event)}
                    onPointerCancel={(event) =>
                        finishDrag(dragContext(), event, true)
                    }
                />
                <Dialog.Content
                    ref={setContentRef}
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
                            clearTitleMotion(event.currentTarget);
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
                        restoreDetailFocus(
                            target,
                            restoreFocusVisibleRef.current
                        );
                    }}
                    onEscapeKeyDown={(event) => {
                        if (titleEditingRef.current) event.preventDefault();
                    }}
                    onOpenAutoFocus={(event) => {
                        restoreFocusVisibleRef.current =
                            restoreFocusPreferenceRef?.current ??
                            restoreFocusVisible ??
                            restoreFocusRef?.current?.matches(
                                ':focus-visible'
                            ) ??
                            true;
                        event.preventDefault();
                        contentRef.current?.focus();
                    }}
                    onTransitionEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.propertyName === 'transform' &&
                            event.currentTarget.dataset.dismissing === 'true'
                        )
                            completeDragDismissal(
                                dragContext(),
                                event.currentTarget
                            );
                    }}
                    onPointerDownOutside={(event) => {
                        if (window.matchMedia(mobileMedia).matches)
                            event.preventDefault();
                    }}
                    onPointerDown={(event) => startDrag(dragContext(), event)}
                    onPointerMove={(event) => moveDrag(dragContext(), event)}
                    onPointerUp={(event) => finishDrag(dragContext(), event)}
                    onPointerCancel={(event) =>
                        finishDrag(dragContext(), event, true)
                    }
                >
                    <div
                        className='navigation-detail-handle'
                        aria-hidden='true'
                    />
                    <header
                        ref={headerRef}
                        className='navigation-detail-header'
                    >
                        <button
                            className='navigation-detail-back'
                            type='button'
                            aria-label={`Back to ${backLabel}`}
                            onClick={() => onOpenChange(false)}
                        >
                            <ChevronLeft size={30} strokeWidth={2.1} />
                        </button>
                        <Dialog.Title
                            ref={titleRef}
                            className='navigation-detail-title'
                            aria-label={title}
                            onBlurCapture={(event) => {
                                if (
                                    !(event.target as Element).matches(
                                        '.navigation-detail-title-input'
                                    )
                                )
                                    return;
                                clearTitleSelectionTimer();
                                titleEditingRef.current = false;
                                scheduleTitleMotionRef.current();
                            }}
                            onFocusCapture={(event) => {
                                if (
                                    !(event.target as Element).matches(
                                        '.navigation-detail-title-input'
                                    )
                                )
                                    return;
                                const input = event.target as HTMLInputElement;
                                const delaySelection =
                                    contentRef.current?.hasAttribute(
                                        'data-navigation-detail-title-motion'
                                    ) === true &&
                                    !window.matchMedia(
                                        '(prefers-reduced-motion: reduce)'
                                    ).matches;

                                clearTitleSelectionTimer();
                                if (delaySelection)
                                    prepareTitleEditingRef.current();
                                titleEditingRef.current = true;
                                scheduleTitleMotionRef.current();
                                if (!delaySelection) {
                                    input.select();

                                    return;
                                }

                                titleSelectionTimerRef.current = setTimeout(
                                    () => {
                                        titleSelectionTimerRef.current = null;
                                        if (
                                            input.isConnected &&
                                            document.activeElement === input
                                        )
                                            input.select();
                                    },
                                    titleEditTransitionCleanupDelay
                                );
                            }}
                            onKeyDown={(event) => {
                                if (
                                    event.key === 'Escape' &&
                                    (event.target as Element).matches(
                                        '.navigation-detail-title-input'
                                    )
                                )
                                    event.stopPropagation();
                            }}
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
                    <div ref={bodyRef} className='navigation-detail-body'>
                        {children}
                    </div>
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
