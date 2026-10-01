const overflows = (overflow: string) =>
    overflow === 'auto' || overflow === 'scroll';

function scrollerOf(target: EventTarget | null) {
    for (
        let node = target instanceof HTMLElement ? target : null;
        node && node !== document.body;
        node = node.parentElement
    ) {
        const style = getComputedStyle(node);

        if (overflows(style.overflowY) && node.scrollHeight > node.clientHeight)
            return { node, vertical: true };
        if (overflows(style.overflowX) && node.scrollWidth > node.clientWidth)
            return { node, vertical: false };
    }

    return null;
}

/**
 * Whether a vertical drag of `dy` (positive moving down) still has room to
 * scroll `scroller` in its direction.
 */
function hasRoom(scroller: HTMLElement, dy: number) {
    const max = scroller.scrollHeight - scroller.clientHeight;

    return dy > 0 ? scroller.scrollTop > 0 : scroller.scrollTop < max - 0.5;
}

/**
 * Stops a one-finger drag from panning the screen while `field` has focus.
 * With the keyboard up, the visual viewport is shorter than the page, and iOS
 * pans it under a drag that no scroll container takes, such as one on a sheet
 * whose content fits or on the overlay around it: the header, the sheet, and
 * everything else slid up under the status bar, and `pinPageWhileFocused`
 * snapped them back mid-drag. iOS also hands the viewport a drag that starts
 * inside a scroll container already at its end in the drag's direction, such
 * as the Better Buddy thread, which rests on its latest message while the
 * keyboard is up, so that drag is stopped too. A drag a scroll container can
 * take, in either axis, is left to it. It stops on `blur`, or on the first
 * touch after the field has lost focus without one, as Safari does not blur
 * a focused field that leaves the page, such as the chat's composer when the
 * chat closes.
 */
export function holdViewportWhileFocused(field: HTMLElement) {
    let startY = 0;
    const start = (event: TouchEvent) => {
        startY = event.touches[0]?.clientY ?? 0;
    };
    const guard = (event: TouchEvent) => {
        if (document.activeElement !== field) {
            stop();

            return;
        }
        if (!event.cancelable || event.touches.length !== 1) return;
        const scroller = scrollerOf(event.target);
        const dy = (event.touches[0]?.clientY ?? startY) - startY;

        if (
            !scroller ||
            (scroller.vertical && dy !== 0 && !hasRoom(scroller.node, dy))
        )
            event.preventDefault();
    };
    const stop = () => {
        document.removeEventListener('touchstart', start);
        document.removeEventListener('touchmove', guard);
        field.removeEventListener('blur', stop);
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', guard, { passive: false });
    field.addEventListener('blur', stop);
}
