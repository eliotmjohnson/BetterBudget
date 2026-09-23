const holdDuration = 450;
const holdMovementTolerance = 8;
const releaseClickWindow = 600;

export type HoldStart = {
    clientX: number;
    clientY: number;
    pointerId: number;
};

export function beginHoldPress(
    element: HTMLElement,
    start: HoldStart,
    onHold: () => void
) {
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        delete element.dataset.holdPending;
    };
    const onMove = (event: PointerEvent) => {
        if (
            event.pointerId === start.pointerId &&
            Math.hypot(
                event.clientX - start.clientX,
                event.clientY - start.clientY
            ) > holdMovementTolerance
        )
            finish();
    };
    const onEnd = (event: PointerEvent) => {
        if (event.pointerId === start.pointerId) finish();
    };
    const timer = window.setTimeout(() => {
        finish();
        if (element.isConnected) onHold();
    }, holdDuration);

    element.dataset.holdPending = 'true';
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    return finish;
}

function swallowReleaseClick() {
    const remove = () => {
        window.clearTimeout(timer);
        window.removeEventListener('click', swallow, true);
    };
    const swallow = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        remove();
    };
    const timer = window.setTimeout(remove, releaseClickWindow);

    window.addEventListener('click', swallow, true);
}

export function followHeldPointer(
    pointerId: number,
    {
        onMove,
        onRelease
    }: {
        onMove: (clientX: number, clientY: number) => void;
        onRelease: (clientX: number, clientY: number) => void;
    }
) {
    let following = true;
    const stop = () => {
        if (!following) return;
        following = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        window.removeEventListener('touchmove', holdStill);
    };
    const move = (event: PointerEvent) => {
        if (event.pointerId === pointerId) onMove(event.clientX, event.clientY);
    };
    const release = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        stop();
        swallowReleaseClick();
        if (event.type === 'pointerup') onRelease(event.clientX, event.clientY);
    };
    const holdStill = (event: TouchEvent) => {
        if (event.cancelable) event.preventDefault();
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('touchmove', holdStill, { passive: false });

    return stop;
}
