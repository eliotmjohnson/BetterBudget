'use client';

export type MonthSlideDirection = 'forward' | 'back';

const SLIDE_CLEANUP_MS = 1600;

type MonthSlideCapture = {
    content: HTMLElement;
    sourceMonthKey: string;
    top: number;
    left: number;
    width: number;
    height: number;
    scrollTop: number;
};

let capture: MonthSlideCapture | null = null;
let activeLayer: HTMLElement | null = null;

export function captureMonthSlide(sourceMonthKey: string) {
    const content = document.querySelector('.app-content');

    if (!(content instanceof HTMLElement)) return;

    const rect = content.getBoundingClientRect();
    const clone = content.cloneNode(true) as HTMLElement;

    clone.className = 'page-slide-out';
    clone.removeAttribute('style');
    capture = {
        content: clone,
        sourceMonthKey,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        scrollTop: content.scrollTop
    };
}

export function discardMonthSlide() {
    capture = null;
}

export function hasMonthSlideCapture(sourceMonthKey: string) {
    return capture?.sourceMonthKey === sourceMonthKey;
}

export function playMonthSlide(
    direction: MonthSlideDirection,
    sourceMonthKey: string
) {
    const pending = capture;

    capture = null;
    if (!pending || pending.sourceMonthKey !== sourceMonthKey) return;
    activeLayer?.remove();

    const layer = document.createElement('div');
    let cleanupTimer = 0;
    const finish = () => {
        window.clearTimeout(cleanupTimer);
        if (activeLayer === layer) activeLayer = null;
        layer.remove();
    };

    layer.className = `page-slide-layer page-slide-layer--${direction}`;
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('inert', '');
    layer.style.top = `${pending.top}px`;
    layer.style.left = `${pending.left}px`;
    layer.style.width = `${pending.width}px`;
    layer.style.height = `${pending.height}px`;
    layer.append(pending.content);
    layer.addEventListener('animationend', (event) => {
        if (event.target === pending.content) finish();
    });
    document.body.append(layer);

    // scrollTop only sticks once the clone is part of the document.
    pending.content.scrollTop = pending.scrollTop;
    activeLayer = layer;
    cleanupTimer = window.setTimeout(finish, SLIDE_CLEANUP_MS);
}
