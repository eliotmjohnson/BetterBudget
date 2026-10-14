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
 * Press handlers for a control that must act on a tap without taking focus
 * from the field being typed in, so the on-screen keyboard stays up:
 * `pointerdown` is prevented, and a touch acts on `touchend` with its default
 * prevented, so iOS synthesizes no focus-moving click. A touch that travels
 * more than `TAP_SLOP_PX` is a drag, such as a scroll that began on the
 * control, and does not act. Mouse and VoiceOver activation are left to the
 * control's own click, which still runs without moving focus from a mouse
 * press.
 */
export const focusKeepingTap = (action: () => void) => ({
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
    }
});

/**
 * `focusKeepingTap` for a control with no click behavior of its own, such as
 * a plain button: `onClick` runs the same action for VoiceOver and mouse
 * activation.
 */
export const focusKeepingPress = (action: () => void) => ({
    ...focusKeepingTap(action),
    onClick: action
});
