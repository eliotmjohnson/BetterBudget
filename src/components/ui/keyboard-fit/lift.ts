'use client';

import { useEffect, type RefObject } from 'react';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';
import { isRunningFiniteAnimation } from '@/components/ui/running-animation';
import { keyboardTransition, type KeyboardMotion } from './motion';
import { sheetBody } from './scroll-settle';

const LIFTED = 'data-keyboard-lift';
const KEYBOARD_TOP = '--sheet-keyboard-top';
const REST_TOP = '--sheet-rest-top';
const NATURAL_HEIGHT = '--sheet-natural-height';
const MODAL_QUERY = '(width >= 760px) and (any-pointer: coarse)';
const SETTLE_MARGIN_MS = 40;

/**
 * Ends `sheet`'s entrance, if it is still running, at its final frame. The
 * entrance animates `transform`, whose `translate(-50%, -50%)` centering iOS
 * resolves against the modal's height once, as the animation starts, and
 * keeps for the rest of it: a modal whose field is focused as it opens, so the
 * lift shrinks it partway through, was drawn about 130 px too high, its header
 * off the top of the screen, until the entrance ended and it snapped down. By
 * the time the keyboard starts rising the entrance's curve is all but done.
 */
function finishEntrance(sheet: HTMLElement) {
    for (const animation of sheet.getAnimations())
        if (isRunningFiniteAnimation(animation)) animation.finish();
}

/**
 * The height `sheet` would take if nothing capped it: its own height, less
 * the part of its body's content the body has to scroll to show.
 */
function naturalHeight(sheet: HTMLElement) {
    const body = sheetBody(sheet);
    const height = sheet.getBoundingClientRect().height;

    return body ? height - body.clientHeight + body.scrollHeight : height;
}

function clearLift(sheet: HTMLElement) {
    sheet.removeAttribute(LIFTED);
    sheet.style.removeProperty(KEYBOARD_TOP);
    sheet.style.removeProperty(REST_TOP);
    sheet.style.removeProperty(NATURAL_HEIGHT);
    sheet.style.removeProperty('transition');
}

/**
 * While a field inside a centered modal sheet (760 px and wider on a touch
 * screen, such as an iPad or an unfolded iPhone Duo) has focus and the
 * on-screen keyboard is up, moves the modal up into the space between the top
 * safe area and the keyboard's top edge, and caps its height to that space so
 * its body scrolls instead of running on behind the keyboard, as an iPad form
 * sheet does. The keyboard's top edge, in layout-viewport pixels, is set as
 * `--sheet-keyboard-top`, and the modal's `top` and `max-height` follow it on
 * the keyboard's own motion. The modal moves up only as far as it must to end
 * 16 px above the keyboard, and never past the top margin a full-height modal
 * rests at, so a tall one keeps its top edge and only shortens; for that CSS
 * also needs where its top rested (`--sheet-rest-top`) and the height its
 * content would take uncapped (`--sheet-natural-height`). Lowering waits one
 * more frame: on the unfolded iPhone Duo the frame that applies the visual
 * viewport's resize as the keyboard closes takes about 110 ms to render, and a
 * lower started inside it was already half done when it first showed, so the
 * modal looked to snap back. Phones use the bottom inset of `useKeyboardFit`
 * instead.
 */
export function useKeyboardLift(
    sheetRef: RefObject<HTMLElement | null>,
    active: boolean
) {
    useEffect(() => {
        const viewport = window.visualViewport;

        if (!active || !viewport) return;
        let frame = 0;
        let settleTimer = 0;
        let lifted: HTMLElement | null = null;
        const move = (
            sheet: HTMLElement,
            keyboardTop: number | null,
            kind: KeyboardMotion
        ) => {
            const motion = keyboardTransition(['top', 'max-height'], kind);

            window.clearTimeout(settleTimer);
            sheet.style.transition = motion.transition;
            if (keyboardTop === null) {
                sheet.removeAttribute(LIFTED);
                lifted = null;
            } else {
                finishEntrance(sheet);
                if (!sheet.style.getPropertyValue(REST_TOP))
                    sheet.style.setProperty(
                        REST_TOP,
                        `${sheet.getBoundingClientRect().top}px`
                    );
                sheet.style.setProperty(
                    NATURAL_HEIGHT,
                    `${naturalHeight(sheet)}px`
                );
                sheet.style.setProperty(KEYBOARD_TOP, `${keyboardTop}px`);
                sheet.toggleAttribute(LIFTED, true);
                lifted = sheet;
            }
            settleTimer = window.setTimeout(() => {
                if (keyboardTop === null) clearLift(sheet);
                else sheet.style.removeProperty('transition');
            }, motion.settle + SETTLE_MARGIN_MS);
        };
        const update = () => {
            const sheet = sheetRef.current;

            if (!sheet || !window.matchMedia(MODAL_QUERY).matches) return;
            const raised =
                isKeyboardUp(viewport) &&
                sheet.contains(document.activeElement);
            const wasLifted = sheet.hasAttribute(LIFTED);

            if (!raised) {
                if (wasLifted)
                    frame = requestAnimationFrame(() =>
                        move(sheet, null, 'lower')
                    );

                return;
            }
            const keyboardTop = viewport.offsetTop + viewport.height;
            const current = Number.parseFloat(
                sheet.style.getPropertyValue(KEYBOARD_TOP)
            );

            if (!wasLifted) move(sheet, keyboardTop, 'raise');
            else if (Math.abs(keyboardTop - current) >= 1)
                move(sheet, keyboardTop, 'adjust');
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };

        viewport.addEventListener('resize', schedule);
        viewport.addEventListener('scroll', schedule);
        document.addEventListener('focusout', schedule);
        document.addEventListener('focusin', schedule);

        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(settleTimer);
            viewport.removeEventListener('resize', schedule);
            viewport.removeEventListener('scroll', schedule);
            document.removeEventListener('focusout', schedule);
            document.removeEventListener('focusin', schedule);
            if (lifted) clearLift(lifted);
        };
    }, [active, sheetRef]);
}
