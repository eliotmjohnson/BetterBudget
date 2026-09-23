'use client';

import type { RefObject } from 'react';
import { mobileMedia, scrollDrivenMotionSupported } from './title-motion';

interface SummaryRange {
    start: number;
    end: number;
}

const shadowReach = 40;
const anchorSelector = '[data-navigation-detail-summary-anchor]';
const progressProperty = '--navigation-detail-summary-progress';
const rangeProperties = [
    '--navigation-detail-compact-header-height',
    '--navigation-detail-summary-start',
    '--navigation-detail-summary-end'
] as const;

export function clearSummaryMotion(content: HTMLElement | null) {
    if (!content) return;

    for (const property of rangeProperties)
        content.style.removeProperty(property);
    content
        .querySelector<HTMLElement>('.navigation-detail-summary')
        ?.style.removeProperty(progressProperty);
}

function measureSummaryRange(
    body: HTMLElement,
    content: HTMLElement,
    header: HTMLElement
): SummaryRange | null {
    const back = header.querySelector<HTMLElement>('.navigation-detail-back');
    const anchor = body.querySelector<HTMLElement>(anchorSelector);

    if (!back || !anchor) return null;

    const compactHeaderHeight = back.offsetTop + back.offsetHeight;
    const anchorRect = anchor.getBoundingClientRect();
    const anchorTop =
        anchorRect.top - body.getBoundingClientRect().top + body.scrollTop;
    const start = Math.max(0, anchorTop - compactHeaderHeight - shadowReach);
    const end = Math.max(
        start + 1,
        anchorTop + anchorRect.height - compactHeaderHeight
    );

    content.style.setProperty(
        '--navigation-detail-compact-header-height',
        `${compactHeaderHeight.toFixed(3)}px`
    );
    content.style.setProperty(
        '--navigation-detail-summary-start',
        `${start.toFixed(3)}px`
    );
    content.style.setProperty(
        '--navigation-detail-summary-end',
        `${end.toFixed(3)}px`
    );

    return { start, end };
}

export interface SummaryMotionContext {
    bodyRef: RefObject<HTMLDivElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    headerRef: RefObject<HTMLElement | null>;
    summaryRef: RefObject<HTMLDivElement | null>;
}

/**
 * Docks the compact summary under the collapsed detail header as its anchor
 * scrolls beneath it. Undefined when the detail chrome is not mounted yet;
 * otherwise the teardown for the effect that called it.
 */
export function setupSummaryMotion(
    ctx: SummaryMotionContext
): (() => void) | undefined {
    const body = ctx.bodyRef.current;
    const content = ctx.contentRef.current;
    const header = ctx.headerRef.current;
    const summary = ctx.summaryRef.current;

    if (!body || !content || !header || !summary) return;

    const mobileQuery = window.matchMedia(mobileMedia);
    const reducedMotionQuery = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    );
    const supportsScrollDrivenMotion = scrollDrivenMotionSupported();
    let range: SummaryRange | null = null;
    let reducedMotionShown = false;
    let animationFrame: number | null = null;
    const measure = () => {
        range = mobileQuery.matches
            ? measureSummaryRange(body, content, header)
            : null;
    };
    const apply = () => {
        animationFrame = null;
        if (!range) {
            summary.style.removeProperty(progressProperty);

            return;
        }
        if (supportsScrollDrivenMotion && !reducedMotionQuery.matches) return;

        const scrollTop = Math.max(0, body.scrollTop);
        let progress = Math.min(
            1,
            Math.max(0, (scrollTop - range.start) / (range.end - range.start))
        );

        if (reducedMotionQuery.matches) {
            if (scrollTop >= range.end) reducedMotionShown = true;
            else if (scrollTop <= range.start) reducedMotionShown = false;
            progress = reducedMotionShown ? 1 : 0;
        }
        summary.style.setProperty(progressProperty, progress.toFixed(4));
    };
    const schedule = () => {
        if (animationFrame !== null) return;
        animationFrame = window.requestAnimationFrame(apply);
    };
    const remeasure = () => {
        measure();
        schedule();
    };
    const resizeObserver = new ResizeObserver(remeasure);
    const anchor = body.querySelector<HTMLElement>(anchorSelector);

    body.addEventListener('scroll', schedule, { passive: true });
    mobileQuery.addEventListener('change', remeasure);
    reducedMotionQuery.addEventListener('change', schedule);
    resizeObserver.observe(content);
    resizeObserver.observe(header);
    if (anchor) resizeObserver.observe(anchor);
    measure();
    apply();

    return () => {
        body.removeEventListener('scroll', schedule);
        mobileQuery.removeEventListener('change', remeasure);
        reducedMotionQuery.removeEventListener('change', schedule);
        resizeObserver.disconnect();
        if (animationFrame !== null)
            window.cancelAnimationFrame(animationFrame);
    };
}
