/**
 * The container a still-focused field scrolls to clear the keyboard: its
 * nearest ancestor marked `data-still-scroller`.
 */
export function stillScroller(field: HTMLElement) {
    return field.closest<HTMLElement>('[data-still-scroller]');
}
