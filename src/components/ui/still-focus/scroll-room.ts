import { isKeyboardUp } from './keyboard';

const RECLAIM_MS = 450;

/**
 * Pads the end of `scroller` so it can scroll `distance` further, for rows
 * near the end of the list that could otherwise never clear the keyboard, and
 * takes the padding back once the keyboard has closed: when the list is
 * scrolled into the padding, it first glides back to its real end, so
 * dropping the padding does not jump it.
 */
export function lendScrollRoom(scroller: HTMLElement, distance: number) {
    const viewport = window.visualViewport;
    const lent = Number.parseInt(scroller.style.paddingBottom, 10) || 0;
    const room =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;

    if (!viewport || distance <= room) return;
    scroller.style.paddingBottom = `${lent + distance - room}px`;
    if (lent > 0) return;
    const reclaim = () => {
        if (isKeyboardUp(viewport)) return;
        viewport.removeEventListener('resize', reclaim);
        const lentNow = Number.parseInt(scroller.style.paddingBottom, 10) || 0;
        const end = scroller.scrollHeight - scroller.clientHeight - lentNow;

        if (scroller.scrollTop <= end) {
            scroller.style.removeProperty('padding-bottom');

            return;
        }
        scroller.scrollTo({ top: end, behavior: 'smooth' });
        window.setTimeout(
            () => scroller.style.removeProperty('padding-bottom'),
            RECLAIM_MS
        );
    };

    viewport.addEventListener('resize', reclaim);
}
