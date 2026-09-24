'use client';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEvent,
    type PointerEvent,
    type ReactNode
} from 'react';
import { restoreSheetFocus } from '../sheet';
import { beginHoldPress, followHeldPointer, type HoldStart } from './press';
import { HoldMenuSurface, type HoldMenuAction, type OpenMenu } from './surface';

export type { HoldMenuAction } from './surface';

export type HoldMenuTriggerProps = {
    'data-hold-menu-trigger': true;
    onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
};

/**
 * The trigger's box without its own transform. A held row is still easing
 * back from its pressed 0.97 scale when the menu opens, so its bounding rect
 * would be about 3% too small; the transform scales around the center, so the
 * center is kept and the untransformed border-box size is restored.
 */
function untransformedRect(trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const style = getComputedStyle(trigger);
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);

    return new DOMRect(
        rect.left + rect.width / 2 - width / 2,
        rect.top + rect.height / 2 - height / 2,
        width,
        height
    );
}

type GetTriggerProps = (
    label: string,
    groups: () => HoldMenuAction[][]
) => HoldMenuTriggerProps;

export function useHoldMenu(): {
    getTriggerProps: GetTriggerProps;
    menu: ReactNode;
} {
    const [menu, setMenu] = useState<OpenMenu | null>(null);
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState<string | null>(null);
    const [exitForAction, setExitForAction] = useState(false);
    const openRef = useRef(false);
    const menuRef = useRef<OpenMenu | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const cancelPressRef = useRef<(() => void) | null>(null);
    const stopFollowingRef = useRef<(() => void) | null>(null);
    const pendingActionRef = useRef<(() => void) | null>(null);
    const close = useCallback(() => {
        if (!openRef.current) return;
        openRef.current = false;
        stopFollowingRef.current?.();
        stopFollowingRef.current = null;
        setHighlighted(null);
        setOpen(false);
    }, []);
    const revealTrigger = useCallback(() => {
        if (menuRef.current && !openRef.current)
            delete menuRef.current.trigger.dataset.holdOpen;
    }, []);
    const select = useCallback(
        (action: HoldMenuAction) => {
            const trigger = menuRef.current?.trigger;

            if (!trigger || !openRef.current) return;
            pendingActionRef.current = () => action.onSelect(trigger);
            setExitForAction(true);
            close();
        },
        [close]
    );
    const actionAt = (clientX: number, clientY: number) => {
        const item = document
            .elementFromPoint(clientX, clientY)
            ?.closest<HTMLElement>('[data-hold-menu-key]');

        if (!item || !panelRef.current?.contains(item)) return null;

        return (
            menuRef.current?.groups
                .flat()
                .find((action) => action.key === item.dataset.holdMenuKey) ??
            null
        );
    };
    const show = (
        trigger: HTMLElement,
        label: string,
        groups: () => HoldMenuAction[][],
        held: HoldStart | null
    ) => {
        if (openRef.current) return;
        if (menuRef.current) delete menuRef.current.trigger.dataset.holdOpen;
        const next: OpenMenu = {
            focusVisible: held === null && trigger.matches(':focus-visible'),
            groups: groups(),
            held: held !== null,
            id: (menuRef.current?.id ?? 0) + 1,
            inDialog: trigger.closest('[role="dialog"]') !== null,
            label,
            rect: untransformedRect(trigger),
            trigger
        };

        openRef.current = true;
        menuRef.current = next;
        setMenu(next);
        setHighlighted(null);
        setExitForAction(false);
        setOpen(true);
        if (held === null) return;
        stopFollowingRef.current = followHeldPointer(held, {
            onMove: (clientX, clientY) =>
                setHighlighted(actionAt(clientX, clientY)?.key ?? null),
            onRelease: (clientX, clientY) => {
                const action = actionAt(clientX, clientY);

                if (action) select(action);
                else setHighlighted(null);
            }
        });
    };

    useEffect(() => {
        if (open || !menu) return;
        const pending = pendingActionRef.current;

        pendingActionRef.current = null;
        if (menu.trigger.isConnected)
            restoreSheetFocus(menu.trigger, menu.focusVisible);
        pending?.();
    }, [menu, open]);

    useEffect(
        () => () => {
            cancelPressRef.current?.();
            stopFollowingRef.current?.();
            if (menuRef.current)
                delete menuRef.current.trigger.dataset.holdOpen;
        },
        []
    );

    const getTriggerProps: GetTriggerProps = (label, groups) => ({
        'data-hold-menu-trigger': true,
        onContextMenu: (event) => {
            event.preventDefault();
            show(event.currentTarget, label, groups, null);
        },
        onPointerDown: (event) => {
            if (
                event.pointerType === 'mouse' ||
                event.button !== 0 ||
                !event.isPrimary ||
                openRef.current
            )
                return;
            const trigger = event.currentTarget;
            const { clientX, clientY, pointerId } = event;

            cancelPressRef.current?.();
            cancelPressRef.current = beginHoldPress(
                trigger,
                { clientX, clientY, pointerId },
                (latest) => show(trigger, label, groups, latest)
            );
        }
    });

    return {
        getTriggerProps,
        menu: menu ? (
            <HoldMenuSurface
                exitForAction={exitForAction}
                highlighted={highlighted}
                menu={menu}
                open={open}
                panelRef={panelRef}
                onClose={close}
                onExitComplete={revealTrigger}
                onSelect={select}
            />
        ) : null
    };
}
