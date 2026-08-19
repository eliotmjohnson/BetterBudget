'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
    useEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type ReactNode
} from 'react';

interface DragState {
    pointerId: number;
    startY: number;
    lastY: number;
    lastAt: number;
    velocity: number;
}

export function Sheet({
    open,
    onOpenChange,
    onExitComplete,
    title,
    children
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExitComplete?: () => void;
    title: string;
    children: ReactNode;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        },
        []
    );

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
    const finishDrag = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false
    ) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;

        dragRef.current = null;
        const distance = Math.max(0, event.clientY - drag.startY);

        content.style.setProperty('--sheet-drag-y', `${distance}px`);
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
            event.button !== 0 ||
            window.matchMedia('(min-width: 760px)').matches ||
            (event.target as Element).closest('button')
        )
            return;
        const content = contentRef.current;

        if (!content) return;
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
            lastY: event.clientY,
            lastAt: event.timeStamp,
            velocity: 0
        };
    };
    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        const delta = event.clientY - drag.startY;
        const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
        const instantaneousVelocity = (event.clientY - drag.lastY) / elapsed;

        drag.velocity = drag.velocity * 0.68 + instantaneousVelocity * 0.32;
        drag.lastY = event.clientY;
        drag.lastAt = event.timeStamp;
        const visualDistance = Math.max(0, delta);

        content.style.setProperty('--sheet-drag-y', `${visualDistance}px`);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay ref={overlayRef} className='sheet-overlay' />
                <Dialog.Content
                    ref={contentRef}
                    className='sheet-content'
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
                        <div className='sheet-handle' aria-hidden='true' />
                        <div className='sheet-header'>
                            <Dialog.Title className='sheet-title'>
                                {title}
                            </Dialog.Title>
                            <Dialog.Close
                                className='icon-button'
                                aria-label='Close'
                            >
                                <X size={22} strokeWidth={2} />
                            </Dialog.Close>
                        </div>
                    </div>
                    <div className='sheet-body'>{children}</div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
