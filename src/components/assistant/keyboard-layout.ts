'use client';

import { useEffect } from 'react';

const KEYBOARD_MIN_PX = 100;
const CHAT_SHEET = '.sheet-content:has([data-buddy-seat])';
const KEYBOARD_MOTION_MS = 520;
const RAISE_DELAY_MS = 60;
const PIN_TAIL_MS = 80;
const keyboardMotion = (raised: boolean) =>
    ['height', 'box-shadow']
        .map(
            (property) =>
                `${property} ${KEYBOARD_MOTION_MS}ms cubic-bezier(0.32, 0.72, 0, 1) ${raised ? RAISE_DELAY_MS : 0}ms`
        )
        .join(', ');
const RAISED = 'data-keyboard-open';
const heightOf = (element: HTMLElement) =>
    element.getBoundingClientRect().height;
const belowStatusBar = (visibleHeight: number) =>
    `calc(${visibleHeight}px - env(safe-area-inset-top) + var(--assistant-status-overlap))`;

function setHeight(sheet: HTMLElement, height: string) {
    sheet.style.height = height;
    sheet.style.maxHeight = 'none';
}

function clearHeight(sheet: HTMLElement) {
    sheet.style.removeProperty('height');
    sheet.style.removeProperty('max-height');
}

function chatSheet() {
    const sheet = document.querySelector<HTMLElement>(CHAT_SHEET);

    return sheet &&
        sheet.dataset.dragging !== 'true' &&
        window.matchMedia('(width < 760px)').matches
        ? sheet
        : null;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Eases the thread from its current distance above the end to the end over
 * the keyboard motion, starting with the sheet's delayed shrink and
 * re-reading the scroll range each frame because the sheet is shrinking at
 * the same time. It keeps pinning the end for a few frames after the ease so
 * the last frames of the shrink cannot uncover the latest message. Returns a
 * cancel function.
 */
function glideToEnd(body: HTMLElement) {
    const maxScroll = () => body.scrollHeight - body.clientHeight;
    const gap = Math.max(0, maxScroll() - body.scrollTop);
    const startedAt = performance.now() + RAISE_DELAY_MS;
    const endsAt = startedAt + KEYBOARD_MOTION_MS + PIN_TAIL_MS;
    let frame = 0;
    const step = (now: number) => {
        const progress = Math.min(
            1,
            Math.max(0, (now - startedAt) / KEYBOARD_MOTION_MS)
        );

        body.scrollTop = maxScroll() - gap * (1 - easeOutCubic(progress));
        if (now < endsAt) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
}

/**
 * Animates the sheet's height between its resting size and the visible height
 * above the keyboard. CSS cannot transition out of a content-sized height, so
 * both ends are measured and the sheet travels between them in pixels. The
 * handle collapses while raised, so its transition is paused while measuring,
 * or the resting height would be read with the handle mid-collapse.
 */
function glide(sheet: HTMLElement, target: string | null) {
    const from = heightOf(sheet);
    const raised = target !== null;
    const handle = sheet.querySelector<HTMLElement>('.sheet-handle');

    sheet.style.transition = 'none';
    handle?.style.setProperty('transition', 'none');
    sheet.toggleAttribute(RAISED, raised);
    if (target === null) clearHeight(sheet);
    const to = target ?? `${heightOf(sheet)}px`;

    sheet.toggleAttribute(RAISED, !raised);
    setHeight(sheet, `${from}px`);
    void sheet.offsetHeight;
    sheet.style.transition = keyboardMotion(raised);
    handle?.style.removeProperty('transition');
    sheet.toggleAttribute(RAISED, raised);
    setHeight(sheet, to);
}

/**
 * While the chat is open and the on-screen keyboard is up, fits the sheet to
 * exactly the visible area. iOS Safari scrolls the page up by the keyboard's
 * height to reveal the composer, which already carries the bottom-anchored
 * sheet up onto the keyboard, so the sheet only shrinks to the visible height
 * less the status bar (plus a small overlap), which keeps its content just
 * below the clock and Dynamic Island. A solid white shadow fills the status
 * bar above it without moving content.
 */
export function useKeyboardLayout(open: boolean) {
    useEffect(() => {
        const viewport = window.visualViewport;

        if (!open || !viewport) return;
        let fullHeight = viewport.height;
        let settleTimer = 0;
        let cancelScroll = () => {};
        const resetFullHeight = () => {
            fullHeight = viewport.height;
        };
        const update = () => {
            const sheet = chatSheet();

            fullHeight = Math.max(fullHeight, viewport.height);
            if (!sheet) return;
            const raised = fullHeight - viewport.height >= KEYBOARD_MIN_PX;
            const wasRaised = sheet.hasAttribute(RAISED);
            const target = belowStatusBar(Math.round(viewport.height));

            if (!raised && !wasRaised) return;
            window.clearTimeout(settleTimer);
            if (raised && wasRaised) {
                sheet.style.transition = keyboardMotion(true);
                setHeight(sheet, target);
            } else glide(sheet, raised ? target : null);
            const body = sheet.querySelector<HTMLElement>('.sheet-body');

            if (raised && !wasRaised && body) {
                cancelScroll();
                cancelScroll = glideToEnd(body);
            }
            settleTimer = window.setTimeout(
                () => {
                    sheet.style.removeProperty('transition');
                    if (!raised) clearHeight(sheet);
                },
                KEYBOARD_MOTION_MS + RAISE_DELAY_MS + 40
            );
        };

        viewport.addEventListener('resize', update);
        window.addEventListener('orientationchange', resetFullHeight);

        return () => {
            window.clearTimeout(settleTimer);
            cancelScroll();
            viewport.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', resetFullHeight);
        };
    }, [open]);
}
