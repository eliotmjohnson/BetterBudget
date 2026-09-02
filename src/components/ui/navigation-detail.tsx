'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, X } from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject
} from 'react';
import {
    createGestureFrameDriver,
    getCoalescedPointerSamples,
    getPredictedPointerSample,
    listenForRawPointerUpdates,
    updateGestureVelocity,
    type GestureFrameDriver
} from './gesture-frame';
import { leftEdgeGestureWidth } from './left-edge-gesture-guard';

interface EdgeDragState {
    pointerId: number;
    captureTarget: HTMLDivElement;
    width: number;
    originX: number;
    startX: number;
    startY: number;
    lastPosition: number;
    lastTime: number;
    stopRawUpdates?: () => void;
    velocity: number;
    dragging: boolean;
}

interface TitleMotionMetrics {
    compactHeaderHeight: number;
    expandedHeaderHeight: number;
    firstLineHeight: number;
    firstLineWidth: number;
    translateX: number;
    restTranslateX: number;
    translateY: number;
}

const mobileMedia = '(max-width: 759.98px)';
const directionThreshold = 8;
const settleDuration = 410;
const dismissDuration = 500;
const dismissOvershoot = 48;
const motionCleanupDelay = 480;
const titleCompactScale = 20 / 46;
const titleTailFadeProgress = 0.5;
const titleRevealProgress = 0.65; // Matches the 65% collapse keyframe stop.
const titleEditTransitionCleanupDelay = 400;
const reducedMotionExpandThreshold = 8;

function clearTitleMotion(content: HTMLElement | null) {
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
    title?.style.removeProperty('--navigation-detail-title-line');
    title?.style.removeProperty('--navigation-detail-title-tail');
    title?.style.removeProperty('--navigation-detail-title-motion-x');
    title?.style.removeProperty('--navigation-detail-title-compact-y');
    title?.style.removeProperty('--navigation-detail-title-compact-scale');
    title?.style.removeProperty('--navigation-detail-title-rest-x');
    content.style.removeProperty('--navigation-detail-collapse-range');
}

// The wrapped first line is where the compact single line stops matching what
// was already on screen, so the revealed remainder fades in from that width.
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

function clearBaseMotion() {
    delete document.body.dataset.navigationDetailDragging;
    delete document.body.dataset.navigationDetailDismissing;
    delete document.body.dataset.navigationDetailSettling;
    delete document.body.dataset.navigationDetailState;
    document.body.style.removeProperty('--navigation-detail-base-drag-x');
    document.body.style.removeProperty('--navigation-detail-dismiss-duration');
}

function setBaseDragPosition(distance: number, width: number) {
    const progress = Math.min(1, Math.max(0, distance / width));
    const restingOffset = Math.min(96, width * 0.22);

    document.body.style.setProperty(
        '--navigation-detail-base-drag-x',
        `${-restingOffset * (1 - progress)}px`
    );
}

function restoreDetailFocus(target: HTMLElement, focusVisible: boolean) {
    if (!focusVisible) target.dataset.navigationDetailRestoredFocus = 'true';
    target.focus({ preventScroll: true });
    if (focusVisible) return;

    requestAnimationFrame(() => {
        if (document.activeElement !== target) {
            delete target.dataset.navigationDetailRestoredFocus;

            return;
        }

        const clearRestoredFocus = () => {
            delete target.dataset.navigationDetailRestoredFocus;
            target.removeEventListener('blur', clearRestoredFocus);
            target.removeEventListener('keydown', clearRestoredFocus);
        };

        target.addEventListener('blur', clearRestoredFocus, { once: true });
        target.addEventListener('keydown', clearRestoredFocus, { once: true });
    });
}

