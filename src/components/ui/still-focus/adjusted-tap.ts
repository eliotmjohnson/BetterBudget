import { isStillField, type StillField } from './field';
import { focusStill } from './park';

const TOUCH_MOUSE_MS = 500;
const conceals = new WeakMap<StillField, boolean>();
let lastTouchEnd = Number.NEGATIVE_INFINITY;
let listening = false;

function rememberTouchEnd(event: TouchEvent) {
    lastTouchEnd = event.timeStamp;
}

/**
 * Takes over the focus of a tap iOS moved onto a still field. A tap that
 * lands just outside a field's box, such as a few pixels below a Budget
 * row's planned amount, never reaches the field's own touch handlers, yet
 * iOS's touch adjustment still sends the mouse events it synthesizes after
 * the tap to that field, and their `mousedown` focuses it natively. That
 * focus could not ask iOS not to scroll, so it was veiled, which hid the
 * caret and the digits typed for the veil's 300 ms. Preventing the
 * `mousedown` keeps that native focus from happening and leaves the click to
 * run, and `focusStill` focuses the field instead, as a tap on the field
 * itself would.
 */
function focusAdjustedTap(event: MouseEvent) {
    const field = event.target;

    if (
        !(field instanceof Element) ||
        !isStillField(field) ||
        document.activeElement === field ||
        event.timeStamp - lastTouchEnd > TOUCH_MOUSE_MS
    )
        return;
    const conceal = conceals.get(field);

    if (conceal === undefined) return;
    event.preventDefault();
    focusStill(field, conceal);
}

/**
 * Lets a tap iOS adjusts onto `field` focus it still
 * (`focusAdjustedTap`), with `conceal` as the field's own taps use it.
 */
export function markStillField(field: StillField, conceal: boolean) {
    conceals.set(field, conceal);
    if (listening) return;
    listening = true;
    document.addEventListener('touchend', rememberTouchEnd, {
        capture: true,
        passive: true
    });
    document.addEventListener('mousedown', focusAdjustedTap, true);
}

/** Leaves taps iOS adjusts onto `field` to its native focus again. */
export function unmarkStillField(field: StillField) {
    conceals.delete(field);
}
