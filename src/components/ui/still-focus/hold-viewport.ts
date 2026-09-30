function scrolls(element: Element) {
    const style = getComputedStyle(element);
    const overflows = (overflow: string) =>
        overflow === 'auto' || overflow === 'scroll';

    return (
        (overflows(style.overflowY) &&
            element.scrollHeight > element.clientHeight) ||
        (overflows(style.overflowX) &&
            element.scrollWidth > element.clientWidth)
    );
}

function insideScroller(target: EventTarget | null) {
    for (
        let node = target instanceof Element ? target : null;
        node && node !== document.body;
        node = node.parentElement
    )
        if (scrolls(node)) return true;

    return false;
}

/**
 * Stops a one-finger drag from panning the screen while `field` has focus.
 * With the keyboard up, the visual viewport is shorter than the page, and iOS
 * pans it under a drag that no scroll container takes, such as one on a sheet
 * whose content fits or on the overlay around it: the header, the sheet, and
 * everything else slid up under the status bar, and `pinPageWhileFocused`
 * snapped them back mid-drag. A drag inside anything that can scroll, such as
 * the page's list or a sheet body with more content than room, is left to it.
 */
export function holdViewportWhileFocused(field: HTMLElement) {
    const guard = (event: TouchEvent) => {
        if (
            event.cancelable &&
            event.touches.length === 1 &&
            !insideScroller(event.target)
        )
            event.preventDefault();
    };
    const stop = () => {
        document.removeEventListener('touchmove', guard);
        field.removeEventListener('blur', stop);
    };

    document.addEventListener('touchmove', guard, { passive: false });
    field.addEventListener('blur', stop);
}
