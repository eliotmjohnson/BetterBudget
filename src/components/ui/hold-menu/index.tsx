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
import { beginHoldPress, followHeldPointer } from './press';
import { HoldMenuSurface, type HoldMenuAction, type OpenMenu } from './surface';

export type { HoldMenuAction } from './surface';

export type HoldMenuTriggerProps = {
    'data-hold-menu-trigger': true;
    onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
};

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
        if (menuRef.current) delete menuRef.current.trigger.dataset.holdOpen;
        setHighlighted(null);
        setOpen(false);
    }, []);
    const select = useCallback(
        (action: HoldMenuAction) => {
            const trigger = menuRef.current?.trigger;

            if (!trigger) return;
            pendingActionRef.current = () => action.onSelect(trigger);
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
        heldPointerId: number | null
    ) => {
        if (openRef.current) return;
        const next: OpenMenu = {
            focusVisible:
                heldPointerId === null && trigger.matches(':focus-visible'),
            groups: groups(),
            id: (menuRef.current?.id ?? 0) + 1,
            label,
            rect: trigger.getBoundingClientRect(),
            trigger
        };

        openRef.current = true;
        menuRef.current = next;
        trigger.dataset.holdOpen = 'true';
        setMenu(next);
        setHighlighted(null);
        setOpen(true);
        if (heldPointerId === null) return;
        stopFollowingRef.current = followHeldPointer(heldPointerId, {
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
                () => show(trigger, label, groups, pointerId)
            );
        }
    });

    return {
        getTriggerProps,
        menu: menu ? (
            <HoldMenuSurface
                highlighted={highlighted}
                menu={menu}
                open={open}
                panelRef={panelRef}
                onClose={close}
                onSelect={select}
            />
        ) : null
    };
}
