export const previewInset = 12;
const menuGap = 10;

type Box = { top: number; right: number; bottom: number; left: number };

export type HoldMenuPlacement = {
    menuLeft: number;
    menuOrigin: 'top' | 'bottom';
    menuTop: number;
    previewShift: number;
};

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));

export function placeHoldMenu({
    bounds,
    menu,
    trigger
}: {
    bounds: Box;
    menu: { height: number; width: number };
    trigger: Box;
}): HoldMenuPlacement {
    const previewHeight = trigger.bottom - trigger.top;
    const menuLeft = clamp(
        trigger.left - previewInset,
        bounds.left,
        bounds.right - menu.width
    );
    const visibleTop = Math.max(trigger.top, bounds.top);

    if (visibleTop + previewHeight + menuGap + menu.height <= bounds.bottom)
        return {
            menuLeft,
            menuOrigin: 'top',
            menuTop: visibleTop + previewHeight + menuGap,
            previewShift: visibleTop - trigger.top
        };
    if (
        trigger.bottom <= bounds.bottom &&
        trigger.top - menuGap - menu.height >= bounds.top
    )
        return {
            menuLeft,
            menuOrigin: 'bottom',
            menuTop: trigger.top - menuGap - menu.height,
            previewShift: 0
        };
    const shiftedTop = Math.max(
        bounds.top,
        bounds.bottom - menu.height - menuGap - previewHeight
    );

    return {
        menuLeft,
        menuOrigin: 'top',
        menuTop: shiftedTop + previewHeight + menuGap,
        previewShift: shiftedTop - trigger.top
    };
}

export function layerBounds(layer: HTMLElement): Box {
    const style = getComputedStyle(layer);

    return {
        top: parseFloat(style.paddingTop),
        right: layer.clientWidth - parseFloat(style.paddingRight),
        bottom: layer.clientHeight - parseFloat(style.paddingBottom),
        left: parseFloat(style.paddingLeft)
    };
}
