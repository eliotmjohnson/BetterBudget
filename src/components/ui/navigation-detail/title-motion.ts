'use client';

import type { RefObject } from 'react';

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
export const titleEditTransitionCleanupDelay = 400;
const titleCompactScale = 20 / 46;
const titleTailFadeProgress = 0.5;
const titleRevealProgress = 0.65; // Matches the 65% collapse keyframe stop.
const reducedMotionExpandThreshold = 8;

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
    renderedTitleEditing: boolean;
    schedule: () => void;
    supportsScrollDrivenMotion: boolean;
    titleEditHandoffProgress: number | null;
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
function applyTitleMotion(rt: TitleMotionRuntime) {
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
    content.toggleAttribute(
        'data-navigation-detail-title-editing',
        titleEditingRef.current
    );
    content.toggleAttribute(
        'data-navigation-detail-title-motion',
        motion.progress > 0.001
    );
    content.toggleAttribute(
        'data-navigation-detail-title-compact',
        motion.progress >= titleRevealProgress && !titleEditingRef.current
    );

    const useDirectMotion =
        !supportsScrollDrivenMotion ||
        reducedMotionQuery.matches ||
        titleEditingRef.current ||
        rt.renderedTitleEditing ||
        content.hasAttribute('data-navigation-detail-title-edit-transition');

    if (!useDirectMotion) {
        delete content.dataset.navigationDetailMotionDirect;

        return;
    }

    const directProgress = rt.titleEditHandoffProgress ?? motion.progress;
    const collapseRange = Math.max(
        0,
        rt.metrics.expandedHeaderHeight - rt.metrics.compactHeaderHeight
    );
    const directCollapsedDistance =
        rt.titleEditHandoffProgress === null
            ? motion.collapsedDistance
            : collapseRange * rt.titleEditHandoffProgress;

    header.style.setProperty(
        '--navigation-detail-header-collapse-y',
        `${directCollapsedDistance.toFixed(3)}px`
    );

    // A wrapped title is centered on its own box and the wider single-line box
    // only takes over once the compact layout replaces it, so travel runs to
    // translateX first and blends on to restTranslateX as the remainder
    // reveals, keeping one center across the swap.
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
    if (rt.titleEditHandoffProgress !== null) {
        void window.getComputedStyle(header, '::before').clipPath;
        void window.getComputedStyle(titleElement).transform;
        rt.titleEditHandoffProgress = null;
        rt.schedule();
    }
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
    const supportsScrollDrivenMotion =
        CSS.supports('animation-timeline: --navigation-detail-scroll') &&
        CSS.supports('animation-range: 0px 1px') &&
        CSS.supports('scroll-timeline: --navigation-detail-scroll block') &&
        CSS.supports('timeline-scope: --navigation-detail-scroll');
    let titleEditTransitionNeeded = false;
    let titleEditTransitionTimer: ReturnType<typeof setTimeout> | null = null;
    const rt: TitleMotionRuntime = {
        animationFrame: null,
        body,
        content,
        ctx,
        header,
        metrics: null,
        mobileQuery,
        reducedMotionQuery,
        renderedTitleEditing:
            titleElement.querySelector('.navigation-detail-title-input') !==
            null,
        schedule: () => scheduleTitleMotion(),
        supportsScrollDrivenMotion,
        titleEditHandoffProgress: null,
        titleElement
    };

    titleMotionOpenRef.current = true;
    if (opening) {
        body.scrollTop = 0;
        titleEditingRef.current = false;
        reducedMotionTitleCollapsedRef.current = false;
        clearTitleMotion(content);
    }

    const scheduleTitleMotion = () => {
        if (rt.animationFrame !== null) return;
        rt.animationFrame = window.requestAnimationFrame(() =>
            applyTitleMotion(rt)
        );
    };
    const clearTitleEditTransition = (releaseDirectMotion = true) => {
        if (titleEditTransitionTimer) {
            clearTimeout(titleEditTransitionTimer);
            titleEditTransitionTimer = null;
        }
        delete content.dataset.navigationDetailTitleEditTransition;
        if (releaseDirectMotion && !titleEditingRef.current)
            delete content.dataset.navigationDetailMotionDirect;
    };
    const startTitleEditTransition = () => {
        clearTitleEditTransition(false);
        if (reducedMotionQuery.matches) return;

        content.dataset.navigationDetailTitleEditTransition = 'true';
        titleEditTransitionTimer = setTimeout(() => {
            delete content.dataset.navigationDetailTitleEditTransition;
            if (!titleEditingRef.current)
                delete content.dataset.navigationDetailMotionDirect;
            titleEditTransitionTimer = null;
        }, titleEditTransitionCleanupDelay);
    };
    const handleTitleScroll = () => {
        if (titleEditingRef.current) {
            if (body.scrollTop > 0.5) titleEditTransitionNeeded = true;
        } else clearTitleEditTransition();
        scheduleTitleMotion();
    };
    const remeasureTitleMotion = () => {
        rt.metrics = null;
        scheduleTitleMotion();
    };

    prepareTitleEditingRef.current = () => {
        rt.titleEditHandoffProgress =
            readTitleMotion(rt, true)?.progress ?? null;
    };
    scheduleTitleMotionRef.current = scheduleTitleMotion;
    body.addEventListener('scroll', handleTitleScroll, {
        passive: true
    });
    mobileQuery.addEventListener('change', remeasureTitleMotion);
    reducedMotionQuery.addEventListener('change', scheduleTitleMotion);
    const resizeObserver = new ResizeObserver(remeasureTitleMotion);
    const titleObserver = new MutationObserver(() => {
        const editing =
            titleElement.querySelector('.navigation-detail-title-input') !==
            null;

        if (editing !== rt.renderedTitleEditing) {
            rt.renderedTitleEditing = editing;
            if (editing)
                titleEditTransitionNeeded = content.hasAttribute(
                    'data-navigation-detail-title-motion'
                );
            if (titleEditTransitionNeeded) startTitleEditTransition();
            else clearTitleEditTransition();
            if (!editing) titleEditTransitionNeeded = false;
        }
        if (!editing) rt.metrics = null;
        titleEditingRef.current = editing;
        scheduleTitleMotion();
    });

    resizeObserver.observe(content);
    titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    measureTitleMotion(rt);
    applyTitleMotion(rt);

    return () => {
        body.removeEventListener('scroll', handleTitleScroll);
        mobileQuery.removeEventListener('change', remeasureTitleMotion);
        reducedMotionQuery.removeEventListener('change', scheduleTitleMotion);
        resizeObserver.disconnect();
        titleObserver.disconnect();
        if (rt.animationFrame !== null)
            window.cancelAnimationFrame(rt.animationFrame);
        clearTitleEditTransition();
        prepareTitleEditingRef.current = () => undefined;
        scheduleTitleMotionRef.current = () => undefined;
    };
}
