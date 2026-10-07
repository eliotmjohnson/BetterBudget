import type { StillField } from './field';
import {
    isKeyboardFitMotion,
    pendingSheetRise,
    settledClientHeight
} from '@/components/ui/keyboard-fit';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';
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
 * How far `field`'s top edge sits above the part of `scroller` it can be
 * seen in, plus the usual clearance: the scroller's own top edge, below a
 * sheet's title, moved down by its `scroll-padding-top`, which each scroller
 * sets to whatever covers its top, such as the page's pull band or a pushed
 * detail's header.
 */
function topOverlap(field: HTMLElement, scroller: HTMLElement) {
    const covered =
        Number.parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;

    return Math.max(
        0,
        scroller.getBoundingClientRect().top +
            covered +
            FIELD_CLEARANCE_PX -
            field.getBoundingClientRect().top
    );
}

/**
 * Where `scroller`'s visible part will end once a sheet around it has
 * finished fitting the keyboard, on the same footing as the field, which
 * rises with the sheet: a sheet's footer, such as the allocation picker's
 * **Done** button, stays above the keyboard and ends the body there, above the line
 * the keyboard and calculator bar draw.
 */
function settledBottom(scroller: HTMLElement) {
    return (
        scroller.getBoundingClientRect().top +
        scroller.clientTop +
        settledClientHeight(scroller)
    );
}

/**
 * The transitions running on `element` or any ancestor, such as a pushed
 * detail sliding in, since a field measured while one runs would be scrolled
 * for where it was, not where it ends. A sheet's keyboard inset is left out:
 * where it ends is known (`pendingSheetRise`), so the reveal runs alongside
 * it, as it does alongside the keyboard, rather than after it.
 */
function movingAncestors(element: HTMLElement) {
    const moving: Promise<unknown>[] = [];

    for (
        let node: HTMLElement | null = element;
        node;
        node = node.parentElement
    )
        for (const animation of node.getAnimations())
            if (
                animation instanceof CSSTransition &&
                !isKeyboardFitMotion(animation)
            )
                moving.push(animation.finished);

    return moving;
}

/**
 * Once the on-screen keyboard reports its size, smoothly scrolls `scroller`
 * just far enough that the focused field clears the keyboard and, for a
 * `calculator` field, the calculator bar docked above it, or the end of the
 * scroller itself where that comes first, such as above a sheet's footer, and
 * that the next
 * field's center is not left under the bar, where the keyboard's next arrow
 * would skip it. A field partly hidden at the top instead, such as under a
 * sheet's title, is scrolled down just clear of the scroller's covered top
 * (`topOverlap`). It measures against the visual viewport, so a field iOS
 * already revealed by panning the page is left where it is. Also checks once
 * on the next frame, for a field focused while the keyboard is already up.
 * While the scroller or an ancestor is still transitioning it waits for that
 * to finish before measuring, except for a sheet growing its keyboard inset,
 * which it measures from where the field will end up once the sheet has
 * risen, by lowering the line it must clear by the rise still to come: waiting
 * for the inset held the Add transaction reveal back until the keyboard had
 * finished opening. It measures on the animation frame after
 * each viewport resize, never in
 * the event: iOS reports the keyboard's full size the moment a field takes
 * focus, and a sheet only makes room for it in that next frame, so a reveal
 * measured in the event found the field deep behind the keyboard and padded
 * the sheet's body by that much at once, a one-frame jump that the sheet's
 * own inset then added to. Stops listening when the field blurs.
 */
export function revealAboveKeyboard(
    field: StillField,
    scroller: HTMLElement | null,
    calculator: boolean
) {
    const viewport = window.visualViewport;

    if (!viewport || !scroller) return;
    let waiting = false;
    const reveal = () => {
        if (waiting) return;
        const moving = movingAncestors(scroller);

        if (moving.length > 0) {
            waiting = true;
            void Promise.allSettled(moving).then(() => {
                waiting = false;
                if (document.activeElement === field) reveal();
            });

            return;
        }
        const shown = shownField(field);
        const rise = pendingSheetRise(scroller);
        const barTop =
            viewport.offsetTop +
            viewport.height -
            (calculator ? CALCULATOR_BAR_PX : 0) +
            rise;
        const fieldOverlap = Math.max(
            0,
            shown.getBoundingClientRect().bottom +
                FIELD_CLEARANCE_PX -
                Math.min(barTop, settledBottom(scroller))
        );
        const overlap = calculator
            ? Math.max(
                  fieldOverlap,
                  nextFieldOverlap(field, scroller, barTop, fieldOverlap)
              )
            : fieldOverlap;

        if (!isKeyboardUp(viewport)) return;
        if (overlap > 0) {
            lendScrollRoom(scroller, overlap);
            scroller.scrollBy({ top: overlap, behavior: 'smooth' });

            return;
        }
        const hidden = topOverlap(shown, scroller);

        if (hidden > 0) scroller.scrollBy({ top: -hidden, behavior: 'smooth' });
    };
    let frame = 0;
    const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(reveal);
    };
    const stop = () => {
        cancelAnimationFrame(frame);
        viewport.removeEventListener('resize', schedule);
        field.removeEventListener('blur', stop);
    };

    viewport.addEventListener('resize', schedule);
    field.addEventListener('blur', stop);
    schedule();
}
