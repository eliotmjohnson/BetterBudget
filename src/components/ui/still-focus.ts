'use client';

import type { TouchEvent as ReactTouchEvent } from 'react';

const TAP_SLOP_PX = 10;
const KEYBOARD_MIN_PX = 100;
const FIELD_CLEARANCE_PX = 16;
const CALCULATOR_BAR_PX = 56;
const PARK_OFFSET_PX = 10000;
const KEYBOARD_SETTLE_MS = 150;
const PARK_LIMIT_MS = 1200;
const VEIL_MS = 300;
let press: { x: number; y: number; field: HTMLInputElement } | null = null;
let quietFocus: HTMLInputElement | null = null;
let held: { field: HTMLElement; standIn: HTMLElement } | null = null;

function keyboardHeight(viewport: VisualViewport) {
    return document.documentElement.clientHeight - viewport.height;
}

/**
 * An inert copy of `field`, laid over its spot, that shows its value while the
 * field itself is hidden.
 */
function createStandIn(field: HTMLInputElement) {
    const standIn = field.cloneNode() as HTMLInputElement;

    standIn.value = field.value;
    standIn.removeAttribute('id');
    standIn.removeAttribute('name');
    standIn.tabIndex = -1;
    standIn.readOnly = true;
    standIn.inert = true;
    standIn.setAttribute('aria-hidden', 'true');
    Object.assign(standIn.style, {
        position: 'absolute',
        left: `${field.offsetLeft}px`,
        top: `${field.offsetTop}px`,
        width: `${field.offsetWidth}px`,
        height: `${field.offsetHeight}px`,
        margin: '0',
        pointerEvents: 'none'
    });
    field.after(standIn);

    return standIn;
}

/**
 * Hides `field` behind a stand-in, either parked far above the page or made
 * transparent in place, until the returned release runs or the field blurs.
 * Release puts the caret back at the end, so iOS redraws it.
 */
function holdBehindStandIn(field: HTMLInputElement, hide: 'park' | 'veil') {
    const standIn = createStandIn(field);
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        field.removeEventListener('blur', release);
        field.style.removeProperty('translate');
        field.style.removeProperty('opacity');
        standIn.remove();
        if (held?.field === field) held = null;
        if (document.activeElement !== field) return;
        const end = field.value.length;

        field.setSelectionRange(end, end);
    };

    if (hide === 'park') field.style.translate = `0 -${PARK_OFFSET_PX}px`;
    else field.style.opacity = '0';
    held = { field, standIn };
    field.addEventListener('blur', release);

    return release;
}

/**
 * Parks `field` far above the page while the keyboard opens and brings it
 * back once the keyboard has held its size for `KEYBOARD_SETTLE_MS`, when the
 * field blurs, or after `PARK_LIMIT_MS`. iOS reveals a focused field by
 * scrolling the page, once as it focuses (skipped for `preventScroll`) and
 * again whenever the keyboard's frame changes while it is up, which it does as
 * it finishes opening; the second reveal ignores `preventScroll` but skips a
 * caret that is off-screen. Does nothing while the keyboard is already up.
 */
function parkWhileKeyboardOpens(field: HTMLInputElement) {
    const viewport = window.visualViewport;

    if (
        !viewport ||
        held?.field === field ||
        keyboardHeight(viewport) >= KEYBOARD_MIN_PX
    )
        return;
    const release = holdBehindStandIn(field, 'park');
    let settle = 0;
    const holdUntilSettled = () => {
        if (keyboardHeight(viewport) < KEYBOARD_MIN_PX) return;
        window.clearTimeout(settle);
        settle = window.setTimeout(unpark, KEYBOARD_SETTLE_MS);
    };
    const limit = window.setTimeout(() => unpark(), PARK_LIMIT_MS);
    const unpark = () => {
        window.clearTimeout(settle);
        window.clearTimeout(limit);
        viewport.removeEventListener('resize', holdUntilSettled);
        release();
    };

    viewport.addEventListener('resize', holdUntilSettled);
    field.addEventListener('blur', unpark, { once: true });
}

/**
 * Focuses `field` so iOS does not scroll the page to it: with `preventScroll`,
 * marked so `veilNativeFocus` leaves it alone, and, for a touch while the
 * keyboard is still down, parked off-screen while the keyboard opens.
 */
export function focusStill(field: HTMLInputElement, touch: boolean) {
    if (touch) parkWhileKeyboardOpens(field);
    quietFocus = field;
    field.focus({ preventScroll: true });
    quietFocus = null;
}

/**
 * Call from a field's focus handler. A focus that did not come through
 * `focusStill` while the keyboard is up, such as the keyboard's previous and
 * next arrows, cannot ask iOS not to scroll, so the field turns
 * transparent behind a stand-in for `VEIL_MS`: iOS skips revealing a focused
 * field it finds transparent when it decides, and the browser's own reveal
 * still scrolls the list to the field's real place.
 */
export function veilNativeFocus(field: HTMLInputElement) {
    const viewport = window.visualViewport;

    if (
        quietFocus === field ||
        held?.field === field ||
        !viewport ||
        keyboardHeight(viewport) < KEYBOARD_MIN_PX
    )
        return;
    window.setTimeout(holdBehindStandIn(field, 'veil'), VEIL_MS);
}

/**
 * Touch handlers that turn a tap on an unfocused field into a focus iOS does
 * not scroll the page for: the field asks for no scroll and, when the keyboard
 * is still down, is parked off-screen while it opens. iOS otherwise slides the
 * whole page toward the field, dragging the header and Better Buddy with it. A
 * touch that moves past `TAP_SLOP_PX` is a scroll or a swipe and is left alone.
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
        if (document.activeElement !== tap.field) focusStill(tap.field, true);
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
        if (keyboardHeight(viewport) >= KEYBOARD_MIN_PX) return;
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
        const shown = held?.field === field ? held.standIn : field;
        const overlap =
            shown.getBoundingClientRect().bottom +
            FIELD_CLEARANCE_PX +
            CALCULATOR_BAR_PX -
            (viewport.offsetTop + viewport.height);

        if (keyboardHeight(viewport) < KEYBOARD_MIN_PX || overlap <= 0) return;
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
