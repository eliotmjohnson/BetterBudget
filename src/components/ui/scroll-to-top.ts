import type { MouseEvent } from 'react';

const headerControls =
    'a, button, input, select, textarea, label, [contenteditable], [role="button"], [role="dialog"]';

/**
 * Scrolls `scroller` back to its top when a header is tapped anywhere that is
 * not one of its controls, the way tapping an iOS status bar does. The app
 * scrolls inside its own containers rather than the page, so the system's
 * status-bar tap has nothing to scroll.
 */
export function scrollToTopOnHeaderTap(
    event: MouseEvent<HTMLElement>,
    scroller: HTMLElement | null
) {
    const control = (event.target as Element).closest(headerControls);

    if (
        !scroller ||
        event.defaultPrevented ||
        (control && event.currentTarget.contains(control))
    )
        return;

    scroller.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth'
    });
}
