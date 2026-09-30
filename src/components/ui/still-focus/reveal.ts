import type { StillField } from './field';
import { isKeyboardUp } from './keyboard';
import { lendScrollRoom } from './scroll-room';
import { shownField } from './stand-in';

const FIELD_CLEARANCE_PX = 16;
const CALCULATOR_BAR_PX = 56;

/**
 * How far `scroller` must scroll, in total, so that the field after `field`
 * does not have its center under the calculator bar, given that it is already
 * going to scroll `planned`. The keyboard's next arrow skips a field whose
 * center another element covers, and the bar is page content; the keyboard is
 * not, so a field behind the keyboard is still reachable.
 */
function nextFieldOverlap(
    field: HTMLElement,
    scroller: HTMLElement,
    barTop: number,
    planned: number
) {
    const fields = [
        ...scroller.querySelectorAll<HTMLElement>(
            'input:not([inert]), textarea:not([inert])'
        )
    ];
    const next = fields[fields.indexOf(field) + 1];

    if (!next) return 0;
    const box = next.getBoundingClientRect();
    const center = (box.top + box.bottom) / 2 - planned;
    const limit = barTop - FIELD_CLEARANCE_PX;

    return center > limit && center < barTop + CALCULATOR_BAR_PX
        ? planned + center - limit
        : 0;
}

/**
 * Once the on-screen keyboard reports its size, smoothly scrolls `scroller`
 * just far enough that the focused field clears the keyboard and, for a
 * `calculator` field, the calculator bar docked above it, and that the next
 * field's center is not left under the bar, where the keyboard's next arrow
 * would skip it. It measures against the visual viewport, so a field iOS
 * already revealed by panning the page is left where it is. Also checks once
 * on the next frame, for a field focused while the keyboard is already up.
 * Stops listening when the field blurs.
 */
export function revealAboveKeyboard(
    field: StillField,
    scroller: HTMLElement | null,
    calculator: boolean
) {
    const viewport = window.visualViewport;

    if (!viewport || !scroller) return;
    const reveal = () => {
        const shown = shownField(field);
        const barTop =
            viewport.offsetTop +
            viewport.height -
            (calculator ? CALCULATOR_BAR_PX : 0);
        const fieldOverlap = Math.max(
            0,
            shown.getBoundingClientRect().bottom + FIELD_CLEARANCE_PX - barTop
        );
        const overlap = calculator
            ? Math.max(
                  fieldOverlap,
                  nextFieldOverlap(field, scroller, barTop, fieldOverlap)
              )
            : fieldOverlap;

        if (!isKeyboardUp(viewport) || overlap <= 0) return;
        lendScrollRoom(scroller, overlap);
        scroller.scrollBy({ top: overlap, behavior: 'smooth' });
    };
    const stop = () => {
        viewport.removeEventListener('resize', reveal);
        field.removeEventListener('blur', stop);
    };

    viewport.addEventListener('resize', reveal);
    field.addEventListener('blur', stop);
    requestAnimationFrame(reveal);
}
