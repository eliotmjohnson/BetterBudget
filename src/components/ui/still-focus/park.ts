import type { StillField } from './field';
import { isKeyboardUp } from './keyboard';
import { holdBehindStandIn, isHeld } from './stand-in';

const PARK_OFFSET_PX = 10000;
const KEYBOARD_SETTLE_MS = 150;
const PARK_LIMIT_MS = 1200;
let quietFocus: StillField | null = null;

/** Whether `field` is taking focus through `focusStill` right now. */
export function isQuietFocus(field: StillField) {
    return quietFocus === field;
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
function parkWhileKeyboardOpens(field: StillField) {
    const viewport = window.visualViewport;

    if (!viewport || isHeld(field) || isKeyboardUp(viewport)) return;
    const release = holdBehindStandIn(field, { park: PARK_OFFSET_PX });
    let settle = 0;
    const holdUntilSettled = () => {
        if (!isKeyboardUp(viewport)) return;
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
export function focusStill(field: StillField, touch: boolean) {
    if (touch) parkWhileKeyboardOpens(field);
    quietFocus = field;
    field.focus({ preventScroll: true });
    quietFocus = null;
}
