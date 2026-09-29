'use client';

import type { RefObject } from 'react';
import {
    createTitleEditState,
    startTitleEditTween,
    titleEditTweenProgress,
    type TitleEditState
} from './title-edit';

interface TitleMotionMetrics {
    compactHeaderHeight: number;
    expandedHeaderHeight: number;
    firstLineHeight: number;
    firstLineWidth: number;
    translateX: number;
    restTranslateX: number;
    translateY: number;
}

export const mobileMedia = '(max-width: 759.98px)';
const titleCompactScale = 20 / 46;
const titleTailFadeProgress = 0.5;
const titleRevealProgress = 0.65;
const reducedMotionExpandThreshold = 8;
const headerShadowFadeDistance = 24;

export const scrollDrivenMotionSupported = () =>
    CSS.supports('animation-timeline: --navigation-detail-scroll') &&
    CSS.supports('animation-range: 0px 1px') &&
    CSS.supports('scroll-timeline: --navigation-detail-scroll block') &&
    CSS.supports('timeline-scope: --navigation-detail-scroll');

export function clearTitleMotion(content: HTMLElement | null) {
    if (!content) return;

    delete content.dataset.navigationDetailTitleCompact;
    delete content.dataset.navigationDetailTitleEditTransition;
    delete content.dataset.navigationDetailTitleEditing;
    delete content.dataset.navigationDetailTitleMotion;
    delete content.dataset.navigationDetailMotionDirect;
    delete content.dataset.navigationDetailScrollDriven;
    const body = content.querySelector<HTMLElement>('.navigation-detail-body');
    const header = content.querySelector<HTMLElement>(
        '.navigation-detail-header'
    );
    const title = content.querySelector<HTMLElement>(
        '.navigation-detail-title'
    );

    body?.style.removeProperty('--navigation-detail-expanded-header-height');
    header?.style.removeProperty('--navigation-detail-expanded-header-height');
    header?.style.removeProperty('--navigation-detail-header-collapse-y');
    header?.style.removeProperty('--navigation-detail-header-shadow');
    title?.style.removeProperty('--navigation-detail-title-progress');
    title?.style.removeProperty('--navigation-detail-title-scale');
    title?.style.removeProperty('--navigation-detail-title-x');
    title?.style.removeProperty('--navigation-detail-title-y');
    title?.style.removeProperty('--navigation-detail-title-first-line');
    title?.style.removeProperty('--navigation-detail-title-head');
    title?.style.removeProperty('--navigation-detail-title-line');
    title?.style.removeProperty('--navigation-detail-title-tail');
    title?.style.removeProperty('--navigation-detail-title-motion-x');
    title?.style.removeProperty('--navigation-detail-title-compact-y');
    title?.style.removeProperty('--navigation-detail-title-compact-scale');
    title?.style.removeProperty('--navigation-detail-title-rest-x');
    content.style.removeProperty('--navigation-detail-collapse-range');
    content.style.removeProperty('--navigation-detail-header-drop');
}

function measureFirstLineWidth(title: HTMLElement, layoutWidth: number) {
    const content = title.querySelector('.navigation-detail-title-button');

    if (!content || layoutWidth <= 0) return layoutWidth;

    const range = document.createRange();

    range.selectNodeContents(content);
    const lines = range.getClientRects();
    const firstLine = lines[0];

    if (!firstLine) return layoutWidth;

    const appliedScale = title.getBoundingClientRect().width / layoutWidth;

    if (!(appliedScale > 0)) return layoutWidth;

    return Math.min(layoutWidth, firstLine.width / appliedScale);
}

export interface TitleMotionContext {
    bodyRef: RefObject<HTMLDivElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    headerRef: RefObject<HTMLElement | null>;
    prepareTitleEditingRef: RefObject<() => void>;
    reducedMotionTitleCollapsedRef: RefObject<boolean>;
    scheduleTitleMotionRef: RefObject<() => void>;
    titleEditStateRef: RefObject<TitleEditState>;
    titleEditingRef: RefObject<boolean>;
    titleMotionOpenRef: RefObject<boolean>;
    titleRef: RefObject<HTMLHeadingElement | null>;
}

