'use client';

import { useEffect, type RefObject } from 'react';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';
import {
    keyboardCover,
    keyboardTransition,
    type KeyboardMotion
} from './motion';
import { followKeyboard, holdHeight } from './follow';
import { FITTED, INSET, insetInHeight, sheetGrowth } from './pending';
import { settleBodyScroll, sheetBody } from './scroll-settle';
import { clearShield, moveShield, shieldRaised } from './shield';

const MOBILE_QUERY = '(width < 760px)';
const SETTLE_MARGIN_MS = 40;
const RELEASE_SETTLE_MS = 450;
const SWITCH_HOLD_MS = 600;

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
 * after the keyboard's first size, appears at once, so it follows in 100 ms,
 * unless it arrives while the sheet is still rising: then the rise is
 * retargeted on its own motion, since a first check that measured little or
 * no cover left the whole rise to the 100 ms motion, and the sheet snapped up
 * ahead of the keyboard.
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
function insetMotion(kind: KeyboardMotion) {
    return keyboardTransition(['padding-bottom'], kind);
}

function clearFit(sheet: HTMLElement) {
    sheet.removeAttribute(FITTED);
    sheet.style.removeProperty('transition');
    sheet.style.removeProperty(INSET);
    sheet.style.removeProperty('height');
    sheet.style.removeProperty('min-height');
    sheet.style.removeProperty('max-height');
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
 * viewport to meet the keyboard as a scroll of the visual viewport. A sheet
 * being dragged, springing back, or swiped away keeps its inset: changing it
 * mid-spring would replace the spring's transition, and a sheet swiped away
 * leaves with its inset while the keyboard closes. Its shield, a fixed layer
 * that does not move with the sheet, still lowers with the keyboard. It re-checks when a
 * finger lifts and again once a spring back has finished
 * (`RELEASE_SETTLE_MS`, past the sheet's 400 ms settle), for any change it
 * skipped meanwhile. With `follow`, the inset moves in one motion on the
 * keyboard's own curve however much of it the sheet grows by, and the
 * sheet's height eases to where it ends on a motion of its own
 * (`followKeyboard`), for a sheet whose focused field rides on the keyboard,
 * such as the Better Buddy composer stuck to the bottom of its body: growing
 * first and shortening the body afterwards left the composer behind the
 * keyboard until the growth had finished.
 */
export function useKeyboardFit(
    sheetRef: RefObject<HTMLElement | null>,
    active: boolean,
    follow: boolean
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
        let risingUntil = 0;
        const apply = (
            sheet: HTMLElement,
            inset: number,
            kind: KeyboardMotion,
            then?: () => void
        ) => {
            let settle: number;

            window.clearTimeout(settleTimer);
            fitted = sheet;
            if (follow && kind !== 'grow')
                settle = followKeyboard(sheet, inset, kind);
            else {
                const motion = insetMotion(kind);

                sheet.style.transition = motion.transition;
                sheet.style.setProperty(INSET, `${inset}px`);
                settle = motion.settle;
            }
            risingUntil =
                kind === 'raise' || kind === 'grow'
                    ? performance.now() + settle
                    : 0;
            settleTimer = window.setTimeout(() => {
                if (then) then();
                else if (kind === 'lower') clearFit(sheet);
                else sheet.style.removeProperty('transition');
            }, settle + SETTLE_MARGIN_MS);
        };
        const raise = (sheet: HTMLElement, inset: number) => {
            const growth = sheetGrowth(sheet, inset);
            const padding = Number.parseFloat(
                getComputedStyle(sheet).paddingBottom
            );

            if (follow) holdHeight(sheet);
            sheet.toggleAttribute(FITTED, true);
            moveShield(sheet, inset, 'raise');
            if (follow || growth < 1) apply(sheet, inset, 'raise');
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
            if (follow || inHeight < 1) {
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

            if (!sheet || !window.matchMedia(MOBILE_QUERY).matches) return;
            const raised =
                isKeyboardUp(viewport) &&
                sheet.contains(document.activeElement);

            if (!raised && shieldRaised(sheet)) moveShield(sheet, 0, 'lower');
            if (
                sheet.dataset.dragging === 'true' ||
                sheet.dataset.settling === 'true' ||
                sheet.dataset.dismissing === 'true'
            )
                return;
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
                if (performance.now() < risingUntil) raise(sheet, inset);
                else {
                    moveShield(sheet, inset, 'adjust');
                    apply(sheet, inset, 'adjust');
                }
            }
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };
        let releaseTimer = 0;
        const afterRelease = () => {
            schedule();
            window.clearTimeout(releaseTimer);
            releaseTimer = window.setTimeout(schedule, RELEASE_SETTLE_MS);
        };

        viewport.addEventListener('resize', schedule);
        viewport.addEventListener('scroll', schedule);
        document.addEventListener('focusout', schedule);
        document.addEventListener('focusin', noteSwitch);
        document.addEventListener('pointerup', afterRelease);
        document.addEventListener('pointercancel', afterRelease);

        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(settleTimer);
            window.clearTimeout(releaseTimer);
            viewport.removeEventListener('resize', schedule);
            viewport.removeEventListener('scroll', schedule);
            document.removeEventListener('focusout', schedule);
            document.removeEventListener('focusin', noteSwitch);
            document.removeEventListener('pointerup', afterRelease);
            document.removeEventListener('pointercancel', afterRelease);
            if (fitted) clearFit(fitted);
        };
    }, [active, follow, sheetRef]);
}

export {
    inSetHeightSheet,
    isKeyboardFitMotion,
    keyboardFitSettled,
    pendingSheetRise,
    settledClientHeight
} from './pending';
