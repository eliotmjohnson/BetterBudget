import type { StillField } from './field';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';
import { isQuietFocus } from './park';
import { holdBehindStandIn, isHeld } from './stand-in';

const VEIL_MS = 300;

/**
 * Call from a field's focus handler. A focus that did not come through
 * `focusStill` while the keyboard is up, such as the keyboard's previous and
 * next arrows, cannot ask iOS not to scroll, so the field turns
 * transparent behind a stand-in for `VEIL_MS`: iOS skips revealing a focused
 * field it finds transparent when it decides, and the browser's own reveal
 * still scrolls the list to the field's real place.
 */
export function veilNativeFocus(field: StillField) {
    const viewport = window.visualViewport;

    if (
        isQuietFocus(field) ||
        isHeld(field) ||
        !viewport ||
        !isKeyboardUp(viewport)
    )
        return;
    window.setTimeout(holdBehindStandIn(field, 'veil'), VEIL_MS);
}
