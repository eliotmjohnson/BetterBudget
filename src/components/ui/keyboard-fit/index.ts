'use client';

import { useEffect, type RefObject } from 'react';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';
import { FITTED, INSET, insetInHeight, sheetGrowth } from './pending';
import { settleBodyScroll, sheetBody } from './scroll-settle';
import { clearShield, moveShield } from './shield';

const MOBILE_QUERY = '(width < 760px)';
const SETTLE_MARGIN_MS = 40;
const SWITCH_HOLD_MS = 600;
const RAISE_MOTION = {
    ms: 360,
    delay: 0,
    curve: 'cubic-bezier(0.2, 1, 0.45, 1)'
};
const LOWER_MOTION = {
    ms: 230,
    delay: -16,
    curve: 'cubic-bezier(0.2, 0.05, 0.3, 1)'
};
const GROW_MOTION = {
    ms: 440,
    delay: 0,
    curve: 'cubic-bezier(0.2, 1, 0.45, 1)'
};
const ADJUST_MOTION = {
    ms: 100,
    delay: 0,
    curve: 'cubic-bezier(0.2, 1, 0.45, 1)'
};
const MOTIONS = {
    raise: RAISE_MOTION,
    grow: GROW_MOTION,
    lower: LOWER_MOTION,
    adjust: ADJUST_MOTION
};

/**
 * The inset's transition, fitted frame by frame to a recording of the iOS
 * keyboard, which rises on a steep ease-out and lowers on a quicker
 * ease-in-out. It starts in the frame after the keyboard does, so lowering
 * starts 16 ms into its curve to keep up: started a frame late on top of
 * that, it trailed the keyboard by up to about 100 pt, a white band above the
 * closing keyboard. Rising needs no such head start, because content the
 * inset has not yet cleared from under the translucent keyboard is covered by
 * the sheet's shield (`shield.ts`), which follows the keyboard's edge itself.
 * A change
 * while the keyboard stays up, such as the suggestions row iOS adds a moment
 * after the keyboard's first size, appears at once, so it follows in 100 ms.
 * A sheet that grows to make room, rather than shrinking its body, moves as a
 * whole: it rises on the same curve from the frame after the keyboard over
 * 440 ms, slightly behind the keyboard. One that reaches its `max-height`
 * partway grows by only what it can on that curve, then takes the rest of
 * the inset from its body behind the keyboard: easing the whole inset made
 * its top edge rise fast and stop dead at the cap. Lowering mirrors it: the
 * part of the inset that only shortens the body is dropped at once, behind
 * the shield, and only the part that lowers the sheet's top eases out, so the
 * top starts down with the keyboard; easing the whole inset held Edit
 * category's top still for about 85 ms, a white band above the closing
 * keyboard. A sheet whose height the inset does not change at all, such as
 * the tall Add transaction sheet, eases its whole inset: its body then
 * lengthens with the keyboard, and a list scrolled to its end follows it down
 * smoothly, where dropping the inset at once and shifting the content back
 * showed a blank frame, as iOS applies the scroll a frame apart from the
 * shift.
 */
function insetMotion(kind: keyof typeof MOTIONS) {
    const { ms, delay, curve } = MOTIONS[kind];

    return {
        transition: `padding-bottom ${ms}ms ${curve} ${delay}ms`,
        settle: Math.max(0, ms + delay)
    };
}

/**
 * How far the keyboard covers `sheet`, from the sheet's bottom edge to the
 * keyboard's top edge in layout-viewport pixels. It is measured rather than
 * taken as the keyboard's height, so a layout viewport that iOS has already
 * moved to meet the keyboard covers less, or nothing.
 */
function keyboardCover(sheet: HTMLElement, viewport: VisualViewport) {
    return Math.max(
        0,
        sheet.getBoundingClientRect().bottom -
            (viewport.offsetTop + viewport.height)
    );
}

function clearFit(sheet: HTMLElement) {
    sheet.removeAttribute(FITTED);
    sheet.style.removeProperty('transition');
    sheet.style.removeProperty(INSET);
    clearShield(sheet);
}

/**
 * While a field inside a mobile sheet has focus and the on-screen keyboard is
 * up, pads the sheet's bottom by however far the keyboard covers it
 * (`--sheet-keyboard-inset`). The sheet itself never moves: a content-sized
 * sheet grows taller by the inset, up to its own height cap, so its content
 * stays in view above the keyboard, and a sheet already at its cap keeps its
 * height while its body, the scroll container a still-focused field scrolls
 * to clear the keyboard, ends at the keyboard's top edge. Still focus holds
 * the page still, so iOS no longer carries the sheet up itself. The inset
 * follows the keyboard as it comes up, including a suggestions row iOS adds a
 * moment after its first size, but is held for `SWITCH_HOLD_MS` after focus
 * moves between the sheet's fields: moving to a field with a shorter or
 * taller keyboard, such as the number pad, scrolls the body instead of
 * resizing the sheet. When the keyboard closes or
 * focus leaves the sheet, the inset eases back to zero. It re-checks on the
 * visual viewport's `scroll` as well as `resize`, because iOS moves the layout
 * viewport to meet the keyboard as a scroll of the visual viewport. A drag in
 * progress is left alone.
 */
