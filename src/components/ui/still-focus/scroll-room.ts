import { keyboardFitSettled } from '@/components/ui/keyboard-fit';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';

const LEND_MOTION = 'padding-bottom 360ms cubic-bezier(0.2, 1, 0.45, 1)';
const RETURN_MOTION = {
    transition: 'padding-bottom 230ms cubic-bezier(0.2, 0.05, 0.3, 1) -16ms',
    ms: 214
};

type Loan = { base: number; extra: number; target: number };

const lent = new WeakMap<HTMLElement, Loan>();

function padBy(scroller: HTMLElement, room: Loan) {
    lent.set(scroller, room);
    scroller.style.paddingBottom = `${room.base + room.extra}px`;
}

/**
 * Once a sheet's keyboard inset has finished easing in, drops whatever part
 * of the loan the body no longer needs to reach its furthest scroll target.
 * The loan is sized while the body is still shrinking to make room for the
 * keyboard, so it covers more than the body needs once it has, and the
 * surplus was an empty stretch below the last field that a flick scrolled
 * into.
 */
function trimOnceSettled(scroller: HTMLElement) {
    void keyboardFitSettled(scroller).then(() => {
        const loan = lent.get(scroller);

        if (!loan) return;
        const surplus =
            scroller.scrollHeight - scroller.clientHeight - loan.target;

        if (surplus < 1) return;
        padBy(scroller, { ...loan, extra: Math.max(0, loan.extra - surplus) });
    });
}

/**
 * Whether `scroller` is as tall as its content, as a sheet body is while its
 * sheet sizes to fit, so padding its end makes it, and the sheet, taller
 * rather than giving it room to scroll.
 */
function sizesToContent(scroller: HTMLElement) {
    return scroller.scrollHeight - scroller.clientHeight <= 1;
}

/**
 * Takes the loan back on the keyboard's closing motion, as a transition of
 * the container's bottom padding. A list scrolled into the loan is then held
 * at its end as the end eases in, so it follows the keyboard down and lands
 * on its real end in one motion. In a container that sizes to its content
 * the loan is height, and the container eases shorter with it instead.
 * Dropping the loan at once, after the keyboard had closed, snapped Edit
 * category and the income source sheet shorter; gliding the list to an
 * estimated end first was cancelled by the list's own lengthening as the
 * sheet's inset eased out, which left it 16 pt short in the Add transaction
 * note (measured in the Simulator), and a second glide half a second later
 * finished the move.
 */
function easeRoomBack(scroller: HTMLElement) {
    lent.delete(scroller);
    scroller.style.transition = RETURN_MOTION.transition;
    scroller.style.removeProperty('padding-bottom');
    window.setTimeout(() => {
        if (!lent.has(scroller)) scroller.style.removeProperty('transition');
    }, RETURN_MOTION.ms);
}

/**
 * Pads the end of `scroller` so it can scroll `distance` further, for rows
 * near the end of the list that could otherwise never clear the keyboard, and
 * takes the padding back once the keyboard has closed. The loan is sized for
 * the list's current height, since a smooth scroll is clamped to the room
 * there is when it starts, and trimmed to what the body needs once a sheet's
 * inset has settled (`trimOnceSettled`). When the keyboard closes, on the
 * frame after the viewport resize, the loan eases back out on the keyboard's
 * closing motion (`easeRoomBack`). In a container that sizes to its content,
 * such as the body of a sheet below its `max-height`, the loan is height
 * rather than scroll room, so it also eases in on the keyboard's rising
 * motion.
 * The loan is added to the stylesheet's own bottom padding, read when the
 * first loan is made, rather than replacing it.
 */
export function lendScrollRoom(scroller: HTMLElement, distance: number) {
    const viewport = window.visualViewport;
    const current = lent.get(scroller);
    const room =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;

    if (!viewport || distance <= room) return;
    if (sizesToContent(scroller)) scroller.style.transition = LEND_MOTION;
    padBy(scroller, {
        base:
            current?.base ??
            Number.parseFloat(getComputedStyle(scroller).paddingBottom),
        extra: (current?.extra ?? 0) + distance - room,
        target: Math.max(current?.target ?? 0, scroller.scrollTop + distance)
    });
    trimOnceSettled(scroller);
    if (current) return;
    let frame = 0;
    const reclaim = () => {
        if (isKeyboardUp(viewport)) return;
        viewport.removeEventListener('resize', scheduleReclaim);
        easeRoomBack(scroller);
    };
    const scheduleReclaim = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(reclaim);
    };

    viewport.addEventListener('resize', scheduleReclaim);
}
