'use client';

import { useEffect } from 'react';
import {
    clearShield,
    INSET,
    keyboardCover,
    keyboardTransition,
    moveShield
} from '@/components/ui/keyboard-fit';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';

const CHAT_SHEET = '.sheet-content:has([data-buddy-seat])';
const RAISED = 'data-keyboard-open';
const FILLED = 'data-keyboard-full';
const MEASURING = 'data-keyboard-measuring';
const FULL_HEIGHT =
    'calc(var(--viewport-height) - var(--safe-area-top) + var(--assistant-status-overlap))';
const SETTLE_MARGIN_MS = 40;
const RELEASE_SETTLE_MS = 450;
const PIN_TAIL_MS = 80;
const heightOf = (element: HTMLElement) =>
    element.getBoundingClientRect().height;

function setHeight(sheet: HTMLElement, height: string) {
    sheet.style.height = height;
    sheet.style.maxHeight = 'none';
}

function clearLayout(sheet: HTMLElement) {
    sheet.removeAttribute(RAISED);
    sheet.removeAttribute(FILLED);
    sheet.style.removeProperty('transition');
    sheet.style.removeProperty('height');
    sheet.style.removeProperty('max-height');
    sheet.style.removeProperty(INSET);
    clearShield(sheet);
}

function chatSheet() {
    const sheet = document.querySelector<HTMLElement>(CHAT_SHEET);

    return sheet &&
        sheet.dataset.dragging !== 'true' &&
        sheet.dataset.settling !== 'true' &&
        sheet.dataset.dismissing !== 'true' &&
        window.matchMedia('(width < 760px)').matches
        ? sheet
        : null;
}

/**
 * The sheet's transition while its height eases on the keyboard's `grow`
 * motion (or `lower`, closing) and its inset on `inset`. Height and shadow
 * are always listed, so retargeting the inset mid-raise never cancels a
 * height transition still running.
 */
function chatMotion(raised: boolean, inset: 'raise' | 'lower' | 'adjust') {
    const height = keyboardTransition(
        ['height', 'box-shadow'],
        raised ? 'grow' : 'lower'
    );
    const padding = keyboardTransition(['padding-bottom'], inset);

    return {
        transition: `${height.transition}, ${padding.transition}`,
        settle: Math.max(height.settle, padding.settle)
    };
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Eases the thread from its current distance above the end to the end over
 * `ms`, re-reading the scroll range each frame because the sheet is resizing
 * at the same time, and keeps pinning the end for a few frames after, so the
 * last frames of the resize cannot uncover the latest message. Returns a
 * cancel function.
 */
function glideToEnd(body: HTMLElement, ms: number) {
    const maxScroll = () => body.scrollHeight - body.clientHeight;
    const gap = Math.max(0, maxScroll() - body.scrollTop);
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - startedAt) / ms));

        body.scrollTop = maxScroll() - gap * (1 - easeOutCubic(progress));
        if (now < startedAt + ms + PIN_TAIL_MS)
            frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
}

/**
 * Moves the sheet between its resting size and its raised one, padding its
 * bottom by `cover`, how far the keyboard covers it, so the composer ends at
 * the keyboard's top edge. Raised, the thread drops the room it reserves
 * while the keyboard is down, and the sheet is as tall as its content plus
 * the cover, up to the full screen below the status bar, which a long
 * conversation fills (`data-keyboard-full`, which
 * squares the corners and fills the status bar). CSS cannot transition out
 * of a content-sized height, so both ends are measured and the sheet travels
 * between them in pixels. Raised, the chat also tightens its spacing (the
 * handle collapses and the gaps around the greeting shrink) on transitions
 * of their own, which `data-keyboard-measuring` pauses while both ends are
 * measured, or a height would be read with them mid-change. Returns how long the motion takes.
 */
