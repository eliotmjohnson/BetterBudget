import type { MouseEvent } from 'react';

const headerControls =
    'a, button, input, select, textarea, label, [contenteditable], [role="button"], [role="dialog"]';

/**
 * Scrolls `scroller` back to its top, smoothly unless reduced motion is on.
 * The app scrolls inside its own containers rather than the page, so iOS's
 * status-bar and Dynamic Island tap has nothing to scroll; the header tap and
 * re-tapping the current tab stand in for it.
 */
export function scrollToTop(scroller: HTMLElement | null) {
    scroller?.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth'
    });
}

/**
 * Scrolls `scroller` back to its top when a header is tapped anywhere that is
 * not one of its own controls.
 */
export function scrollToTopOnHeaderTap(
    event: MouseEvent<HTMLElement>,
    scroller: HTMLElement | null
) {
    const control = (event.target as Element).closest(headerControls);

    if (
        event.defaultPrevented ||
        (control && event.currentTarget.contains(control))
    )
        return;

    scrollToTop(scroller);
}
