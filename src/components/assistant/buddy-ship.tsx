'use client';

import Image from 'next/image';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject
} from 'react';
import beamArt from './better-buddy-ship-beam.png';
import shipArt from './better-buddy-ship.png';

type ShipState = 'hidden' | 'waiting' | 'leaving' | 'boarding' | 'departing';

interface Point {
    x: number;
    y: number;
}

const HOLD_MS = 1000;
const ZONE_DELAY_MS = 180;
const LEAVE_MS = 420;
const BOARD_MS = 950;
const DEPART_MS = 1000;
const HATCH_X = 0.5;
const HATCH_Y = 0.665;
const SUMMON_ZONE = 0.36;
const DISMISS_ZONE = 0.46;
const TARGET_TOP = 0.8;
const TARGET_BELOW_PX = 44;
const TARGET_HALF_WIDTH_PX = 40;

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The spaceship that drops in while Better Buddy is held near the top of the
 * screen, once he has been held for a second. `track` follows the drag, given
 * how long he has been held, calling and dismissing the ship and
 * targeting the bottom of its beam; `release` ends a drag, returning false and
 * sending the ship away unless he was let go there, in which case it pulls him
 * aboard, flies the ship off, and calls `onBoarded` to turn him off.
 */
export function useBuddyShip(onBoarded: () => void) {
    const [state, setState] = useState<ShipState>('hidden');
    const [targeted, setTargeted] = useState(false);
    const stateRef = useRef<ShipState>('hidden');
    const targetedRef = useRef(false);
    const shipRef = useRef<HTMLDivElement>(null);
    const timersRef = useRef<number[]>([]);
    const summoningRef = useRef(false);
    const onBoardedRef = useRef(onBoarded);

    useEffect(() => {
        onBoardedRef.current = onBoarded;
    }, [onBoarded]);
    useEffect(() => {
        const timers = timersRef.current;

        return () => timers.forEach((timer) => window.clearTimeout(timer));
    }, []);
    const clearTimers = () => {
        summoningRef.current = false;
        timersRef.current
            .splice(0)
            .forEach((timer) => window.clearTimeout(timer));
    };
    const later = (delay: number, run: () => void) => {
        timersRef.current.push(window.setTimeout(run, delay));
    };
    const moveTo = useCallback((next: ShipState) => {
        stateRef.current = next;
        setState(next);
    }, []);
    const target = useCallback((next: boolean) => {
        if (targetedRef.current === next) return;
        targetedRef.current = next;
        setTargeted(next);
    }, []);
    const summon = (heldMs: number) => {
        clearTimers();
        summoningRef.current = true;
        later(Math.max(ZONE_DELAY_MS, HOLD_MS - heldMs), () => {
            summoningRef.current = false;
            moveTo('waiting');
        });
    };
    const aim = (center: Point) => {
        const rect = shipRef.current?.getBoundingClientRect();

        target(
            !!rect &&
                Math.abs(center.x - (rect.left + rect.width * HATCH_X)) <
                    TARGET_HALF_WIDTH_PX &&
                center.y > rect.top + rect.height * TARGET_TOP &&
                center.y < rect.bottom + TARGET_BELOW_PX
        );
    };
    const track = (center: Point, heldMs: number) => {
        const current = stateRef.current;

        if (current === 'boarding' || current === 'departing') return;
        const called = current === 'waiting' || summoningRef.current;
        const height = center.y / window.innerHeight;

        if (height > (called ? DISMISS_ZONE : SUMMON_ZONE)) {
            if (called) dismiss();

            return;
        }
        if (!called) summon(heldMs);
        else if (current === 'waiting') aim(center);
    };
    const hatch = (): Point | null => {
        const rect = shipRef.current?.getBoundingClientRect();

        return rect
            ? {
                  x: rect.left + rect.width * HATCH_X,
                  y: rect.top + rect.height * HATCH_Y
              }
            : null;
    };

    function dismiss() {
        const current = stateRef.current;

        target(false);
        if (current === 'leaving' && !summoningRef.current) return;
        clearTimers();
        if (current !== 'waiting') {
            moveTo('hidden');

            return;
        }
        moveTo('leaving');
        later(LEAVE_MS, () => moveTo('hidden'));
    }
    const release = (buddy: HTMLElement, offset: Point, canBoard: boolean) => {
        const aboard = hatch();

        if (
            !canBoard ||
            !targetedRef.current ||
            stateRef.current !== 'waiting' ||
            !aboard
        ) {
            dismiss();

            return false;
        }
        clearTimers();
        if (prefersReducedMotion()) {
            onBoardedRef.current();

            return true;
        }
        moveTo('boarding');
        const rect = buddy.getBoundingClientRect();
        const to = {
            x: offset.x + aboard.x - (rect.left + rect.width / 2),
            y: offset.y + aboard.y - (rect.top + rect.height / 2)
        };

        buddy.dataset.boarding = 'true';
        buddy.animate(
            [
                {
                    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(1)`,
                    opacity: 1,
                    easing: 'cubic-bezier(0.3, 0, 0.3, 1)'
                },
                {
                    offset: 0.25,
                    transform: `translate3d(${offset.x}px, ${offset.y - 10}px, 0) scale(1.05)`,
                    opacity: 1,
                    easing: 'cubic-bezier(0.55, 0, 0.75, 0.4)'
                },
                {
                    transform: `translate3d(${to.x}px, ${to.y}px, 0) scale(0.12)`,
                    opacity: 0
                }
            ],
            { duration: BOARD_MS, fill: 'forwards' }
        );
        later(BOARD_MS, () => moveTo('departing'));
        later(BOARD_MS + DEPART_MS, () => onBoardedRef.current());

        return true;
    };

    return { state, targeted, shipRef, track, release };
}

export function BuddyShip({
    state,
    targeted,
    shipRef
}: {
    state: ShipState;
    targeted: boolean;
    shipRef: RefObject<HTMLDivElement | null>;
}) {
    return (
        <div
            ref={shipRef}
            className='buddy-ship'
            data-state={state}
            data-targeted={targeted ? 'true' : undefined}
            aria-hidden='true'
        >
            <div className='buddy-ship-craft'>
                <Image
                    className='buddy-ship-beam'
                    src={beamArt}
                    alt=''
                    draggable={false}
                    loading='eager'
                    unoptimized
                />
                <Image
                    className='buddy-ship-hull'
                    src={shipArt}
                    alt=''
                    draggable={false}
                    loading='eager'
                    unoptimized
                />
            </div>
        </div>
    );
}
