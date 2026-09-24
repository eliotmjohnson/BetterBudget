'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useContinuousCorners } from './continuous-corners';
import { isToastTarget } from './toast-provider';
import {
    useCallback,
    useEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
    type ReactNode
} from 'react';
import {
    createPointerTrack,
    exitMotion,
    getCoalescedPointerSamples,
    recordPointerSamples,
    releaseVelocity,
    type PointerTrack
} from './gesture-release';

interface DragState {
    pointerId: number;
    originY: number;
    startY: number;
    track: PointerTrack;
}

const settleDuration = 400;
const exitOvershoot = 64;
const translateY = (distance: number) => `translate3d(0, ${distance}px, 0)`;

function renderedOffset(content: HTMLElement) {
    return new DOMMatrixReadOnly(getComputedStyle(content).transform).m42;
}

export function restoreSheetFocus(target: HTMLElement, focusVisible: boolean) {
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
    onDragDismissStart,
    title,
    titleAdornment,
    variant = 'standard',
    layer = 'base',
    footer,
    headerAction,
    headerActionVisibility = 'all',
    showHandle = true,
    showClose = true,
    restoreFocusRef,
    restoreFocusVisible,
    interactionDisabled = false,
    children
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete?: () => void;
    onDragDismissStart?: () => void;
    title: string;
    titleAdornment?: ReactNode;
    variant?:
        'standard' | 'raised-mobile' | 'capped-mobile' | 'full-screen-mobile';
    layer?: 'base' | 'nested';
    footer?: ReactNode;
    headerAction?: ReactNode;
    headerActionVisibility?: 'all' | 'mobile';
    showHandle?: boolean;
    showClose?: boolean;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    restoreFocusVisible?: boolean;
    interactionDisabled?: boolean;
    children: ReactNode;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [cornersRef] = useContinuousCorners<HTMLDivElement>();
    const setContentRef = useCallback(
        (node: HTMLDivElement | null) => {
            contentRef.current = node;
            cornersRef(node);
        },
        [cornersRef]
    );
    const overlayRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const restoreFocusVisibleRef = useRef(true);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        },
        []
    );

    useEffect(() => {
        if (!open) dragRef.current = null;
    }, [open]);

    const completeDragDismissal = (content: HTMLDivElement) => {
        if (content.dataset.dismissing !== 'true') return;

        delete content.dataset.dismissing;
        content.style.setProperty('--sheet-drag-y', 'calc(100% + 64px)');
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
    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        const samples = getCoalescedPointerSamples(event.nativeEvent);
        const latestSample = samples[samples.length - 1] ?? event.nativeEvent;

        recordPointerSamples(drag.track, samples);
        content.style.transform = translateY(
            Math.max(0, drag.originY + latestSample.clientY - drag.startY)
        );
    };
    const settleDrag = (content: HTMLDivElement) => {
        content.style.removeProperty('transition');
        content.dataset.settling = 'true';
        void content.offsetHeight;
        content.style.transform = translateY(0);
        settleTimerRef.current = setTimeout(() => {
            delete content.dataset.settling;
            content.style.removeProperty('transform');
            settleTimerRef.current = null;
        }, settleDuration);
    };
    const dismissDrag = (
        content: HTMLDivElement,
        offset: number,
        velocity: number
    ) => {
        const exitDistance =
            content.getBoundingClientRect().height + exitOvershoot;
        const { duration, transition } = exitMotion(
            exitDistance - offset,
            velocity
        );

        content.dataset.dismissing = 'true';
        onDragDismissStart?.();
        void content.offsetHeight;
        content.style.transition = transition;
        content.style.transform = translateY(exitDistance);
        dismissTimerRef.current = setTimeout(
            () => completeDragDismissal(content),
            duration + 80
        );
    };
    const finishDrag = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false
    ) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;

        const samples = getCoalescedPointerSamples(event.nativeEvent);
        const latestSample = samples[samples.length - 1] ?? event.nativeEvent;
        const velocity = releaseVelocity(
            drag.track,
            event.nativeEvent,
            samples
        );

        dragRef.current = null;
        const distance = Math.max(
            0,
            drag.originY + latestSample.clientY - drag.startY
        );
        const offset = renderedOffset(content);

        delete content.dataset.dragging;
        const height = content.getBoundingClientRect().height;
        const threshold = Math.min(180, height * 0.26);
        const projectedDistance = distance + Math.max(0, velocity) * 180;
        const dismiss =
            !cancelled &&
            (distance >= threshold ||
                (distance >= 32 && velocity >= 0.65) ||
                (distance >= 24 && projectedDistance >= threshold * 1.12));

        if (dismiss) dismissDrag(content, offset, velocity);
        else settleDrag(content);
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

        if (!content || content.dataset.dismissing === 'true') return;
        const offset = Math.max(0, renderedOffset(content));

        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
        delete content.dataset.settling;
        content.style.removeProperty('transition');
        content.style.transform = translateY(offset);
        content.style.removeProperty('--sheet-dismiss-duration');
        overlayRef.current?.style.removeProperty('--sheet-dismiss-duration');
        content.dataset.dragging = 'true';
        content.dataset.hasDragged = 'true';
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            originY: offset,
            startY: event.clientY,
            track: createPointerTrack(event.nativeEvent, 'clientY')
        };
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
                    ref={setContentRef}
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
                        if (interactionDisabled || isToastTarget(event.target))
                            event.preventDefault();
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
                            {titleAdornment ? (
                                <div className='sheet-title-group'>
                                    {titleAdornment}
                                    <Dialog.Title className='sheet-title'>
                                        {title}
                                    </Dialog.Title>
                                </div>
                            ) : (
                                <Dialog.Title className='sheet-title'>
                                    {title}
                                </Dialog.Title>
                            )}
                            {headerAction ? (
                                <div
                                    className='sheet-header-action'
                                    data-visibility={headerActionVisibility}
                                >
                                    {headerAction}
                                </div>
                            ) : null}
                            {showClose &&
                            (!headerAction ||
                                headerActionVisibility === 'mobile') ? (
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
