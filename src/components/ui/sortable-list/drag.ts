'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import { flushSync } from 'react-dom';

export type DragState = {
    activeHeight: number;
    autoScrollFrame: number | null;
    autoScrollVelocity: number;
    currentOrder: string[];
    currentY: number;
    desiredAutoScrollVelocity: number;
    draggedId: string;
    finishing: boolean;
    handle: HTMLElement;
    initialOrder: string[];
    onWindowPointerCancel: (event: globalThis.PointerEvent) => void;
    onWindowPointerMove: (event: globalThis.PointerEvent) => void;
    onWindowPointerUp: (event: globalThis.PointerEvent) => void;
    onWindowTouchMove: (event: TouchEvent) => void;
    overlay: HTMLElement;
    overlayOriginTop: number;
    pointerId: number;
    pointerStartY: number;
    previousAutoScrollTime: number;
    sortableItem: HTMLElement;
    targetIndex: number;
};

const sameOrder = (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((id, index) => id === right[index]);
const maximumAutoScrollVelocity = 0.22;

export interface DragStart {
    clientY: number;
    handle: HTMLElement;
    id: string;
    pointerId: number;
}

export interface DragContext<T> {
    clearShiftStyles: () => void;
    dragRef: RefObject<DragState | null>;
    getId: (item: T) => string;
    items: T[];
    onReorder: (ids: string[]) => void;
    overlayLayer: 'base' | 'nested';
    overlayRef: RefObject<HTMLElement | null>;
    previewElement: (sortableItem: HTMLElement) => HTMLElement;
    releaseTimerRef: RefObject<number | null>;
    rootRef: RefObject<HTMLDivElement | null>;
    scrollContainer: () => HTMLElement | null;
    setOrder: Dispatch<SetStateAction<string[] | null>>;
    sortAnimationsRef: RefObject<Map<string, Animation>>;
    sortableElements: () => HTMLElement[];
}

export function animateOrder<T>(
    ctx: DragContext<T>,
    next: string[],
    activeId?: string,
    beforeCommit?: () => void
) {
    const { setOrder, sortAnimationsRef, sortableElements } = ctx;
    const before = new Map(
        sortableElements().map((element) => [
            element.dataset.sortableId,
            element.getBoundingClientRect().top
        ])
    );

    for (const animation of sortAnimationsRef.current.values())
        animation.cancel();
    sortAnimationsRef.current.clear();
    beforeCommit?.();
    flushSync(() => setOrder(next));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const element of sortableElements()) {
        const id = element.dataset.sortableId;

        if (!id || id === activeId) continue;
        const previousTop = before.get(id);

        if (previousTop === undefined) continue;
        const delta = previousTop - element.getBoundingClientRect().top;

        if (Math.abs(delta) < 1) continue;
        const animation = element.animate(
            [
                { transform: `translate3d(0, ${delta}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' }
            ],
            { duration: 340, easing: 'cubic-bezier(.4, 1, .4, 1)' }
        );

        sortAnimationsRef.current.set(id, animation);
        const releaseAnimation = () => {
            if (sortAnimationsRef.current.get(id) === animation)
                sortAnimationsRef.current.delete(id);
        };

        void animation.finished.then(releaseAnimation, releaseAnimation);
    }
}
export function updateTarget<T>(
    ctx: DragContext<T>,
    drag: DragState,
    clientY: number
) {
    const { previewElement, sortableElements } = ctx;
    const sortableItems = sortableElements();
    const heights = sortableItems.map(
        (element) => element.getBoundingClientRect().height
    );
    const initialIndex = drag.initialOrder.indexOf(drag.draggedId);
    const slotShifts = heights.map(() => 0);

    for (let index = initialIndex + 1; index < heights.length; index += 1)
        slotShifts[index] = slotShifts[index - 1]! + heights[index]!;
    for (let index = initialIndex - 1; index >= 0; index -= 1)
        slotShifts[index] = slotShifts[index + 1]! - heights[index]!;
    const sourceMatchesPreviewHeight =
        Math.abs(drag.activeHeight - drag.overlay.offsetHeight) <= 2;
    const targetPositions = sourceMatchesPreviewHeight
        ? slotShifts
        : sortableItems.map((element) => {
              const rect = element.getBoundingClientRect();
              const transform = getComputedStyle(element).transform;
              const translatedY =
                  transform === 'none'
                      ? 0
                      : new DOMMatrixReadOnly(transform).m42;
              const activatorRect = element
                  .querySelector<HTMLElement>('[data-sort-long-press]')
                  ?.getBoundingClientRect();

              return (
                  (activatorRect
                      ? activatorRect.top + activatorRect.height / 2
                      : rect.top + rect.height / 2) - translatedY
              );
          });
    let pointerPosition = clientY;

    if (sourceMatchesPreviewHeight) {
        const sourceTransform = getComputedStyle(drag.sortableItem).transform;
        const sourceTranslatedY =
            sourceTransform === 'none'
                ? 0
                : new DOMMatrixReadOnly(sourceTransform).m42;
        const sourceTop =
            previewElement(drag.sortableItem).getBoundingClientRect().top -
            sourceTranslatedY;
        const overlayTop = drag.overlayOriginTop + clientY - drag.pointerStartY;

        pointerPosition = overlayTop - sourceTop;
    }
    let targetIndex = drag.targetIndex;

    while (
        targetIndex < targetPositions.length - 1 &&
        pointerPosition >
            (targetPositions[targetIndex]! +
                targetPositions[targetIndex + 1]!) /
                2 +
                8
    )
        targetIndex += 1;
    while (
        targetIndex > 0 &&
        pointerPosition <
            (targetPositions[targetIndex - 1]! +
                targetPositions[targetIndex]!) /
                2 -
                8
    )
        targetIndex -= 1;
    if (targetIndex === drag.targetIndex) return;
    drag.targetIndex = targetIndex;
    const next = [...drag.initialOrder];
    const [moved] = next.splice(initialIndex, 1);

    next.splice(targetIndex, 0, moved!);
    drag.currentOrder = next;
    const activeShift = slotShifts[targetIndex]!;

    for (const [index, element] of sortableItems.entries()) {
        const shiftsUp =
            initialIndex < targetIndex &&
            index > initialIndex &&
            index <= targetIndex;
        const shiftsDown =
            targetIndex < initialIndex &&
            index >= targetIndex &&
            index < initialIndex;
        const shift =
            element === drag.sortableItem
                ? activeShift
                : shiftsUp
                  ? -drag.activeHeight
                  : shiftsDown
                    ? drag.activeHeight
                    : 0;

        element.dataset.sortShifting = 'true';
        element.style.transform = `translate3d(0, ${shift}px, 0)`;
    }
}
export function stopAutoScroll(drag: DragState) {
    if (drag.autoScrollFrame !== null)
        window.cancelAnimationFrame(drag.autoScrollFrame);
    drag.autoScrollFrame = null;
    drag.autoScrollVelocity = 0;
    drag.desiredAutoScrollVelocity = 0;
}
export function continueAutoScroll<T>(ctx: DragContext<T>, drag: DragState) {
    const { dragRef, scrollContainer } = ctx;

    if (drag.autoScrollFrame !== null) return;
    drag.previousAutoScrollTime = performance.now();
    const tick = (time: number) => {
        if (dragRef.current !== drag || drag.finishing) {
            stopAutoScroll(drag);

            return;
        }
        const elapsed = Math.min(32, time - drag.previousAutoScrollTime);

        drag.previousAutoScrollTime = time;
        drag.autoScrollVelocity +=
            (drag.desiredAutoScrollVelocity - drag.autoScrollVelocity) *
            Math.min(1, elapsed / 150);
        if (
            Math.abs(drag.autoScrollVelocity) < 0.005 &&
            drag.desiredAutoScrollVelocity === 0
        ) {
            stopAutoScroll(drag);

            return;
        }
        const container = scrollContainer();

        if (container) {
            const previousScrollTop = container.scrollTop;

            container.scrollTop += drag.autoScrollVelocity * elapsed;
            if (container.scrollTop !== previousScrollTop)
                updateTarget(ctx, drag, drag.currentY);
        }
        drag.autoScrollFrame = window.requestAnimationFrame(tick);
    };

    drag.autoScrollFrame = window.requestAnimationFrame(tick);
}
export function finish<T>(
    ctx: DragContext<T>,
    pointerId: number,
    cancelled: boolean
) {
    const {
        clearShiftStyles,
        dragRef,
        onReorder,
        overlayRef,
        previewElement,
        rootRef,
        setOrder,
        sortableElements
    } = ctx;
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== pointerId || drag.finishing) return;
    drag.finishing = true;
    window.removeEventListener('pointerup', drag.onWindowPointerUp);
    window.removeEventListener('pointercancel', drag.onWindowPointerCancel);
    window.removeEventListener('pointermove', drag.onWindowPointerMove);
    window.removeEventListener('touchmove', drag.onWindowTouchMove);
    drag.handle.removeAttribute('data-long-press-active');
    stopAutoScroll(drag);
    if (drag.handle.hasPointerCapture(pointerId))
        drag.handle.releasePointerCapture(pointerId);
    if (cancelled && !sameOrder(drag.initialOrder, drag.currentOrder)) {
        drag.currentOrder = drag.initialOrder;
        clearShiftStyles();
    } else if (!cancelled && !sameOrder(drag.initialOrder, drag.currentOrder)) {
        animateOrder(ctx, drag.currentOrder, drag.draggedId, clearShiftStyles);
        onReorder(drag.currentOrder);
    } else {
        clearShiftStyles();
    }
    const targetItem = sortableElements().find(
        (element) => element.dataset.sortableId === drag.draggedId
    );
    const targetTop = targetItem
        ? previewElement(targetItem).getBoundingClientRect().top
        : drag.overlayOriginTop;
    const currentDelta = drag.currentY - drag.pointerStartY;
    const targetDelta = targetTop - drag.overlayOriginTop;
    let cleanedUp = false;
    let cleanupTimer = 0;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        window.clearTimeout(cleanupTimer);
        drag.overlay.remove();
        if (overlayRef.current === drag.overlay) overlayRef.current = null;
        if (dragRef.current === drag) dragRef.current = null;
        drag.sortableItem.removeAttribute('data-dragging');
        rootRef.current?.removeAttribute('data-drag-active');
        setOrder(null);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cleanup();

        return;
    }
    const animation = drag.overlay.animate(
        [
            {
                opacity: 1,
                transform: `translate3d(0, ${currentDelta}px, 0) scale(1.012)`
            },
            {
                opacity: 0.88,
                transform: `translate3d(0, ${targetDelta}px, 0) scale(1)`
            }
        ],
        {
            duration: 320,
            easing: 'cubic-bezier(.4, 1, .4, 1)',
            fill: 'forwards'
        }
    );

    cleanupTimer = window.setTimeout(cleanup, 420);
    void animation.finished.then(cleanup, cleanup);
}
export function moveDrag<T>(
    ctx: DragContext<T>,
    pointerId: number,
    clientY: number,
    event: { preventDefault: () => void }
) {
    const { dragRef, scrollContainer } = ctx;
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== pointerId || drag.finishing) return;
    event.preventDefault();
    drag.currentY = clientY;
    drag.overlay.style.transform = `translate3d(0, ${clientY - drag.pointerStartY}px, 0) scale(1.012)`;
    updateTarget(ctx, drag, clientY);
    const container = scrollContainer();

    if (container) {
        const rect = container.getBoundingClientRect();
        const bottomNav = container.matches('.app-content')
            ? document.querySelector<HTMLElement>('.bottom-nav')
            : null;
        const bottomNavTop =
            bottomNav && getComputedStyle(bottomNav).display !== 'none'
                ? bottomNav.getBoundingClientRect().top
                : rect.bottom;
        const topEdge = rect.top + 100;
        const bottomEdge = bottomNavTop - 100;
        const topRatio = Math.max(0, Math.min(1, (topEdge - clientY) / 100));
        const bottomRatio = Math.max(
            0,
            Math.min(1, (clientY - bottomEdge) / 100)
        );

        drag.desiredAutoScrollVelocity =
            topRatio > 0
                ? -maximumAutoScrollVelocity * topRatio * topRatio
                : bottomRatio > 0
                  ? maximumAutoScrollVelocity * bottomRatio * bottomRatio
                  : 0;
        continueAutoScroll(ctx, drag);
    }
}
export function startDrag<T>(
    ctx: DragContext<T>,
    { handle, id, pointerId, clientY }: DragStart
) {
    const {
        dragRef,
        getId,
        items,
        overlayLayer,
        overlayRef,
        previewElement,
        releaseTimerRef,
        rootRef
    } = ctx;

    if (releaseTimerRef.current !== null)
        window.clearTimeout(releaseTimerRef.current);
    const initialOrder = items.map(getId);
    const sortableItem = handle.closest('[data-sortable-item="true"]');

    if (!(sortableItem instanceof HTMLElement)) return;
    const source = previewElement(sortableItem);
    const rect = source.getBoundingClientRect();
    const sortableRect = sortableItem.getBoundingClientRect();
    const preview = source.cloneNode(true) as HTMLElement;

    preview.removeAttribute('id');
    preview.removeAttribute('data-long-press-active');
    preview.removeAttribute('data-long-press-pending');
    preview.removeAttribute('data-settling');
    for (const element of preview.querySelectorAll('[id]'))
        element.removeAttribute('id');
    for (const element of preview.querySelectorAll('[data-settling]'))
        element.removeAttribute('data-settling');
    const overlay = document.createElement('div');

    overlay.className = 'sortable-drag-overlay';
    overlay.dataset.layer = overlayLayer;
    for (const className of source.closest('.category-section')?.classList ??
        [])
        if (className.startsWith('tone-')) overlay.classList.add(className);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.append(preview);
    Object.assign(overlay.style, {
        height: `${rect.height}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        transform: 'translate3d(0, 0, 0) scale(1.012)',
        width: `${rect.width}px`
    });
    document.body.append(overlay);
    overlayRef.current = overlay;
    const onWindowPointerUp = (event: globalThis.PointerEvent) =>
        finish(ctx, event.pointerId, false);
    const onWindowPointerCancel = (event: globalThis.PointerEvent) =>
        finish(ctx, event.pointerId, true);
    const onWindowPointerMove = (event: globalThis.PointerEvent) =>
        moveDrag(ctx, event.pointerId, event.clientY, event);
    const onWindowTouchMove = (event: TouchEvent) => event.preventDefault();

    dragRef.current = {
        activeHeight: sortableRect.height,
        autoScrollFrame: null,
        autoScrollVelocity: 0,
        currentOrder: initialOrder,
        currentY: clientY,
        desiredAutoScrollVelocity: 0,
        draggedId: id,
        finishing: false,
        handle,
        initialOrder,
        onWindowPointerCancel,
        onWindowPointerMove,
        onWindowPointerUp,
        onWindowTouchMove,
        overlay,
        overlayOriginTop: rect.top,
        pointerId,
        pointerStartY: clientY,
        previousAutoScrollTime: 0,
        sortableItem,
        targetIndex: initialOrder.indexOf(id)
    };
    sortableItem.dataset.dragging = 'true';
    handle.dataset.longPressActive = 'true';
    if (rootRef.current) rootRef.current.dataset.dragActive = 'true';
    rootRef.current
        ?.closest('.budget-bars-enter')
        ?.classList.remove('budget-bars-enter');
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
    window.addEventListener('pointermove', onWindowPointerMove, {
        passive: false
    });
    window.addEventListener('touchmove', onWindowTouchMove, {
        passive: false
    });
    try {
        handle.setPointerCapture(pointerId);
    } catch {
        return;
    }
}