export function useKeyboardFit(
    sheetRef: RefObject<HTMLElement | null>,
    active: boolean
) {
    useEffect(() => {
        const viewport = window.visualViewport;

        if (!active || !viewport) return;
        let settleTimer = 0;
        let frame = 0;
        let fitted: HTMLElement | null = null;
        let switchedAt = -Infinity;
        const noteSwitch = (event: FocusEvent) => {
            const sheet = sheetRef.current;

            if (
                sheet?.hasAttribute(FITTED) &&
                event.target instanceof Node &&
                sheet.contains(event.target)
            )
                switchedAt = performance.now();
        };
        let staged = false;
        const apply = (
            sheet: HTMLElement,
            inset: number,
            kind: keyof typeof MOTIONS,
            then?: () => void
        ) => {
            const motion = insetMotion(kind);

            window.clearTimeout(settleTimer);
            fitted = sheet;
            sheet.style.transition = motion.transition;
            sheet.style.setProperty(INSET, `${inset}px`);
            settleTimer = window.setTimeout(() => {
                if (then) then();
                else if (kind === 'lower') clearFit(sheet);
                else sheet.style.removeProperty('transition');
            }, motion.settle + SETTLE_MARGIN_MS);
        };
        const raise = (sheet: HTMLElement, inset: number) => {
            const growth = sheetGrowth(sheet, inset);
            const padding = Number.parseFloat(
                getComputedStyle(sheet).paddingBottom
            );

            sheet.toggleAttribute(FITTED, true);
            moveShield(sheet, inset, 'raise');
            if (growth < 1) apply(sheet, inset, 'raise');
            else if (padding + growth >= inset - 1) apply(sheet, inset, 'grow');
            else {
                staged = true;
                apply(sheet, padding + growth, 'grow', () => {
                    staged = false;
                    apply(sheet, keyboardCover(sheet, viewport), 'adjust');
                });
            }
        };
        const lower = (sheet: HTMLElement) => {
            const scrolled = sheetBody(sheet)?.scrollTop ?? 0;
            const inHeight = insetInHeight(sheet);

            staged = false;
            sheet.toggleAttribute(FITTED, false);
            moveShield(sheet, 0, 'lower');
            if (inHeight < 1) {
                apply(sheet, 0, 'lower');

                return;
            }
            sheet.style.transition = 'none';
            sheet.style.setProperty(INSET, `${inHeight}px`);
            void getComputedStyle(sheet).paddingBottom;
            apply(sheet, 0, 'lower');
            settleBodyScroll(sheet, scrolled);
        };
        const update = () => {
            const sheet = sheetRef.current;

            if (
                !sheet ||
                sheet.dataset.dragging === 'true' ||
                !window.matchMedia(MOBILE_QUERY).matches
            )
                return;
            const raised =
                isKeyboardUp(viewport) &&
                sheet.contains(document.activeElement);
            const wasRaised = sheet.hasAttribute(FITTED);

            if (!raised) {
                if (wasRaised) lower(sheet);

                return;
            }
            const inset = keyboardCover(sheet, viewport);

            if (!wasRaised) raise(sheet, inset);
            else if (
                !staged &&
                performance.now() - switchedAt >= SWITCH_HOLD_MS &&
                Math.abs(
                    inset -
                        Number.parseFloat(sheet.style.getPropertyValue(INSET))
                ) >= 1
            ) {
                moveShield(sheet, inset, 'adjust');
                apply(sheet, inset, 'adjust');
            }
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };

        viewport.addEventListener('resize', schedule);
        viewport.addEventListener('scroll', schedule);
        document.addEventListener('focusout', schedule);
        document.addEventListener('focusin', noteSwitch);

        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(settleTimer);
            viewport.removeEventListener('resize', schedule);
            viewport.removeEventListener('scroll', schedule);
            document.removeEventListener('focusout', schedule);
            document.removeEventListener('focusin', noteSwitch);
            if (fitted) clearFit(fitted);
        };
    }, [active, sheetRef]);
}

export {
    isKeyboardFitMotion,
    keyboardFitSettled,
    pendingSheetRise,
    settledClientHeight
} from './pending';