function fit(sheet: HTMLElement, raised: boolean, cover: number) {
    const from = heightOf(sheet);
    const inset = sheet.style.getPropertyValue(INSET) || '0px';
    const filled = sheet.hasAttribute(FILLED);
    const motion = chatMotion(raised, raised ? 'raise' : 'lower');

    sheet.style.transition = 'none';
    sheet.toggleAttribute(MEASURING, true);
    sheet.toggleAttribute(RAISED, raised);
    sheet.toggleAttribute(FILLED, false);
    sheet.style.setProperty(INSET, `${cover}px`);
    sheet.style.removeProperty('height');
    sheet.style.maxHeight = raised ? 'none' : '';
    const fitted = heightOf(sheet);
    let to = fitted;
    let fills = false;

    if (raised) {
        sheet.toggleAttribute(FILLED, true);
        setHeight(sheet, FULL_HEIGHT);
        const full = heightOf(sheet);

        fills = fitted >= full - 1;
        to = Math.min(fitted, full);
    }
    sheet.toggleAttribute(RAISED, !raised);
    sheet.toggleAttribute(FILLED, filled);
    sheet.style.setProperty(INSET, inset);
    setHeight(sheet, `${from}px`);
    void sheet.offsetHeight;
    sheet.style.transition = motion.transition;
    sheet.toggleAttribute(MEASURING, false);
    sheet.toggleAttribute(RAISED, raised);
    sheet.toggleAttribute(FILLED, fills);
    sheet.style.setProperty(INSET, `${cover}px`);
    setHeight(sheet, `${to}px`);
    moveShield(sheet, cover, raised ? 'raise' : 'lower');

    return motion.settle;
}

/**
 * While the chat is open and its composer has focus with the on-screen
 * keyboard up, lifts the composer onto the keyboard's top edge by padding
 * the sheet's bottom by however far the keyboard covers it, and sizes the
 * sheet to its messages plus that cover, up to the full screen below the
 * status bar (`fit`). The composer takes focus without the
 * iOS page slide (still focus), so the sheet stays anchored to the bottom of
 * the screen and makes this room itself: it grows on the keyboard's `grow`
 * motion, slightly behind the keyboard, while its inset follows the keyboard,
 * the shared shield covers anything under the keyboard's glass, and the
 * thread stays pinned to its latest message. A later change in the
 * keyboard's size, such as the suggestions row, retargets the inset, and the
 * chat eases back to its resting size on the keyboard's closing motion.
 * Nothing changes while the sheet is dragged, springing back, or swiped
 * away, which closes the keyboard as the sheet leaves, so it re-checks when a
 * finger lifts and again once a spring back has finished
 * (`RELEASE_SETTLE_MS`) for any change it skipped meanwhile.
 */
export function useKeyboardLayout(open: boolean) {
    useEffect(() => {
        const viewport = window.visualViewport;

        if (!open || !viewport) return;
        let settleTimer = 0;
        let frame = 0;
        let cancelScroll = () => {};
        const adjust = (sheet: HTMLElement, cover: number) => {
            const current = Number.parseFloat(
                sheet.style.getPropertyValue(INSET)
            );

            if (Math.abs(cover - current) < 1) return null;
            const motion = chatMotion(true, 'adjust');

            sheet.style.transition = motion.transition;
            sheet.style.setProperty(INSET, `${cover}px`);
            moveShield(sheet, cover, 'adjust');

            return chatMotion(true, 'raise').settle;
        };
        const update = () => {
            const sheet = chatSheet();

            if (!sheet) return;
            const raised =
                isKeyboardUp(viewport) &&
                sheet.contains(document.activeElement);
            const wasRaised = sheet.hasAttribute(RAISED);

            if (!raised && !wasRaised) return;
            const cover = raised ? keyboardCover(sheet, viewport) : 0;
            const settle =
                raised && wasRaised
                    ? adjust(sheet, cover)
                    : fit(sheet, raised, cover);

            if (settle === null) return;
            const body = sheet.querySelector<HTMLElement>('.sheet-body');

            if (raised && !wasRaised && body) {
                cancelScroll();
                cancelScroll = glideToEnd(body, settle);
            }
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => {
                if (raised) sheet.style.removeProperty('transition');
                else clearLayout(sheet);
            }, settle + SETTLE_MARGIN_MS);
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
        document.addEventListener('focusout', schedule);
        document.addEventListener('pointerup', afterRelease);
        document.addEventListener('pointercancel', afterRelease);

        return () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(settleTimer);
            window.clearTimeout(releaseTimer);
            cancelScroll();
            viewport.removeEventListener('resize', schedule);
            document.removeEventListener('focusout', schedule);
            document.removeEventListener('pointerup', afterRelease);
            document.removeEventListener('pointercancel', afterRelease);
            const sheet = document.querySelector<HTMLElement>(CHAT_SHEET);

            if (sheet) clearLayout(sheet);
        };
    }, [open]);
}
