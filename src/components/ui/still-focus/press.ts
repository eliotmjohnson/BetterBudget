import type { TouchEvent } from 'react';

const TAP_SLOP_PX = 10;
const touchStarts = new WeakMap<EventTarget, { x: number; y: number }>();

function movedPastSlop(event: TouchEvent<HTMLElement>) {
    const start = touchStarts.get(event.currentTarget);
    const touch = event.changedTouches[0];

    if (!start || !touch) return false;

    return (
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) >
        TAP_SLOP_PX
    );
}

/**
 * Press handlers for a control that must act without taking focus from the
 * field being typed in, so the on-screen keyboard stays up: `pointerdown` is
 * prevented, a touch acts on `touchend` with its default prevented so iOS
 * synthesizes no focus-moving click, and `onClick` covers VoiceOver and mouse
 * activation. A touch that travels more than `TAP_SLOP_PX` is a drag, such as
 * a scroll that began on the control, and does not act.
 */
export const focusKeepingPress = (action: () => void) => ({
    onPointerDown: (event: { preventDefault: () => void }) =>
        event.preventDefault(),
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
        const touch = event.touches[0];

        if (touch)
            touchStarts.set(event.currentTarget, {
                x: touch.clientX,
                y: touch.clientY
            });
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
        event.preventDefault();
        if (!movedPastSlop(event)) action();
    },
    onClick: action
});
