'use client';

import type { RefObject } from 'react';
import {
    trackDockedSummary,
    type DockedSummaryRange
} from '@/components/ui/docked-summary';
import { mobileMedia, scrollDrivenMotionSupported } from './title-motion';

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
): DockedSummaryRange | null {
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

    return trackDockedSummary({
        measure: () => measureSummaryRange(body, content, header),
        media: mobileMedia,
        observed: [
            content,
            header,
            body.querySelector<HTMLElement>(anchorSelector)
        ],
        progressProperty,
        scrollDriven: scrollDrivenMotionSupported(),
        scroller: body,
        summary
    });
}
