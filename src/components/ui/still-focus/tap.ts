import type { TouchEvent as ReactTouchEvent } from 'react';
import type { StillField } from './field';
import { focusStill } from './park';

const TAP_SLOP_PX = 10;
let press: { x: number; y: number; field: StillField } | null = null;

/**
 * Remembers where a single-finger touch on an unfocused field began, so
 * `endStillTap` can tell a tap from a scroll or a swipe.
 */
export function startStillTap(event: ReactTouchEvent<StillField>) {
    const field = event.currentTarget;
    const touch = event.touches[0];

    press =
        touch && event.touches.length === 1 && document.activeElement !== field
            ? { x: touch.clientX, y: touch.clientY, field }
            : null;
}

/**
 * Turns a tap on an unfocused field into a focus iOS does not scroll the page
 * for: the field asks for no scroll and, when the keyboard is still down, is
 * parked off-screen while it opens. iOS otherwise slides the whole page
 * toward the field, dragging the header and Better Buddy with it. A touch that
 * moved past `TAP_SLOP_PX` is a scroll or a swipe and is left alone.
 */
export function endStillTap(event: ReactTouchEvent<StillField>) {
    const tap = press;
    const touch = event.changedTouches[0];

    press = null;
    if (
        !tap ||
        tap.field !== event.currentTarget ||
        !touch ||
        Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > TAP_SLOP_PX
    )
        return;
    event.preventDefault();
    if (document.activeElement !== tap.field) focusStill(tap.field, true);
}
