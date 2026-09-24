'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
    useCallback,
    type CSSProperties,
    type KeyboardEvent,
    type ReactNode,
    type RefObject
} from 'react';
import { useContinuousCorners } from '../continuous-corners';
import { layerBounds, placeHoldMenu, previewInset } from './layout';

export type HoldMenuAction = {
    key: string;
    label: string;
    icon: ReactNode;
    destructive?: boolean;
    onSelect: (trigger: HTMLElement) => void;
};

export type OpenMenu = {
    focusVisible: boolean;
    groups: HoldMenuAction[][];
    held: boolean;
    id: number;
    inDialog: boolean;
    label: string;
    rect: DOMRect;
    trigger: HTMLElement;
};

const navigationKeys = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

function clonePreview(trigger: HTMLElement) {
    const clone = trigger.cloneNode(true) as HTMLElement;

    for (const element of [clone, ...clone.querySelectorAll('[id]')])
        element.removeAttribute('id');
    delete clone.dataset.holdPending;
    delete clone.dataset.holdOpen;
    clone.setAttribute('tabindex', '-1');

    return clone;
}

function hideTrigger(trigger: HTMLElement) {
    trigger.dataset.holdOpen = 'true';
}

function focusSibling(panel: HTMLElement, key: string) {
    const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next =
        key === 'Home'
            ? 0
            : key === 'End'
              ? last
              : key === 'ArrowDown'
                ? current === last
                    ? 0
                    : current + 1
                : current <= 0
                  ? last
                  : current - 1;

    items[next]?.focus();
}

function placeMenu(layer: HTMLElement, panel: HTMLElement, trigger: DOMRect) {
    const placement = placeHoldMenu({
        bounds: layerBounds(layer),
        menu: { height: panel.offsetHeight, width: panel.offsetWidth },
        trigger
    });

    layer.style.setProperty(
        '--hold-menu-preview-shift',
        `${placement.previewShift}px`
    );
    layer.style.setProperty(
        '--hold-menu-settle-duration',
        placement.previewShift === 0 ? '0.26s' : '0.42s'
    );
    layer.dataset.travel = placement.previewShift === 0 ? 'false' : 'true';
    panel.style.top = `${placement.menuTop}px`;
    panel.style.left = `${placement.menuLeft}px`;
    panel.dataset.origin = placement.menuOrigin;
    layer.dataset.placed = 'true';
}

export function HoldMenuSurface({
    exitForAction,
    highlighted,
    menu,
    onClose,
    onExitComplete,
    onSelect,
    open,
    panelRef
}: {
    exitForAction: boolean;
    highlighted: string | null;
    menu: OpenMenu;
    onClose: () => void;
    onExitComplete: () => void;
    onSelect: (action: HoldMenuAction) => void;
    open: boolean;
    panelRef: RefObject<HTMLDivElement | null>;
}) {
    const [cornersRef] = useContinuousCorners<HTMLDivElement>();
    const setPanelRef = useCallback(
        (element: HTMLDivElement | null) => {
            panelRef.current = element;
            cornersRef(element);
            const layer = element?.parentElement;

            if (element && layer) placeMenu(layer, element, menu.rect);
        },
        [cornersRef, menu, panelRef]
    );
    const setPreviewRef = useCallback(
        (element: HTMLDivElement | null) => {
            if (!element) return;
            element.replaceChildren(clonePreview(menu.trigger));
            hideTrigger(menu.trigger);
        },
        [menu]
    );
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            onClose();

            return;
        }
        if (!navigationKeys.has(event.key)) return;
        event.preventDefault();
        focusSibling(event.currentTarget, event.key);
    };

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    className='hold-menu-overlay'
                    data-exit={exitForAction ? 'action' : undefined}
                />
                <Dialog.Content
                    key={menu.id}
                    className='hold-menu-layer'
                    data-exit={exitForAction ? 'action' : undefined}
                    data-held={menu.held ? 'true' : undefined}
                    data-context={menu.inDialog ? 'dialog' : 'page'}
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        const target = menu.focusVisible
                            ? panelRef.current?.querySelector<HTMLElement>(
                                  '[role="menuitem"]'
                              )
                            : panelRef.current;

                        target?.focus({ preventScroll: true });
                    }}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) onClose();
                    }}
                    onAnimationEnd={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            event.currentTarget.dataset.state === 'closed'
                        )
                            onExitComplete();
                    }}
                >
                    <Dialog.Title className='sr-only'>
                        {menu.label}
                    </Dialog.Title>
                    <div
                        ref={setPreviewRef}
                        className='hold-menu-preview'
                        aria-hidden='true'
                        inert
                        style={
                            {
                                '--hold-menu-row-left': `${menu.rect.left}px`,
                                '--hold-menu-row-width': `${menu.rect.width}px`,
                                top: menu.rect.top,
                                left: menu.rect.left - previewInset,
                                width: menu.rect.width + previewInset * 2,
                                height: menu.rect.height,
                                paddingInline: previewInset
                            } as CSSProperties
                        }
                    />
                    <div
                        ref={setPanelRef}
                        className='hold-menu'
                        role='menu'
                        aria-label={menu.label}
                        tabIndex={-1}
                        onKeyDown={handleKeyDown}
                    >
                        {menu.groups.map((group) => (
                            <div
                                className='hold-menu-group'
                                role='group'
                                key={group.map(({ key }) => key).join()}
                            >
                                {group.map((action) => (
                                    <button
                                        className='hold-menu-item'
                                        type='button'
                                        role='menuitem'
                                        tabIndex={-1}
                                        key={action.key}
                                        data-hold-menu-key={action.key}
                                        data-destructive={
                                            action.destructive
                                                ? 'true'
                                                : undefined
                                        }
                                        data-highlighted={
                                            highlighted === action.key
                                                ? 'true'
                                                : undefined
                                        }
                                        onClick={() => onSelect(action)}
                                    >
                                        <span
                                            className='hold-menu-item-icon'
                                            aria-hidden='true'
                                        >
                                            {action.icon}
                                        </span>
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
