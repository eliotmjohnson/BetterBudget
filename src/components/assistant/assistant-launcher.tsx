'use client';

import {
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent
} from 'react';
import { flushSync } from 'react-dom';
import type { MonthKey } from '@/domain/money';
import { AssistantSheet } from './assistant-sheet';
import { BetterBuddyFigure } from './better-buddy-figure';
import { useAssistant } from './use-assistant';

type Side = 'left' | 'right';

const STORAGE_KEY = 'betterBudgetAssistantPosition';
const CHANGE_EVENT = 'better-budget-assistant-position';
const DEFAULT_POSITION = 'right:0.68';
const DRAG_THRESHOLD_PX = 8;
const SWALLOW_CLICK_MS = 600;
const ARRIVAL_DELAY_MS = 600;
let memoryPosition: string | null = null;

function readPosition(): string {
    if (memoryPosition) return memoryPosition;
    try {
        return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_POSITION;
    } catch {
        return DEFAULT_POSITION;
    }
}

function persistPosition(value: string) {
    try {
        window.localStorage.setItem(STORAGE_KEY, value);

        return true;
    } catch {
        return false;
    }
}

function writePosition(side: Side, fraction: number) {
    memoryPosition = `${side}:${fraction.toFixed(3)}`;
    persistPosition(memoryPosition);
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribePosition(onChange: () => void) {
    window.addEventListener('storage', onChange);
    window.addEventListener(CHANGE_EVENT, onChange);

    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(CHANGE_EVENT, onChange);
    };
}

function parsePosition(raw: string): { side: Side; fraction: number } {
    const [side, value] = raw.split(':');
    const fraction = Number(value);

    return {
        side: side === 'left' ? 'left' : 'right',
        fraction:
            Number.isFinite(fraction) && fraction >= 0 && fraction <= 1
                ? fraction
                : 0.68
    };
}

/**
 * Swallows the click a browser synthesizes after a drag, wherever it lands,
 * so dropping Better Buddy never activates the control beneath him.
 */
function swallowNextClick() {
    const swallow = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        release();
    };
    const timer = window.setTimeout(() => release(), SWALLOW_CLICK_MS);
    const release = () => {
        window.clearTimeout(timer);
        window.removeEventListener('click', swallow, true);
    };

    window.addEventListener('click', swallow, true);
}

function waitForIdle(callback: () => void) {
    if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(callback, { timeout: 1500 });

        return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(callback, 0);

    return () => window.clearTimeout(handle);
}

function capturePointer(element: HTMLElement, pointerId: number) {
    try {
        element.setPointerCapture(pointerId);

        return true;
    } catch {
        return false;
    }
}

type ReturnTiming = 'now' | 'after-sheet';

interface DragState {
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
}

/**
 * The floating Better Buddy button. Drag it anywhere; on release it settles
 * against the nearer side edge at the height it was dropped.
 */
export function AssistantLauncher({ monthKey }: { monthKey: MonthKey }) {
    const position = parsePosition(
        useSyncExternalStore(
            subscribePosition,
            readPosition,
            () => DEFAULT_POSITION
        )
    );
    const [open, setOpen] = useState(false);
    const [away, setAway] = useState(false);
    const [returning, setReturning] = useState<ReturnTiming | null>(null);
    const assistant = useAssistant(monthKey);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const droppedRef = useRef(false);
    const [arrived, setArrived] = useState(false);

    useEffect(() => {
        let arrivalTimer = 0;
        const cancelIdle = waitForIdle(() => {
            arrivalTimer = window.setTimeout(
                () => setArrived(true),
                ARRIVAL_DELAY_MS
            );
        });

        return () => {
            cancelIdle();
            window.clearTimeout(arrivalTimer);
        };
    }, []);
    const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false
        };
        capturePointer(event.currentTarget, event.pointerId);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;

        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        const button = event.currentTarget;

        button.dataset.dragging = 'true';
        button.style.transition = 'none';
        button.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    const onPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (!drag.moved) return;
        droppedRef.current = true;
        swallowNextClick();
        const button = event.currentTarget;
        const from = button.getBoundingClientRect();
        const centerX = from.left + from.width / 2;

        flushSync(() =>
            writePosition(
                centerX < window.innerWidth / 2 ? 'left' : 'right',
                Math.min(1, Math.max(0, from.top / window.innerHeight))
            )
        );
        button.style.transform = '';
        const to = button.getBoundingClientRect();

        button.style.transform = `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0)`;
        button.getBoundingClientRect();
        button.style.transition = '';
        button.style.transform = '';
        delete button.dataset.dragging;
    };

    return (
        <>
            <button
                ref={buttonRef}
                type='button'
                className='assistant-launcher'
                data-side={position.side}
                data-arrived={arrived ? 'true' : undefined}
                data-away={away ? 'true' : undefined}
                data-returning={returning ?? undefined}
                style={
                    {
                        '--assistant-y': position.fraction
                    } as CSSProperties
                }
                aria-label='Open Better Buddy'
                aria-haspopup='dialog'
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onTouchEnd={(event) => {
                    if (!droppedRef.current) return;
                    droppedRef.current = false;
                    event.preventDefault();
                }}
                onContextMenu={(event) => event.preventDefault()}
                onClick={() => {
                    droppedRef.current = false;
                    setOpen(true);
                    setAway(true);
                }}
            >
                <BetterBuddyFigure size={64} priority />
            </button>
            <AssistantSheet
                open={open}
                onOpenChange={(next) => {
                    if (!next && away) {
                        setReturning('after-sheet');
                        setAway(false);
                    }
                    setOpen(next);
                }}
                onDragDismissStart={() => {
                    setReturning('now');
                    setAway(false);
                }}
                restoreFocusRef={buttonRef}
                transcript={assistant.transcript}
                pending={assistant.pending}
                onSend={(text) => void assistant.send(text)}
                onReset={assistant.reset}
            />
        </>
    );
}
