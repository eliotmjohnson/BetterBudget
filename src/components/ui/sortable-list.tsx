'use client';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
    type RefCallback
} from 'react';
import { flushSync } from 'react-dom';

export type SortLongPressProps = {
    'data-sort-long-press': true;
    'data-sort-label': string;
    onClickCapture: (event: MouseEvent<HTMLElement>) => void;
    onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
};

type SortKeyboardProps = {
    'aria-label': string;
    'data-swipe-reveal-ignore': true;
    disabled: boolean;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

type PendingPressState = {
    currentTarget: HTMLElement;
    id: string;
    latestY: number;
    onWindowPointerCancel: (event: globalThis.PointerEvent) => void;
    onWindowPointerMove: (event: globalThis.PointerEvent) => void;
    onWindowPointerUp: (event: globalThis.PointerEvent) => void;
    pointerId: number;
    startX: number;
    startY: number;
    timer: number;
};

type DragState = {
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
const longPressDuration = 350;
const longPressMovementTolerance = 8;
const maximumAutoScrollVelocity = 0.22;

export function useSortableList<T>({
    getId,
    getLabel,
    items,
    onReorder,
    previewSelector
}: {
    getId: (item: T) => string;
    getLabel: (item: T) => string;
    items: T[];
    onReorder: (ids: string[]) => void;
    previewSelector?: string;
}): {
    containerRef: RefCallback<HTMLDivElement>;
    getKeyboardProps: (item: T, disabled?: boolean) => SortKeyboardProps;
    getLongPressProps: (item: T, disabled?: boolean) => SortLongPressProps;
    orderedItems: T[];
} {
    const rootRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const pendingPressRef = useRef<PendingPressState | null>(null);
    const overlayRef = useRef<HTMLElement | null>(null);
    const releaseTimerRef = useRef<number | null>(null);
    const suppressClickRef = useRef(false);
    const suppressClickTimerRef = useRef<number | null>(null);
    const sortAnimationsRef = useRef(new Map<string, Animation>());
    const [order, setOrder] = useState<string[] | null>(null);
    const itemById = new Map(items.map((item) => [getId(item), item]));
    const sourceOrder = items.map(getId);
    const visibleOrder =
        order?.length === sourceOrder.length &&
        order.every((id) => itemById.has(id))
            ? order
            : sourceOrder;
    const orderedItems = visibleOrder
        .map((id) => itemById.get(id))
        .filter((item): item is T => item !== undefined);
    const containerRef = useCallback((element: HTMLDivElement | null) => {
        rootRef.current = element;
    }, []);
    const sortableElements = () =>
        Array.from(rootRef.current?.children ?? []).filter(
            (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                element.dataset.sortableItem === 'true'
        );
    const previewElement = (sortableItem: HTMLElement) => {
        const preview = previewSelector
            ? sortableItem.querySelector(previewSelector)
            : null;

        return preview instanceof HTMLElement ? preview : sortableItem;
    };
    const clearShiftStyles = () => {
        for (const element of sortableElements()) {
            element.removeAttribute('data-sort-shifting');
            element.style.removeProperty('transform');
        }
    };

    useEffect(
        () => () => {
            const press = pendingPressRef.current;

            if (press) {
                window.clearTimeout(press.timer);
                window.removeEventListener(
                    'pointerup',
                    press.onWindowPointerUp
                );
                window.removeEventListener(
                    'pointercancel',
                    press.onWindowPointerCancel
                );
                window.removeEventListener(
                    'pointermove',
                    press.onWindowPointerMove
                );
                press.currentTarget.removeAttribute('data-long-press-pending');
            }
            const drag = dragRef.current;

            if (drag) {
                window.removeEventListener('pointerup', drag.onWindowPointerUp);
                window.removeEventListener(
                    'pointercancel',
                    drag.onWindowPointerCancel
                );
                window.removeEventListener(
                    'pointermove',
                    drag.onWindowPointerMove
                );
                window.removeEventListener('touchmove', drag.onWindowTouchMove);
                drag.handle.removeAttribute('data-long-press-active');
                if (drag.autoScrollFrame !== null)
                    window.cancelAnimationFrame(drag.autoScrollFrame);
            }
            for (const animation of sortAnimationsRef.current.values())
                animation.cancel();
            sortAnimationsRef.current.clear();
            if (releaseTimerRef.current !== null)
                window.clearTimeout(releaseTimerRef.current);
            if (suppressClickTimerRef.current !== null)
                window.clearTimeout(suppressClickTimerRef.current);
            for (const element of Array.from(rootRef.current?.children ?? [])) {
                if (
                    !(element instanceof HTMLElement) ||
                    element.dataset.sortableItem !== 'true'
                )
                    continue;
                element.removeAttribute('data-dragging');
                element.removeAttribute('data-sort-shifting');
                element.style.removeProperty('transform');
            }
            rootRef.current?.removeAttribute('data-drag-active');
            overlayRef.current?.remove();
        },
        []
    );

    const animateOrder = (
        next: string[],
        activeId?: string,
        beforeCommit?: () => void
    ) => {
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
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
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
    };
    const updateTarget = (drag: DragState, clientY: number) => {
        const sortableItems = sortableElements();
        const slotCenters = sortableItems.map((element) => {
            const rect = element.getBoundingClientRect();
            const transform = getComputedStyle(element).transform;
            const translatedY =
                transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
            const activatorRect = element
                .querySelector<HTMLElement>('[data-sort-long-press]')
                ?.getBoundingClientRect();

            return (
                (activatorRect
                    ? activatorRect.top + activatorRect.height / 2
                    : rect.top + rect.height / 2) - translatedY
            );
        });
        let targetIndex = drag.targetIndex;

        while (
            targetIndex < slotCenters.length - 1 &&
            clientY >
                (slotCenters[targetIndex]! + slotCenters[targetIndex + 1]!) /
                    2 +
                    8
        )
            targetIndex += 1;
        while (
            targetIndex > 0 &&
            clientY <
                (slotCenters[targetIndex - 1]! + slotCenters[targetIndex]!) /
                    2 -
                    8
        )
            targetIndex -= 1;
        if (targetIndex === drag.targetIndex) return;
        drag.targetIndex = targetIndex;
        const initialIndex = drag.initialOrder.indexOf(drag.draggedId);
        const next = [...drag.initialOrder];
        const [moved] = next.splice(initialIndex, 1);

        next.splice(targetIndex, 0, moved!);
        drag.currentOrder = next;
        const heights = sortableItems.map(
            (element) => element.getBoundingClientRect().height
        );
        const activeShift =
            initialIndex < targetIndex
                ? heights
                      .slice(initialIndex + 1, targetIndex + 1)
                      .reduce((total, height) => total + height, 0)
                : -heights
                      .slice(targetIndex, initialIndex)
                      .reduce((total, height) => total + height, 0);

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
    };
    const stopAutoScroll = (drag: DragState) => {
        if (drag.autoScrollFrame !== null)
            window.cancelAnimationFrame(drag.autoScrollFrame);
        drag.autoScrollFrame = null;
        drag.autoScrollVelocity = 0;
        drag.desiredAutoScrollVelocity = 0;
    };
    const continueAutoScroll = (drag: DragState) => {
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
            const scrollContainer = rootRef.current?.closest('.app-content');

            if (scrollContainer instanceof HTMLElement) {
                const previousScrollTop = scrollContainer.scrollTop;

                scrollContainer.scrollTop += drag.autoScrollVelocity * elapsed;
                if (scrollContainer.scrollTop !== previousScrollTop)
                    updateTarget(drag, drag.currentY);
            }
            drag.autoScrollFrame = window.requestAnimationFrame(tick);
        };

        drag.autoScrollFrame = window.requestAnimationFrame(tick);
    };
    const finish = (pointerId: number, cancelled: boolean) => {
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
        } else if (
            !cancelled &&
            !sameOrder(drag.initialOrder, drag.currentOrder)
        ) {
            animateOrder(drag.currentOrder, drag.draggedId, clearShiftStyles);
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
    };
    const moveDrag = (
        pointerId: number,
        clientY: number,
        event: { preventDefault: () => void }
    ) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== pointerId || drag.finishing) return;
        event.preventDefault();
        drag.currentY = clientY;
        drag.overlay.style.transform = `translate3d(0, ${clientY - drag.pointerStartY}px, 0) scale(1.012)`;
        updateTarget(drag, clientY);
        const scrollContainer = rootRef.current?.closest('.app-content');

        if (scrollContainer instanceof HTMLElement) {
            const rect = scrollContainer.getBoundingClientRect();
            const bottomNav =
                document.querySelector<HTMLElement>('.bottom-nav');
            const bottomNavTop =
                bottomNav && getComputedStyle(bottomNav).display !== 'none'
                    ? bottomNav.getBoundingClientRect().top
                    : rect.bottom;
            const topEdge = rect.top + 100;
            const bottomEdge = bottomNavTop - 100;
            const topRatio = Math.max(
                0,
                Math.min(1, (topEdge - clientY) / 100)
            );
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
            continueAutoScroll(drag);
        }
    };
    const startDrag = (
        handle: HTMLElement,
        id: string,
        pointerId: number,
        clientY: number
    ) => {
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
        for (const className of source.closest('.category-section')
            ?.classList ?? [])
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
            finish(event.pointerId, false);
        const onWindowPointerCancel = (event: globalThis.PointerEvent) =>
            finish(event.pointerId, true);
        const onWindowPointerMove = (event: globalThis.PointerEvent) =>
            moveDrag(event.pointerId, event.clientY, event);
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
    };
    const cancelPendingPress = () => {
        const press = pendingPressRef.current;

        if (!press) return;
        window.clearTimeout(press.timer);
        window.removeEventListener('pointerup', press.onWindowPointerUp);
        window.removeEventListener(
            'pointercancel',
            press.onWindowPointerCancel
        );
        window.removeEventListener('pointermove', press.onWindowPointerMove);
        press.currentTarget.removeAttribute('data-long-press-pending');
        pendingPressRef.current = null;
    };
    const beginLongPress = (
        event: PointerEvent<HTMLElement>,
        id: string,
        disabled: boolean
    ) => {
        if (
            disabled ||
            event.button !== 0 ||
            dragRef.current ||
            pendingPressRef.current
        )
            return;
        const target = event.target;

        if (
            !(target instanceof Element) ||
            target.closest(
                'input, textarea, select, [contenteditable="true"], [data-sort-long-press-ignore]'
            )
        )
            return;
        const { clientX, clientY, currentTarget, pointerId } = event;
        const onWindowPointerMove = (pointerEvent: globalThis.PointerEvent) => {
            const press = pendingPressRef.current;

            if (!press || pointerEvent.pointerId !== press.pointerId) return;
            press.latestY = pointerEvent.clientY;
            if (
                Math.hypot(
                    pointerEvent.clientX - press.startX,
                    pointerEvent.clientY - press.startY
                ) > longPressMovementTolerance
            )
                cancelPendingPress();
        };
        const onWindowPointerUp = (pointerEvent: globalThis.PointerEvent) => {
            if (pointerEvent.pointerId === pendingPressRef.current?.pointerId)
                cancelPendingPress();
        };
        const onWindowPointerCancel = (
            pointerEvent: globalThis.PointerEvent
        ) => {
            if (pointerEvent.pointerId === pendingPressRef.current?.pointerId)
                cancelPendingPress();
        };
        const timer = window.setTimeout(() => {
            const press = pendingPressRef.current;

            if (
                !press ||
                press.pointerId !== pointerId ||
                !press.currentTarget.isConnected
            )
                return;
            const activationTarget = press.currentTarget;
            const activationY = press.latestY;

            cancelPendingPress();
            suppressClickRef.current = true;
            if (suppressClickTimerRef.current !== null)
                window.clearTimeout(suppressClickTimerRef.current);
            suppressClickTimerRef.current = window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 700);
            startDrag(activationTarget, id, pointerId, activationY);
        }, longPressDuration);

        pendingPressRef.current = {
            currentTarget,
            id,
            latestY: clientY,
            onWindowPointerCancel,
            onWindowPointerMove,
            onWindowPointerUp,
            pointerId,
            startX: clientX,
            startY: clientY,
            timer
        };
        currentTarget.dataset.longPressPending = 'true';
        window.addEventListener('pointerup', onWindowPointerUp);
        window.addEventListener('pointercancel', onWindowPointerCancel);
        window.addEventListener('pointermove', onWindowPointerMove, {
            passive: true
        });
    };
    const reorderWithKeyboard = (
        event: KeyboardEvent<HTMLButtonElement>,
        id: string
    ) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const ids = items.map(getId);
        const fromIndex = ids.indexOf(id);
        const toIndex = event.key === 'ArrowUp' ? fromIndex - 1 : fromIndex + 1;

        if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) return;
        const [moved] = ids.splice(fromIndex, 1);

        ids.splice(toIndex, 0, moved!);
        animateOrder(ids);
        onReorder(ids);
        releaseTimerRef.current = window.setTimeout(() => setOrder(null), 380);
    };
    const getLongPressProps = (
        item: T,
        disabled = false
    ): SortLongPressProps => {
        const id = getId(item);

        return {
            'data-sort-long-press': true,
            'data-sort-label': `Reorder ${getLabel(item)}`,
            onClickCapture: (event) => {
                if (!suppressClickRef.current) return;
                suppressClickRef.current = false;
                if (suppressClickTimerRef.current !== null)
                    window.clearTimeout(suppressClickTimerRef.current);
                event.preventDefault();
                event.stopPropagation();
            },
            onContextMenu: (event) => event.preventDefault(),
            onPointerDown: (event) => beginLongPress(event, id, disabled)
        };
    };
    const getKeyboardProps = (item: T, disabled = false): SortKeyboardProps => {
        const id = getId(item);

        return {
            'aria-label': `Reorder ${getLabel(item)}. Use the up and down arrow keys.`,
            'data-swipe-reveal-ignore': true,
            disabled,
            onKeyDown: (event) => reorderWithKeyboard(event, id)
        };
    };

    return { containerRef, getKeyboardProps, getLongPressProps, orderedItems };
}