interface TitleMotionRuntime {
    animationFrame: number | null;
    body: HTMLDivElement;
    content: HTMLDivElement;
    ctx: TitleMotionContext;
    header: HTMLElement;
    metrics: TitleMotionMetrics | null;
    mobileQuery: MediaQueryList;
    reducedMotionQuery: MediaQueryList;
    edit: TitleEditState;
    schedule: () => void;
    supportsScrollDrivenMotion: boolean;
    titleElement: HTMLHeadingElement;
}

function measureTitleMotion(rt: TitleMotionRuntime) {
    const {
        body,
        content,
        header,
        mobileQuery,
        supportsScrollDrivenMotion,
        titleElement
    } = rt;

    if (!mobileQuery.matches) {
        rt.metrics = null;

        return;
    }

    delete content.dataset.navigationDetailTitleCompact;
    const back = header.querySelector<HTMLElement>('.navigation-detail-back');

    if (!back) return;

    titleElement.style.setProperty(
        '--navigation-detail-title-compact-scale',
        titleCompactScale.toFixed(5)
    );

    const expandedTitleWidth = titleElement.offsetWidth;
    const expandedTitleHeight = titleElement.offsetHeight;
    const expandedFirstLineWidth = measureFirstLineWidth(
        titleElement,
        expandedTitleWidth
    );
    const expandedHeaderHeight = Math.max(
        back.offsetTop + 92,
        titleElement.offsetTop + expandedTitleHeight
    );

    header.style.setProperty(
        '--navigation-detail-expanded-header-height',
        `${expandedHeaderHeight.toFixed(3)}px`
    );
    body.style.setProperty(
        '--navigation-detail-expanded-header-height',
        `${expandedHeaderHeight.toFixed(3)}px`
    );

    content.dataset.navigationDetailTitleCompact = 'true';
    const compactTitleWidth = titleElement.offsetWidth;
    const compactTitleHeight = titleElement.offsetHeight;

    delete content.dataset.navigationDetailTitleCompact;
    const compactHeaderHeight = back.offsetTop + back.offsetHeight;
    const compactTitleTop =
        back.offsetTop +
        (back.offsetHeight - compactTitleHeight * titleCompactScale) / 2;
    const compactTitleLeft =
        (header.clientWidth - compactTitleWidth * titleCompactScale) / 2;
    const expandedTitleLeft =
        (header.clientWidth - expandedTitleWidth * titleCompactScale) / 2;

    rt.metrics = {
        compactHeaderHeight,
        expandedHeaderHeight,
        firstLineHeight: compactTitleHeight,
        firstLineWidth: expandedFirstLineWidth,
        translateX: expandedTitleLeft - titleElement.offsetLeft,
        restTranslateX: compactTitleLeft - titleElement.offsetLeft,
        translateY: compactTitleTop - titleElement.offsetTop
    };
    const collapseRange = Math.max(
        0.001,
        expandedHeaderHeight - compactHeaderHeight
    );

    content.style.setProperty(
        '--navigation-detail-collapse-range',
        `${collapseRange.toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-motion-x',
        `${rt.metrics.translateX.toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-rest-x',
        `${rt.metrics.restTranslateX.toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-compact-y',
        `${rt.metrics.translateY.toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-line',
        `${rt.metrics.firstLineHeight.toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-first-line',
        `${rt.metrics.firstLineWidth.toFixed(3)}px`
    );
    content.toggleAttribute(
        'data-navigation-detail-scroll-driven',
        supportsScrollDrivenMotion
    );
}
function readTitleMotion(rt: TitleMotionRuntime, ignoreEditing = false) {
    const { body, reducedMotionQuery } = rt;
    const { reducedMotionTitleCollapsedRef, titleEditingRef } = rt.ctx;

    if (!rt.metrics) measureTitleMotion(rt);
    if (!rt.metrics) return null;

    const scrollTop = Math.max(0, body.scrollTop);
    const collapseRange = Math.max(
        0,
        rt.metrics.expandedHeaderHeight - rt.metrics.compactHeaderHeight
    );
    let collapsedDistance = Math.min(collapseRange, scrollTop);
    let progress = collapseRange > 0 ? collapsedDistance / collapseRange : 1;

    if (reducedMotionQuery.matches) {
        if (scrollTop >= collapseRange)
            reducedMotionTitleCollapsedRef.current = true;
        else if (scrollTop <= reducedMotionExpandThreshold)
            reducedMotionTitleCollapsedRef.current = false;
        progress = reducedMotionTitleCollapsedRef.current ? 1 : 0;
        collapsedDistance = collapseRange * progress;
    }
    if (titleEditingRef.current && !ignoreEditing) {
        collapsedDistance = 0;
        progress = 0;
    }

    return { collapsedDistance, progress };
}

/**
 * The shadow under the header, from how far content has scrolled beneath the
 * header's drawn bottom edge. Outside title editing that edge follows the
 * scroll, so the shadow stays off until the header has fully collapsed; while
 * editing re-expands the header, content still scrolled beneath it keeps the
 * shadow.
 */
function headerShadow(
    rt: TitleMotionRuntime,
    progress: number,
    collapseRange: number
) {
    const coveredDistance = rt.body.scrollTop - collapseRange * progress;

    if (rt.reducedMotionQuery.matches)
        return progress >= 1 ||
            (rt.ctx.titleEditingRef.current && coveredDistance > 0.5)
            ? 1
            : 0;

    return Math.min(1, Math.max(0, coveredDistance / headerShadowFadeDistance));
}

/**
 * Renders one frame of the title and header motion. `now` is the animation
 * frame's timestamp, or null for the synchronous render at setup, which never
 * starts or advances the edit tween's clock.
 */
function applyTitleMotion(rt: TitleMotionRuntime, now: number | null) {
    const {
        content,
        header,
        mobileQuery,
        reducedMotionQuery,
        supportsScrollDrivenMotion,
        titleElement
    } = rt;
    const { titleEditingRef } = rt.ctx;

    rt.animationFrame = null;

    if (!mobileQuery.matches) {
        clearTitleMotion(content);

        return;
    }
    const motion = readTitleMotion(rt);

    if (!rt.metrics || !motion) return;
    const progress = titleEditTweenProgress(rt, motion.progress, now);

    rt.edit.displayedProgress = progress;
    content.toggleAttribute(
        'data-navigation-detail-title-editing',
        titleEditingRef.current
    );
    content.toggleAttribute(
        'data-navigation-detail-title-motion',
        progress > 0.001
    );
    content.toggleAttribute(
        'data-navigation-detail-title-compact',
        progress >= titleRevealProgress && !titleEditingRef.current
    );

    const useDirectMotion =
        !supportsScrollDrivenMotion ||
        reducedMotionQuery.matches ||
        titleEditingRef.current ||
        rt.edit.rendered ||
        rt.edit.tween !== null;

    if (!useDirectMotion) {
        delete content.dataset.navigationDetailMotionDirect;
        content.style.removeProperty('--navigation-detail-header-drop');

        return;
    }

    const directProgress = progress;
    const collapseRange = Math.max(
        0,
        rt.metrics.expandedHeaderHeight - rt.metrics.compactHeaderHeight
    );

    header.style.setProperty(
        '--navigation-detail-header-collapse-y',
        `${(collapseRange * directProgress).toFixed(3)}px`
    );
    content.style.setProperty(
        '--navigation-detail-header-drop',
        `${(collapseRange * (1 - directProgress)).toFixed(3)}px`
    );
    header.style.setProperty(
        '--navigation-detail-header-shadow',
        headerShadow(rt, directProgress, collapseRange).toFixed(4)
    );

    const scale = 1 + (titleCompactScale - 1) * directProgress;
    const reveal = Math.max(
        0,
        (directProgress - titleRevealProgress) / (1 - titleRevealProgress)
    );
    const travelX =
        rt.metrics.translateX * Math.min(directProgress, titleRevealProgress) +
        (rt.metrics.restTranslateX -
            rt.metrics.translateX * titleRevealProgress) *
            reveal;

    titleElement.style.setProperty(
        '--navigation-detail-title-progress',
        directProgress.toFixed(5)
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-scale',
        scale.toFixed(5)
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-x',
        `${travelX.toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-y',
        `${(rt.metrics.translateY * directProgress).toFixed(3)}px`
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-tail',
        (1 - Math.min(1, directProgress / titleTailFadeProgress)).toFixed(4)
    );
    titleElement.style.setProperty(
        '--navigation-detail-title-head',
        reveal.toFixed(4)
    );
    content.dataset.navigationDetailMotionDirect = 'true';
}

/**
 * Reconciles the rendered title (button or rename input) with the edit state:
 * entering an edit notes whether the header was collapsed, and leaving one
 * eases the header back to the scroll position when it was collapsed or
 * scrolled during the edit. Runs from the title's mutation observer and on
 * every setup, so an edit that ended across a setup re-run still animates.
 */
function syncTitleEditing(rt: TitleMotionRuntime) {
    const { content, edit, titleElement } = rt;
    const editing =
        titleElement.querySelector('.navigation-detail-title-input') !== null;

    if (editing !== edit.rendered) {
        edit.rendered = editing;
        if (editing)
            edit.transitionNeeded = content.hasAttribute(
                'data-navigation-detail-title-motion'
            );
        else {
            if (edit.transitionNeeded)
                startTitleEditTween(
                    rt,
                    edit.tween ? edit.displayedProgress : 0
                );
            edit.transitionNeeded = false;
        }
    }
    if (!editing) rt.metrics = null;
    rt.ctx.titleEditingRef.current = editing;
    rt.schedule();
}

/**
 * Drives the collapsing detail title. Undefined when the detail chrome is not
 * mounted yet; otherwise the teardown for the effect that called it.
 */
export function setupTitleMotion(
    ctx: TitleMotionContext
): (() => void) | undefined {
    const {
        bodyRef,
        contentRef,
        headerRef,
        prepareTitleEditingRef,
        reducedMotionTitleCollapsedRef,
        scheduleTitleMotionRef,
        titleEditStateRef,
        titleEditingRef,
        titleMotionOpenRef,
        titleRef
    } = ctx;
    const body = bodyRef.current;
    const content = contentRef.current;
    const header = headerRef.current;
    const titleElement = titleRef.current;

    if (!body || !content || !header || !titleElement) return;

    const opening = !titleMotionOpenRef.current;
    const mobileQuery = window.matchMedia(mobileMedia);
    const reducedMotionQuery = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    );
    const supportsScrollDrivenMotion = scrollDrivenMotionSupported();
    const rt: TitleMotionRuntime = {
        animationFrame: null,
        body,
        content,
        ctx,
        edit: titleEditStateRef.current,
        header,
        metrics: null,
        mobileQuery,
        reducedMotionQuery,
        schedule: () => scheduleTitleMotion(),
        supportsScrollDrivenMotion,
        titleElement
    };

    titleMotionOpenRef.current = true;
    if (opening) {
        body.scrollTop = 0;
        titleEditingRef.current = false;
        reducedMotionTitleCollapsedRef.current = false;
        Object.assign(rt.edit, createTitleEditState());
        clearTitleMotion(content);
    }

    const scheduleTitleMotion = () => {
        if (rt.animationFrame !== null) return;
        rt.animationFrame = window.requestAnimationFrame((now) =>
            applyTitleMotion(rt, now)
        );
    };
    const handleTitleScroll = () => {
        if (titleEditingRef.current && body.scrollTop > 0.5)
            rt.edit.transitionNeeded = true;
        scheduleTitleMotion();
    };
    const remeasureTitleMotion = () => {
        rt.metrics = null;
        scheduleTitleMotion();
    };

    prepareTitleEditingRef.current = () =>
        startTitleEditTween(
            rt,
            rt.edit.tween
                ? rt.edit.displayedProgress
                : (readTitleMotion(rt, true)?.progress ?? 0)
        );
    scheduleTitleMotionRef.current = scheduleTitleMotion;
    body.addEventListener('scroll', handleTitleScroll, {
        passive: true
    });
    mobileQuery.addEventListener('change', remeasureTitleMotion);
    reducedMotionQuery.addEventListener('change', scheduleTitleMotion);
    const resizeObserver = new ResizeObserver(remeasureTitleMotion);
    const titleObserver = new MutationObserver(() => syncTitleEditing(rt));

    resizeObserver.observe(content);
    titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    syncTitleEditing(rt);
    measureTitleMotion(rt);
    applyTitleMotion(rt, null);

    return () => {
        body.removeEventListener('scroll', handleTitleScroll);
        mobileQuery.removeEventListener('change', remeasureTitleMotion);
        reducedMotionQuery.removeEventListener('change', scheduleTitleMotion);
        resizeObserver.disconnect();
        titleObserver.disconnect();
        if (rt.animationFrame !== null)
            window.cancelAnimationFrame(rt.animationFrame);
        prepareTitleEditingRef.current = () => undefined;
        scheduleTitleMotionRef.current = () => undefined;
    };
}
