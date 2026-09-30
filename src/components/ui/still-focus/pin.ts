/**
 * Holds the page at the top while `field` has focus. After each edit the
 * browser scrolls the page, not just the list, to keep the caret in view, and
 * nothing can ask it not to; putting the page back from the `scroll` event
 * lands before that frame is painted, so the page does not visibly move.
 */
export function pinPageWhileFocused(field: HTMLElement) {
    const pin = () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const stop = () => {
        window.removeEventListener('scroll', pin);
        field.removeEventListener('blur', stop);
    };

    window.addEventListener('scroll', pin);
    field.addEventListener('blur', stop);
}
