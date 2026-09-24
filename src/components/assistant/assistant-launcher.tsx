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
import { BetterBuddyFigure, resyncFloorShadow } from './better-buddy-figure';
import { BuddyProtestBubble, useBuddyProtest } from './buddy-protest';
import { BuddyShip, useBuddyShip } from './buddy-ship';
import {
    createThrowTracks,
    projectThrow,
    recordThrow,
    settleKeyframes,
    throwVelocity,
    type ThrowTracks,
    type Velocity
} from './launcher-throw';
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
    startTime: number;
    baseX: number;
    baseY: number;
    centerX: number;
    centerY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    tracks: ThrowTracks;
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Stops an in-flight settle where it is, holding that spot with an inline
 * transform, and returns the offset so a new drag can continue from it.
 */
function catchSettle(button: HTMLElement, settle: Animation | null) {
    if (!settle || settle.playState !== 'running') return { x: 0, y: 0 };
    const matrix = new DOMMatrixReadOnly(getComputedStyle(button).transform);

    settle.cancel();
    button.style.transition = 'none';
    button.style.transform = `translate3d(${matrix.m41}px, ${matrix.m42}px, 0)`;

    return { x: matrix.m41, y: matrix.m42 };
}

/**
 * The floating Better Buddy button. Drag it anywhere; on release it settles
 * against the nearer side edge at the height it was dropped.
 */
export function AssistantLauncher({
    monthKey,
    onBeamUp
}: {
    monthKey: MonthKey;
    onBeamUp: () => void;
}) {
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
    const settleRef = useRef<Animation | null>(null);
    const [arrived, setArrived] = useState(false);
    const { protest, protestThrow, clearProtest } = useBuddyProtest(buttonRef);
    const ship = useBuddyShip(onBeamUp);

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
        const base = catchSettle(event.currentTarget, settleRef.current);
        const rect = event.currentTarget.getBoundingClientRect();

        settleRef.current = null;
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startTime: event.timeStamp,
            baseX: base.x,
            baseY: base.y,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            offsetX: base.x,
            offsetY: base.y,
            moved: false,
            tracks: createThrowTracks(event.nativeEvent)
        };
        capturePointer(event.currentTarget, event.pointerId);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;
        recordThrow(drag.tracks, event.nativeEvent);
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;

        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        drag.offsetX = drag.baseX + dx;
        drag.offsetY = drag.baseY + dy;
        const button = event.currentTarget;

        button.dataset.dragging = 'true';
        button.style.transition = 'none';
        button.style.transform = `translate3d(${drag.offsetX}px, ${drag.offsetY}px, 0)`;
        ship.track(
            { x: drag.centerX + dx, y: drag.centerY + dy },
            event.timeStamp - drag.startTime
        );
    };
    const settle = (
        button: HTMLButtonElement,
        side: Side,
        fraction: number,
        velocity: Velocity
    ) => {
        const from = button.getBoundingClientRect();

        flushSync(() => writePosition(side, fraction));
        button.style.transition = 'none';
        button.style.transform = '';
        const to = button.getBoundingClientRect();

        delete button.dataset.dragging;
        resyncFloorShadow(button);
        if (!prefersReducedMotion()) {
            const motion = settleKeyframes(
                from.left - to.left,
                from.top - to.top,
                velocity
            );

            settleRef.current = button.animate(motion.keyframes, {
                duration: motion.duration,
                easing: 'linear'
            });
        }
        button.style.transition = '';
    };
    const onPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        const button = event.currentTarget;

        if (!drag.moved) {
            if (drag.baseX !== 0 || drag.baseY !== 0)
                settle(button, position.side, position.fraction, {
                    x: 0,
                    y: 0
                });

            return;
        }
        droppedRef.current = true;
        swallowNextClick();
        if (
            ship.release(
                button,
                { x: drag.offsetX, y: drag.offsetY },
                event.type !== 'pointercancel'
            )
        ) {
            delete button.dataset.dragging;

            return;
        }
        const velocity =
            event.type === 'pointercancel' || prefersReducedMotion()
                ? { x: 0, y: 0 }
                : throwVelocity(drag.tracks, event.nativeEvent);
        const from = button.getBoundingClientRect();
        const landingX = from.left + from.width / 2 + projectThrow(velocity.x);
        const landingTop = from.top + projectThrow(velocity.y);
        const side = landingX < window.innerWidth / 2 ? 'left' : 'right';

        settle(
            button,
            side,
            Math.min(1, Math.max(0, landingTop / window.innerHeight)),
            velocity
        );
        protestThrow(velocity, side);
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
                    clearProtest();
                    setOpen(true);
                    setAway(true);
                }}
            >
                <BetterBuddyFigure size={64} priority />
                <BuddyProtestBubble protest={protest} />
            </button>
            {arrived ? (
                <BuddyShip
                    state={ship.state}
                    targeted={ship.targeted}
                    shipRef={ship.shipRef}
                />
            ) : null}
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
                onRetry={() => void assistant.retry()}
                onReset={assistant.reset}
            />
        </>
    );
}
