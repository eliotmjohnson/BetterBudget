import type {
    FocusEvent as ReactFocusEvent,
    TouchEvent as ReactTouchEvent
} from 'react';
import type { StillField } from './field';
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
};

/**
 * Wraps a field's focus and touch handlers so iOS never slides the page to
 * reveal it: a tap focuses it without the page scroll, a focus from the
 * keyboard's arrows is veiled, the page is held still while it has focus, and
 * its nearest `data-still-scroller` container scrolls instead, just far
 * enough to clear the keyboard and, for a `calculator` field, the calculator
 * bar. The caller's own handlers run after that work. With `enabled` false
 * the caller's handlers come back untouched. Everything is a no-op until an
 * on-screen keyboard is up, so desktop focus is unchanged.
 */
export function useStillField<T extends StillField>({
    enabled = true,
    calculator = false,
    onFocus,
    onTouchStart,
    onTouchEnd
}: StillFieldOptions<T> = {}): StillFieldHandlers<T> {
    if (!enabled) return { onFocus, onTouchStart, onTouchEnd };

    return {
        onTouchStart(event) {
            startStillTap(event);
            onTouchStart?.(event);
        },
        onTouchEnd(event) {
            endStillTap(event);
            onTouchEnd?.(event);
        },
        onFocus(event) {
            const field = event.currentTarget;

            veilNativeFocus(field);
            pinPageWhileFocused(field);
            revealAboveKeyboard(field, stillScroller(field), calculator);
            onFocus?.(event);
        }
    };
}
