import { settledClientHeight } from './pending';

const SETTLE_MOTION = {
    transition: 'transform 230ms cubic-bezier(0.2, 0.05, 0.3, 1) -16ms',
    ms: 214
};

export function sheetBody(sheet: HTMLElement) {
    return sheet.querySelector<HTMLElement>(':scope > [data-still-scroller]');
}

/**
 * Called as `sheet`'s inset starts easing out, with `from`, its body's scroll
 * position read before any of the inset was dropped: the drop lengthens the
 * body at once, and the browser has already pulled a deep scroll back by the
 * time it is read again. A body scrolled further than
 * it will be able to once the keyboard is gone, as Edit category's and the
 * income source sheet's are when scrolled down with the keyboard up, was
 * pulled back to its new end in one frame as it grew. So the body is set to
 * the scroll position it will end at, its content is shifted by the
 * difference so nothing moves, and the shift eases away on the keyboard's
 * closing motion, so the content glides back instead.
 */
export function settleBodyScroll(sheet: HTMLElement, from: number) {
    const body = sheetBody(sheet);

    if (!body) return;
    const end = Math.max(
        0,
        Math.min(from, body.scrollHeight - settledClientHeight(body))
    );
    const shift = from - end;

    if (shift < 1) return;
    const content = [...body.children] as HTMLElement[];

    body.scrollTop = end;
    for (const child of content) {
        child.style.transition = 'none';
        child.style.transform = `translateY(${-shift}px)`;
    }
    void body.offsetHeight;
    for (const child of content) {
        child.style.transition = SETTLE_MOTION.transition;
        child.style.transform = 'translateY(0)';
    }
    window.setTimeout(() => {
        for (const child of content) {
            child.style.removeProperty('transition');
            child.style.removeProperty('transform');
        }
    }, SETTLE_MOTION.ms + 40);
}
