'use client';

import type { TouchEvent as ReactTouchEvent } from 'react';

const TAP_SLOP_PX = 10;
const KEYBOARD_MIN_PX = 100;
const FIELD_CLEARANCE_PX = 16;
const CALCULATOR_BAR_PX = 56;
let press: { x: number; y: number; field: HTMLInputElement } | null = null;

/**
 * Touch handlers that turn a tap on an unfocused field into a focus that asks
 * for no scroll. iOS otherwise pans the whole page toward the field as the
 * keyboard opens, in steps that run ahead of it, dragging the header and
 * Better Buddy with it. A touch that moves past `TAP_SLOP_PX` is a scroll or a
 * swipe and is left alone.
 */
export const stillFocusHandlers = {
    onTouchStart(event: ReactTouchEvent<HTMLInputElement>) {
        const field = event.currentTarget;
        const touch = event.touches[0];

        press =
            touch &&
            event.touches.length === 1 &&
            document.activeElement !== field
                ? { x: touch.clientX, y: touch.clientY, field }
                : null;
    },
    onTouchEnd(event: ReactTouchEvent<HTMLInputElement>) {
        const tap = press;
        const touch = event.changedTouches[0];

        press = null;
        if (
            !tap ||
            tap.field !== event.currentTarget ||
            !touch ||
            Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) >
                TAP_SLOP_PX
        )
            return;
        event.preventDefault();
        tap.field.focus({ preventScroll: true });
    }
};

/**
 * Pads the end of `scroller` so it can scroll `distance` further, for rows
 * near the end of the list that could otherwise never clear the keyboard, and
 * takes the padding back once the keyboard has closed.
 */
function lendScrollRoom(scroller: HTMLElement, distance: number) {
    const viewport = window.visualViewport;
    const lent = Number.parseInt(scroller.style.paddingBottom, 10) || 0;
    const room =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;

    if (!viewport || distance <= room) return;
    scroller.style.paddingBottom = `${lent + distance - room}px`;
    if (lent > 0) return;
    const reclaim = () => {
        if (
            document.documentElement.clientHeight - viewport.height >=
            KEYBOARD_MIN_PX
        )
            return;
        viewport.removeEventListener('resize', reclaim);
        scroller.style.removeProperty('padding-bottom');
    };

    viewport.addEventListener('resize', reclaim);
}

/**
 * Once the on-screen keyboard reports its size, smoothly scrolls `scroller`
 * just far enough that the focused money field clears the keyboard and the
 * calculator bar docked above it. It measures against the visual viewport, so
 * a field iOS already revealed by panning the page is left where it is. Also
 * checks once on the next frame, for a field focused while the keyboard is
 * already up. Stops listening when the field blurs.
 */
export function revealAboveKeyboard(
    field: HTMLElement,
    scroller: HTMLElement | null
) {
    const viewport = window.visualViewport;

    if (!viewport || !scroller) return;
    const reveal = () => {
        const keyboard =
            document.documentElement.clientHeight - viewport.height;
        const overlap =
            field.getBoundingClientRect().bottom +
            FIELD_CLEARANCE_PX +
            CALCULATOR_BAR_PX -
            (viewport.offsetTop + viewport.height);

        if (keyboard < KEYBOARD_MIN_PX || overlap <= 0) return;
        lendScrollRoom(scroller, overlap);
        scroller.scrollBy({ top: overlap, behavior: 'smooth' });
    };
    const stop = () => {
        viewport.removeEventListener('resize', reveal);
        field.removeEventListener('blur', stop);
    };

    viewport.addEventListener('resize', reveal);
    field.addEventListener('blur', stop);
    requestAnimationFrame(reveal);
}
