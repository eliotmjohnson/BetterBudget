import {
    useCallback,
    type FocusEvent as ReactFocusEvent,
    type RefCallback,
    type TouchEvent as ReactTouchEvent
} from 'react';
import type { StillField } from './field';
import { holdViewportWhileFocused } from './hold-viewport';
import { fadeAcrossKeyboardSwap } from './keyboard-swap';
import { focusStill } from './park';
import { pinPageWhileFocused } from './pin';
import { revealAboveKeyboard } from './reveal';
import { stillScroller } from './scroller';
import { endStillTap, startStillTap } from './tap';
import { veilNativeFocus } from './veil';

type StillFieldHandlers<T extends StillField> = {
    onFocus?: (event: ReactFocusEvent<T>) => void;
    onTouchStart?: (event: ReactTouchEvent<T>) => void;
    onTouchEnd?: (event: ReactTouchEvent<T>) => void;
};

type StillFieldOptions<T extends StillField> = StillFieldHandlers<T> & {
    enabled?: boolean;
    calculator?: boolean;
    autoFocus?: boolean;
    conceal?: boolean;
    reveal?: boolean;
};

/**
 * Wraps a field's focus and touch handlers so iOS never slides the page to
 * reveal it: a tap focuses it without the page scroll, a focus from the
 * keyboard's arrows is veiled, the page is held still and the screen is not
 * panned under a drag while it has focus, and
 * its nearest `data-still-scroller` container scrolls instead, just far
 * enough to clear the keyboard and, for a `calculator` field, the calculator
 * bar. The caller's own handlers run after that work. With `enabled` false
 * the caller's handlers come back untouched. Everything is a no-op until an
 * on-screen keyboard is up, so desktop focus is unchanged.
 *
 * `autoFocus` replaces React's, whose plain `focus()` lets iOS scroll: the
 * returned `ref` focuses the field still as it mounts. `conceal` false never
 * hides the field behind a stand-in (no parking, no veil), for a field whose
 * box is moved by a transform, such as a navigation-detail title, where a
 * stand-in would land out of place; it still focuses without the page scroll
 * and holds the page still. `reveal` false skips scrolling the container to
 * clear the keyboard, for a field that stays in view by itself.
 */
export function useStillField<T extends StillField>({
    enabled = true,
    calculator = false,
    autoFocus = false,
    conceal = true,
    reveal = true,
    onFocus,
    onTouchStart,
    onTouchEnd
}: StillFieldOptions<T> = {}): StillFieldHandlers<T> & {
    ref: RefCallback<T>;
} {
    const ref = useCallback(
        (field: T | null) => {
            if (field && autoFocus) focusStill(field, conceal);
        },
        [autoFocus, conceal]
    );

    if (!enabled) return { ref, onFocus, onTouchStart, onTouchEnd };

    return {
        ref,
        onTouchStart(event) {
            startStillTap(event);
            onTouchStart?.(event);
        },
        onTouchEnd(event) {
            endStillTap(event, conceal);
            onTouchEnd?.(event);
        },
        onFocus(event) {
            const field = event.currentTarget;

            if (conceal) veilNativeFocus(field);
            fadeAcrossKeyboardSwap(field, event.relatedTarget);
            pinPageWhileFocused(field);
            holdViewportWhileFocused(field);
            if (reveal)
                revealAboveKeyboard(field, stillScroller(field), calculator);
            onFocus?.(event);
        }
    };
}