export function NavigationDetail({
    backLabel = 'Budget',
    children,
    floatingAction,
    headerAction,
    open,
    onOpenChange,
    restoreFocusRef,
    restoreFocusPreferenceRef,
    restoreFocusVisible,
    title,
    titleContent
}: {
    backLabel?: string;
    children: ReactNode;
    floatingAction?: ReactNode;
    headerAction?: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    restoreFocusPreferenceRef?: RefObject<boolean>;
    restoreFocusVisible?: boolean;
    title: string;
    titleContent?: ReactNode;
}) {
    const bodyRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentReady, setContentReady] = useState(false);
    const dragRef = useRef<EdgeDragState | null>(null);
    const dragFrameRef = useRef<GestureFrameDriver | null>(null);
    const dragWidthRef = useRef(1);
    const gestureReadyRef = useRef(false);
    const headerRef = useRef<HTMLElement>(null);
    const activeRef = useRef(false);
    const restoreFocusVisibleRef = useRef(true);
    const reducedMotionTitleCollapsedRef = useRef(false);
    const prepareTitleEditingRef = useRef<() => void>(() => undefined);
    const scheduleTitleMotionRef = useRef<() => void>(() => undefined);
    const titleEditingRef = useRef(false);
    const titleMotionOpenRef = useRef(false);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const titleSelectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const motionCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const gestureReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const setContentRef = useCallback((element: HTMLDivElement | null) => {
        contentRef.current = element;
        setContentReady(element !== null);
    }, []);
    const resetSettleTimer = () => {
        if (!settleTimerRef.current) return;
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
    };
    const clearTitleSelectionTimer = () => {
        if (!titleSelectionTimerRef.current) return;
        clearTimeout(titleSelectionTimerRef.current);
        titleSelectionTimerRef.current = null;
    };

    useLayoutEffect(() => {
        if (motionCleanupTimerRef.current) {
            clearTimeout(motionCleanupTimerRef.current);
            motionCleanupTimerRef.current = null;
        }
        if (gestureReadyTimerRef.current) {
            clearTimeout(gestureReadyTimerRef.current);
            gestureReadyTimerRef.current = null;
        }

        if (open) {
            activeRef.current = true;
            gestureReadyRef.current = false;
            delete contentRef.current?.dataset.hasDragged;
            delete document.body.dataset.navigationDetailDragging;
            delete document.body.dataset.navigationDetailDismissing;
            delete document.body.dataset.navigationDetailSettling;
            document.body.style.removeProperty(
                '--navigation-detail-base-drag-x'
            );
            document.body.style.removeProperty(
                '--navigation-detail-dismiss-duration'
            );
            document.body.dataset.navigationDetailState = 'open';
            const reducedMotion = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches;

            gestureReadyTimerRef.current = setTimeout(
                () => {
                    gestureReadyRef.current = true;
                    gestureReadyTimerRef.current = null;
                },
                reducedMotion ? 0 : 620
            );
        } else if (activeRef.current) {
            dragFrameRef.current?.cancel();
            dragRef.current?.stopRawUpdates?.();
            dragRef.current = null;
            gestureReadyRef.current = false;
            document.body.dataset.navigationDetailState = 'closed';
        }
    }, [open]);

    useLayoutEffect(() => {
        if (!open) {
            titleMotionOpenRef.current = false;
            prepareTitleEditingRef.current = () => undefined;
            scheduleTitleMotionRef.current = () => undefined;

            return;
        }

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
        let animationFrame: number | null = null;
        let metrics: TitleMotionMetrics | null = null;
        let titleEditHandoffProgress: number | null = null;
        let renderedTitleEditing =
            titleElement.querySelector('.navigation-detail-title-input') !==
            null;
        let titleEditTransitionNeeded = false;
        let titleEditTransitionTimer: ReturnType<typeof setTimeout> | null =
            null;

        titleMotionOpenRef.current = true;
        if (opening) {
            body.scrollTop = 0;
            titleEditingRef.current = false;
            reducedMotionTitleCollapsedRef.current = false;
            clearTitleMotion(content);
        }

        const measureTitleMotion = () => {
            if (!mobileQuery.matches) {
                metrics = null;

                return;
            }

            delete content.dataset.navigationDetailTitleCompact;
            const back = header.querySelector<HTMLElement>(
                '.navigation-detail-back'
            );

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
                (back.offsetHeight - compactTitleHeight * titleCompactScale) /
                    2;
            const compactTitleLeft =
                (header.clientWidth - compactTitleWidth * titleCompactScale) /
                2;
            const expandedTitleLeft =
                (header.clientWidth - expandedTitleWidth * titleCompactScale) /
                2;

            metrics = {
                // A wrapped title travels centered on its own box; the wider
                // single-line box only takes over once the compact layout
                // replaces it, so both share one center across the swap.
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
                `${metrics.translateX.toFixed(3)}px`
            );
            titleElement.style.setProperty(
                '--navigation-detail-title-rest-x',
                `${metrics.restTranslateX.toFixed(3)}px`
            );
            titleElement.style.setProperty(
                '--navigation-detail-title-compact-y',
                `${metrics.translateY.toFixed(3)}px`
            );
            titleElement.style.setProperty(
                '--navigation-detail-title-line',
                `${metrics.firstLineHeight.toFixed(3)}px`
            );
            titleElement.style.setProperty(
                '--navigation-detail-title-first-line',
                `${metrics.firstLineWidth.toFixed(3)}px`
            );
            content.toggleAttribute(
                'data-navigation-detail-scroll-driven',
                supportsScrollDrivenMotion
            );
        };
        const readTitleMotion = (ignoreEditing = false) => {
            if (!metrics) measureTitleMotion();
            if (!metrics) return null;

            const scrollTop = Math.max(0, body.scrollTop);
            const collapseRange = Math.max(
                0,
                metrics.expandedHeaderHeight - metrics.compactHeaderHeight
            );
            let collapsedDistance = Math.min(collapseRange, scrollTop);
            let progress =
                collapseRange > 0 ? collapsedDistance / collapseRange : 1;

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
        };
        const applyTitleMotion = () => {
            animationFrame = null;

            if (!mobileQuery.matches) {
                clearTitleMotion(content);

                return;
            }
            const motion = readTitleMotion();

            if (!metrics || !motion) return;
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
                motion.progress >= titleRevealProgress &&
                    !titleEditingRef.current
            );

            const useDirectMotion =
                !supportsScrollDrivenMotion ||
                reducedMotionQuery.matches ||
                titleEditingRef.current ||
                renderedTitleEditing ||
                content.hasAttribute(
                    'data-navigation-detail-title-edit-transition'
                );

            if (!useDirectMotion) {
                delete content.dataset.navigationDetailMotionDirect;

                return;
            }

            const directProgress = titleEditHandoffProgress ?? motion.progress;
            const collapseRange = Math.max(
                0,
                metrics.expandedHeaderHeight - metrics.compactHeaderHeight
            );
            const directCollapsedDistance =
                titleEditHandoffProgress === null
                    ? motion.collapsedDistance
                    : collapseRange * titleEditHandoffProgress;

            header.style.setProperty(
                '--navigation-detail-header-collapse-y',
                `${directCollapsedDistance.toFixed(3)}px`
            );

            // The wrapped box travels to its own centered position, then
            // slides on to the single-line resting position as the remainder
            // reveals.
            const scale = 1 + (titleCompactScale - 1) * directProgress;
            const reveal = Math.max(
                0,
                (directProgress - titleRevealProgress) /
                    (1 - titleRevealProgress)
            );
            const travelX =
                metrics.translateX *
                    Math.min(directProgress, titleRevealProgress) +
                (metrics.restTranslateX -
                    metrics.translateX * titleRevealProgress) *
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
                `${(metrics.translateY * directProgress).toFixed(3)}px`
            );
            titleElement.style.setProperty(
                '--navigation-detail-title-tail',
                (
                    1 - Math.min(1, directProgress / titleTailFadeProgress)
                ).toFixed(4)
            );
            titleElement.style.setProperty(
                '--navigation-detail-title-head',
                reveal.toFixed(4)
            );
            content.dataset.navigationDetailMotionDirect = 'true';
            if (titleEditHandoffProgress !== null) {
                void window.getComputedStyle(header, '::before').clipPath;
                void window.getComputedStyle(titleElement).transform;
                titleEditHandoffProgress = null;
                scheduleTitleMotion();
            }
        };
        const scheduleTitleMotion = () => {
            if (animationFrame !== null) return;
            animationFrame = window.requestAnimationFrame(applyTitleMotion);
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
            metrics = null;
            scheduleTitleMotion();
        };

        prepareTitleEditingRef.current = () => {
            titleEditHandoffProgress = readTitleMotion(true)?.progress ?? null;
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

            if (editing !== renderedTitleEditing) {
                renderedTitleEditing = editing;
                if (editing)
                    titleEditTransitionNeeded = content.hasAttribute(
                        'data-navigation-detail-title-motion'
                    );
                if (titleEditTransitionNeeded) startTitleEditTransition();
                else clearTitleEditTransition();
                if (!editing) titleEditTransitionNeeded = false;
            }
            if (!editing) metrics = null;
            titleEditingRef.current = editing;
            scheduleTitleMotion();
        });

        resizeObserver.observe(content);
        titleObserver.observe(titleElement, {
            childList: true,
            characterData: true,
            subtree: true
        });
        measureTitleMotion();
        applyTitleMotion();

        return () => {
            body.removeEventListener('scroll', handleTitleScroll);
            mobileQuery.removeEventListener('change', remeasureTitleMotion);
            reducedMotionQuery.removeEventListener(
                'change',
                scheduleTitleMotion
            );
            resizeObserver.disconnect();
            titleObserver.disconnect();
            if (animationFrame !== null)
                window.cancelAnimationFrame(animationFrame);
            clearTitleEditTransition();
            prepareTitleEditingRef.current = () => undefined;
            scheduleTitleMotionRef.current = () => undefined;
        };
    }, [contentReady, open, title]);

    useEffect(() => {
        const dragFrame = createGestureFrameDriver(
            (distance) => {
                contentRef.current?.style.setProperty(
                    '--navigation-detail-drag-x',
                    `${distance}px`
                );
                setBaseDragPosition(distance, dragWidthRef.current);
            },
            {
                shouldInterpolate: () =>
                    !window.matchMedia('(prefers-reduced-motion: reduce)')
                        .matches
            }
        );

        dragFrameRef.current = dragFrame;

        return () => {
            resetSettleTimer();
            dragFrame.cancel();
            if (dragFrameRef.current === dragFrame) dragFrameRef.current = null;
            dragRef.current?.stopRawUpdates?.();
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            if (motionCleanupTimerRef.current)
                clearTimeout(motionCleanupTimerRef.current);
            if (gestureReadyTimerRef.current)
                clearTimeout(gestureReadyTimerRef.current);
            clearTitleSelectionTimer();
            clearTitleMotion(contentRef.current);
            clearBaseMotion();
        };
    }, []);

    function settleDrag(content: HTMLDivElement, width: number) {
        resetSettleTimer();
        dragFrameRef.current?.cancel();
        delete content.dataset.dragging;
        content.dataset.settling = 'true';
        document.body.dataset.navigationDetailSettling = 'true';
        delete document.body.dataset.navigationDetailDragging;
        void content.offsetHeight;
        content.style.setProperty('--navigation-detail-drag-x', '0px');
        setBaseDragPosition(0, width);
        settleTimerRef.current = setTimeout(() => {
            delete content.dataset.settling;
            delete document.body.dataset.navigationDetailSettling;
            document.body.style.removeProperty(
                '--navigation-detail-base-drag-x'
            );
            settleTimerRef.current = null;
        }, settleDuration);
    }
    const completeDragDismissal = (content: HTMLDivElement) => {
        if (content.dataset.dismissing !== 'true') return;

        delete content.dataset.dismissing;
        document.body.dataset.navigationDetailState = 'closed';
        delete document.body.dataset.navigationDetailDismissing;
        content.style.setProperty(
            '--navigation-detail-dismiss-duration',
            '1ms'
        );
        document.body.style.setProperty(
            '--navigation-detail-dismiss-duration',
            '1ms'
        );
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        onOpenChange(false);
    };
    const stopPendingDrag = (pointerId: number) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== pointerId) return;
        drag.stopRawUpdates?.();
        dragRef.current = null;
        dragFrameRef.current?.cancel();
        if (drag.captureTarget.hasPointerCapture(pointerId))
            drag.captureTarget.releasePointerCapture(pointerId);
        settleDrag(content, drag.width);
    };
    const moveDragFromPointer = (
        event: PointerEvent,
        preventDefault?: () => void
    ) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        const samples = getCoalescedPointerSamples(event);
        const latestSample = samples[samples.length - 1] ?? event;
        const visualSample = getPredictedPointerSample(event, latestSample);
        const deltaX = latestSample.clientX - drag.startX;
        const deltaY = latestSample.clientY - drag.startY;

        if (!drag.dragging) {
            if (
                Math.max(Math.abs(deltaX), Math.abs(deltaY)) <
                directionThreshold
            )
                return;
            if (Math.abs(deltaY) >= Math.abs(deltaX) || deltaX <= 0) {
                stopPendingDrag(event.pointerId);

                return;
            }
            drag.dragging = true;
        }

        preventDefault?.();
        updateGestureVelocity(drag, samples, 'clientX');
        dragFrameRef.current?.schedule(
            Math.min(
                drag.width,
                Math.max(0, drag.originX + visualSample.clientX - drag.startX)
            )
        );
    };
    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) =>
        moveDragFromPointer(event.nativeEvent, () => event.preventDefault());
    const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (
            event.button !== 0 ||
            dragRef.current ||
            !gestureReadyRef.current ||
            !window.matchMedia(mobileMedia).matches ||
            document.querySelector('.sheet-content') ||
            (event.target as Element).closest(
                'button, input, textarea, select, a'
            )
        )
            return;

        const content = contentRef.current;

        if (!content) return;
        dragFrameRef.current?.cancel();
        const contentBounds = content.getBoundingClientRect();
        const currentDistance = Math.min(
            contentBounds.width,
            Math.max(0, contentBounds.left)
        );
        const atViewportEdge = event.clientX <= leftEdgeGestureWidth;
        const atContentEdge =
            event.clientX >= currentDistance &&
            event.clientX <= currentDistance + leftEdgeGestureWidth;

        if (!atViewportEdge && !atContentEdge) return;

        const frame = document.querySelector<HTMLElement>('.app-frame');
        const currentBaseX = frame?.getBoundingClientRect().left;

        resetSettleTimer();
        dragWidthRef.current = contentBounds.width;
        dragFrameRef.current?.reset(currentDistance);
        if (currentBaseX !== undefined)
            document.body.style.setProperty(
                '--navigation-detail-base-drag-x',
                `${currentBaseX}px`
            );
        delete content.dataset.settling;
        delete document.body.dataset.navigationDetailSettling;
        content.dataset.hasDragged = 'true';
        content.dataset.dragging = 'true';
        document.body.dataset.navigationDetailDragging = 'true';
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            captureTarget: event.currentTarget,
            width: contentBounds.width,
            originX: currentDistance,
            startX: event.clientX,
            startY: event.clientY,
            lastPosition: event.clientX,
            lastTime: event.timeStamp,
            velocity: 0,
            dragging: false
        };
        dragRef.current.stopRawUpdates = listenForRawPointerUpdates(
            event.currentTarget,
            moveDragFromPointer
        );
    };
    const finishDrag = (
        event: ReactPointerEvent<HTMLDivElement>,
        cancelled = false
    ) => {
        const drag = dragRef.current;
        const content = contentRef.current;

        if (!drag || !content || drag.pointerId !== event.pointerId) return;
        const samples = getCoalescedPointerSamples(event.nativeEvent);
        const latestSample = samples[samples.length - 1] ?? event.nativeEvent;

        if (drag.dragging) updateGestureVelocity(drag, samples, 'clientX');
        drag.stopRawUpdates?.();
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (!drag.dragging) {
            settleDrag(content, drag.width);

            return;
        }

        const distance = Math.min(
            drag.width,
            Math.max(0, drag.originX + latestSample.clientX - drag.startX)
        );
        const threshold = drag.width * 0.3;
        const projectedDistance = distance + Math.max(0, drag.velocity) * 180;
        const dismiss =
            !cancelled &&
            (distance >= threshold ||
                (distance >= 24 &&
                    (drag.velocity >= 0.55 || projectedDistance >= threshold)));

        dragFrameRef.current?.cancel();
        void content.offsetHeight;
        delete content.dataset.dragging;
        delete document.body.dataset.navigationDetailDragging;
        if (dismiss) {
            const exitDistance = drag.width + dismissOvershoot;
            const duration = dismissDuration;
            const durationValue = `${duration}ms`;

            content.style.setProperty(
                '--navigation-detail-dismiss-duration',
                durationValue
            );
            document.body.style.setProperty(
                '--navigation-detail-dismiss-duration',
                durationValue
            );
            content.dataset.dismissing = 'true';
            document.body.dataset.navigationDetailDismissing = 'true';
            void content.offsetHeight;
            content.style.setProperty(
                '--navigation-detail-drag-x',
                `${exitDistance}px`
            );
            document.body.style.setProperty(
                '--navigation-detail-base-drag-x',
                '0px'
            );
            dismissTimerRef.current = setTimeout(
                () => completeDragDismissal(content),
                duration + 80
            );

            return;
        }
        settleDrag(content, drag.width);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay
                    className='navigation-detail-overlay'
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={(event) => finishDrag(event)}
                    onPointerCancel={(event) => finishDrag(event, true)}
                />
                <Dialog.Content
                    ref={setContentRef}
                    className={`navigation-detail-content${
                        floatingAction
                            ? ' navigation-detail-content--with-floating-action'
                            : ''
                    }`}
                    onAnimationEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.currentTarget.dataset.state === 'closed'
                        ) {
                            activeRef.current = false;
                            clearTitleMotion(event.currentTarget);
                            motionCleanupTimerRef.current = setTimeout(() => {
                                clearBaseMotion();
                                motionCleanupTimerRef.current = null;
                            }, motionCleanupDelay);
                        }
                    }}
                    onCloseAutoFocus={(event) => {
                        const target = restoreFocusRef?.current;

                        if (!target) return;
                        event.preventDefault();
                        restoreDetailFocus(
                            target,
                            restoreFocusVisibleRef.current
                        );
                    }}
                    onEscapeKeyDown={(event) => {
                        if (titleEditingRef.current) event.preventDefault();
                    }}
                    onOpenAutoFocus={(event) => {
                        restoreFocusVisibleRef.current =
                            restoreFocusPreferenceRef?.current ??
                            restoreFocusVisible ??
                            restoreFocusRef?.current?.matches(
                                ':focus-visible'
                            ) ??
                            true;
                        event.preventDefault();
                        contentRef.current?.focus();
                    }}
                    onTransitionEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.propertyName === 'transform' &&
                            event.currentTarget.dataset.dismissing === 'true'
                        )
                            completeDragDismissal(event.currentTarget);
                    }}
                    onPointerDownOutside={(event) => {
                        if (window.matchMedia(mobileMedia).matches)
                            event.preventDefault();
                    }}
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={(event) => finishDrag(event)}
                    onPointerCancel={(event) => finishDrag(event, true)}
                >
                    <div
                        className='navigation-detail-handle'
                        aria-hidden='true'
                    />
                    <header
                        ref={headerRef}
                        className='navigation-detail-header'
                    >
                        <button
                            className='navigation-detail-back'
                            type='button'
                            aria-label={`Back to ${backLabel}`}
                            onClick={() => onOpenChange(false)}
                        >
                            <ChevronLeft size={30} strokeWidth={2.1} />
                        </button>
                        <Dialog.Title
                            ref={titleRef}
                            className='navigation-detail-title'
                            aria-label={title}
                            onBlurCapture={(event) => {
                                if (
                                    !(event.target as Element).matches(
                                        '.navigation-detail-title-input'
                                    )
                                )
                                    return;
                                clearTitleSelectionTimer();
                                titleEditingRef.current = false;
                                scheduleTitleMotionRef.current();
                            }}
                            onFocusCapture={(event) => {
                                if (
                                    !(event.target as Element).matches(
                                        '.navigation-detail-title-input'
                                    )
                                )
                                    return;
                                const input = event.target as HTMLInputElement;
                                const delaySelection =
                                    contentRef.current?.hasAttribute(
                                        'data-navigation-detail-title-motion'
                                    ) === true &&
                                    !window.matchMedia(
                                        '(prefers-reduced-motion: reduce)'
                                    ).matches;

                                clearTitleSelectionTimer();
                                if (delaySelection)
                                    prepareTitleEditingRef.current();
                                titleEditingRef.current = true;
                                scheduleTitleMotionRef.current();
                                if (!delaySelection) {
                                    input.select();

                                    return;
                                }

                                titleSelectionTimerRef.current = setTimeout(
                                    () => {
                                        titleSelectionTimerRef.current = null;
                                        if (
                                            input.isConnected &&
                                            document.activeElement === input
                                        )
                                            input.select();
                                    },
                                    titleEditTransitionCleanupDelay
                                );
                            }}
                            onKeyDown={(event) => {
                                if (
                                    event.key === 'Escape' &&
                                    (event.target as Element).matches(
                                        '.navigation-detail-title-input'
                                    )
                                )
                                    event.stopPropagation();
                            }}
                        >
                            {titleContent ?? title}
                        </Dialog.Title>
                        {headerAction ? (
                            <div className='navigation-detail-header-action'>
                                {headerAction}
                            </div>
                        ) : null}
                        <Dialog.Close
                            className='icon-button navigation-detail-close'
                            aria-label='Close'
                        >
                            <X size={22} strokeWidth={2} />
                        </Dialog.Close>
                    </header>
                    <div ref={bodyRef} className='navigation-detail-body'>
                        {children}
                    </div>
                    {floatingAction ? (
                        <div className='navigation-detail-floating-action'>
                            {floatingAction}
                        </div>
                    ) : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
