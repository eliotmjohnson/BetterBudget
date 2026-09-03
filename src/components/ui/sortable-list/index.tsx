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
import {
    animateOrder,
    startDrag,
    type DragContext,
    type DragState
} from './drag';

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

const longPressDuration = 350;
const longPressMovementTolerance = 8;

export function useSortableList<T>({
    getId,
    getLabel,
    items,
    onReorder,
    overlayLayer = 'base',
    previewSelector,
    scrollContainerSelector = '.app-content'
}: {
    getId: (item: T) => string;
    getLabel: (item: T) => string;
    items: T[];
    onReorder: (ids: string[]) => void;
    overlayLayer?: 'base' | 'nested';
    previewSelector?: string;
    scrollContainerSelector?: string;
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
    const scrollContainer = () => {
        const container = rootRef.current?.closest(scrollContainerSelector);

        return container instanceof HTMLElement ? container : null;
    };
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

    const dragContext = (): DragContext<T> => ({
        clearShiftStyles,
        dragRef,
        getId,
        items,
        onReorder,
        overlayLayer,
        overlayRef,
        previewElement,
        releaseTimerRef,
        rootRef,
        scrollContainer,
        setOrder,
        sortAnimationsRef,
        sortableElements
    });
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
            startDrag(dragContext(), {
                clientY: activationY,
                handle: activationTarget,
                id,
                pointerId
            });
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
        animateOrder(dragContext(), ids);
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
