import { isKeyboardUp } from './keyboard';

const RECLAIM_MS = 450;
const lent = new WeakMap<HTMLElement, { base: number; extra: number }>();

function padBy(scroller: HTMLElement, room: { base: number; extra: number }) {
    lent.set(scroller, room);
    scroller.style.paddingBottom = `${room.base + room.extra}px`;
}

function returnRoom(scroller: HTMLElement) {
    lent.delete(scroller);
    scroller.style.removeProperty('padding-bottom');
}

/**
 * Pads the end of `scroller` so it can scroll `distance` further, for rows
 * near the end of the list that could otherwise never clear the keyboard, and
 * takes the padding back once the keyboard has closed: when the list is
 * scrolled into the padding, it first glides back to its real end, so
 * dropping the padding does not jump it. The loan is added to the
 * stylesheet's own bottom padding, read when the first loan is made, rather
 * than replacing it.
 */
export function lendScrollRoom(scroller: HTMLElement, distance: number) {
    const viewport = window.visualViewport;
    const current = lent.get(scroller);
    const room =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;

    if (!viewport || distance <= room) return;
    padBy(scroller, {
        base:
            current?.base ??
            Number.parseFloat(getComputedStyle(scroller).paddingBottom),
        extra: (current?.extra ?? 0) + distance - room
    });
    if (current) return;
    const reclaim = () => {
        if (isKeyboardUp(viewport)) return;
        viewport.removeEventListener('resize', reclaim);
        const extra = lent.get(scroller)?.extra ?? 0;
        const end = scroller.scrollHeight - scroller.clientHeight - extra;

        if (scroller.scrollTop <= end) {
            returnRoom(scroller);

            return;
        }
        scroller.scrollTo({ top: end, behavior: 'smooth' });
        window.setTimeout(() => returnRoom(scroller), RECLAIM_MS);
    };

    viewport.addEventListener('resize', reclaim);
}
