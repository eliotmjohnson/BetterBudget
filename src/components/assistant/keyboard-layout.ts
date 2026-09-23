'use client';

import { useEffect } from 'react';

const KEYBOARD_MIN_PX = 100;
const CHAT_SHEET = '.sheet-content:has([data-buddy-seat])';
const KEYBOARD_MOTION_MS = 520;
const KEYBOARD_MOTION = ['height', 'padding-top', 'bottom']
    .map(
        (property) =>
            `${property} ${KEYBOARD_MOTION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
    )
    .join(', ');
const RAISED = 'data-keyboard-open';
const heightOf = (element: HTMLElement) =>
    element.getBoundingClientRect().height;

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
 * the keyboard motion, re-reading the scroll range each frame because the
 * sheet is shrinking at the same time. Returns a cancel function.
 */
function glideToEnd(body: HTMLElement) {
    const maxScroll = () => body.scrollHeight - body.clientHeight;
    const gap = Math.max(0, maxScroll() - body.scrollTop);
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / KEYBOARD_MOTION_MS);

        body.scrollTop = maxScroll() - gap * (1 - easeOutCubic(progress));
        if (progress < 1) frame = requestAnimationFrame(step);
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
    sheet.style.transition = KEYBOARD_MOTION;
    handle?.style.removeProperty('transition');
    sheet.toggleAttribute(RAISED, raised);
    setHeight(sheet, to);
}

/**
 * While the chat is open and the on-screen keyboard is up, fits the sheet to
 * exactly the visible area. iOS Safari scrolls the page up by the keyboard's
 * height to reveal the composer, which already carries the bottom-anchored
 * sheet up onto the keyboard, so the sheet only shrinks to the visible height,
 * which fills the screen up to its top edge behind the status bar, and drops
 * the installed app's viewport-shortfall offset so it rests on the keyboard
 * rather than below it.
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
            const target = `${Math.round(viewport.height)}px`;

            if (!raised && !wasRaised) return;
            window.clearTimeout(settleTimer);
            if (raised && wasRaised) {
                sheet.style.transition = KEYBOARD_MOTION;
                setHeight(sheet, target);
            } else glide(sheet, raised ? target : null);
            const body = sheet.querySelector<HTMLElement>('.sheet-body');

            if (raised && !wasRaised && body) {
                cancelScroll();
                cancelScroll = glideToEnd(body);
            }
            settleTimer = window.setTimeout(() => {
                sheet.style.removeProperty('transition');
                if (!raised) clearHeight(sheet);
            }, KEYBOARD_MOTION_MS + 40);
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
