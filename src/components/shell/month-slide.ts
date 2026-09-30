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
    floating: HTMLElement | null;
};

let capture: MonthSlideCapture | null = null;
let activeLayer: HTMLElement | null = null;

/**
 * Copies each `data-scroll-progress` element's current progress onto its
 * clone, because the slide-out layer stops every animation and would drop a
 * scroll-driven value back to its initial one.
 */
function freezeScrollProgress(content: HTMLElement, clone: HTMLElement) {
    const selector = '[data-scroll-progress]';
    const clones = clone.querySelectorAll<HTMLElement>(selector);

    content
        .querySelectorAll<HTMLElement>(selector)
        .forEach((element, index) => {
            const property = element.dataset.scrollProgress;

            if (!property) return;
            clones[index]?.style.setProperty(
                property,
                getComputedStyle(element).getPropertyValue(property)
            );
        });
}

/**
 * Pins each `content-visibility: auto` element of the clone to the height the
 * live one has now; the intrinsic size excludes padding and borders. A fresh clone has no remembered sizes, so its off-screen
 * sections would fall back to their placeholder height and shorten the page.
 */
function freezeIntrinsicSizes(content: HTMLElement, clone: HTMLElement) {
    const live = content.querySelectorAll<HTMLElement>('*');
    const copies = clone.querySelectorAll<HTMLElement>('*');

    live.forEach((element, index) => {
        const style = getComputedStyle(element);

        if (style.contentVisibility !== 'auto') return;

        const frame = [
            style.paddingTop,
            style.paddingBottom,
            style.borderTopWidth,
            style.borderBottomWidth
        ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0);

        copies[index]?.style.setProperty(
            'contain-intrinsic-size',
            `auto ${element.getBoundingClientRect().height - frame}px`
        );
    });
}

/**
 * Copies the page's shown floating add button at its place inside the
 * content area, so the button leaves with the outgoing month.
 */
function cloneFloatingAction(contentRect: DOMRect) {
    const button = document.querySelector<HTMLElement>(
        ".floating-add-button[data-visible='true']"
    );

    if (!button) return null;

    const rect = button.getBoundingClientRect();
    const clone = button.cloneNode(true) as HTMLElement;

    Object.assign(clone.style, {
        position: 'absolute',
        top: `${rect.top - contentRect.top}px`,
        left: `${rect.left - contentRect.left}px`,
        right: 'auto',
        bottom: 'auto'
    });

    return clone;
}

export function captureMonthSlide(sourceMonthKey: string) {
    const content = document.querySelector('.app-content');

    if (!(content instanceof HTMLElement)) return;

    const rect = content.getBoundingClientRect();
    const clone = content.cloneNode(true) as HTMLElement;

    clone.className = 'page-slide-out';
    clone.removeAttribute('style');
    freezeScrollProgress(content, clone);
    freezeIntrinsicSizes(content, clone);
    capture = {
        content: clone,
        sourceMonthKey,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        scrollTop: content.scrollTop,
        floating: cloneFloatingAction(rect)
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
    if (pending.floating) {
        const floatingLayer = document.createElement('div');

        floatingLayer.className = 'page-slide-out page-slide-out--floating';
        floatingLayer.append(pending.floating);
        layer.append(floatingLayer);
    }
    layer.addEventListener('animationend', (event) => {
        if (event.target === pending.content) finish();
    });
    document.body.append(layer);

    pending.content.scrollTop = pending.scrollTop;
    activeLayer = layer;
    cleanupTimer = window.setTimeout(finish, SLIDE_CLEANUP_MS);
}
