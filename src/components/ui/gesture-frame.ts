export interface GestureFrameDriver {
    cancel: () => number | null;
    reset: (position: number) => void;
    schedule: (position: number) => void;
}

export interface GestureVelocityState {
    lastPosition: number;
    lastTime: number;
    velocity: number;
}

type PointerAxis = 'clientX' | 'clientY';

interface GestureFrameOptions {
    precision?: number;
    responseTime?: number;
    shouldInterpolate?: () => boolean;
    softLagThreshold?: number;
}

const defaultFrameDuration = 1000 / 60;
const defaultPrecision = 0.05;
const defaultResponseTime = 32;
const defaultSoftLagThreshold = 24;
const catchUpScalePerThreshold = 0.25;
const maximumCatchUpScale = 1.75;
const maximumFrameDuration = 32;
const velocityFilterTimeConstant = 41;

export function createGestureFrameDriver(
    writeFrame: (position: number) => void,
    {
        precision = defaultPrecision,
        responseTime = defaultResponseTime,
        shouldInterpolate,
        softLagThreshold = defaultSoftLagThreshold
    }: GestureFrameOptions = {}
): GestureFrameDriver {
    let animationFrame: number | null = null;
    let currentPosition: number | null = null;
    let lastFrameTime: number | null = null;
    let targetPosition = 0;
    const cancel = () => {
        if (animationFrame !== null) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        lastFrameTime = null;
        if (currentPosition !== null) targetPosition = currentPosition;

        return currentPosition;
    };
    const runFrame = (time: number) => {
        animationFrame = null;
        if (currentPosition === null) currentPosition = targetPosition;

        const elapsed =
            lastFrameTime === null
                ? defaultFrameDuration
                : Math.min(
                      maximumFrameDuration,
                      Math.max(1, time - lastFrameTime)
                  );
        const interpolate = shouldInterpolate?.() ?? true;
        const distance = targetPosition - currentPosition;

        lastFrameTime = time;
        if (!interpolate || Math.abs(distance) <= precision) {
            currentPosition = targetPosition;
        } else {
            const lagPressure = Math.max(
                0,
                Math.abs(distance) / Math.max(precision, softLagThreshold) - 1
            );
            const catchUpScale =
                1 +
                Math.min(
                    maximumCatchUpScale - 1,
                    lagPressure * catchUpScalePerThreshold
                );
            const blend =
                1 - Math.exp((-elapsed * catchUpScale) / responseTime);

            currentPosition += distance * blend;
            const remainingDistance = targetPosition - currentPosition;

            if (Math.abs(remainingDistance) <= precision)
                currentPosition = targetPosition;
        }

        writeFrame(currentPosition);
        if (currentPosition === targetPosition) {
            lastFrameTime = null;

            return;
        }
        animationFrame = window.requestAnimationFrame(runFrame);
    };

    return {
        cancel,
        reset(position) {
            cancel();
            currentPosition = position;
            targetPosition = position;
            writeFrame(position);
        },
        schedule(position) {
            targetPosition = position;
            if (currentPosition === null) currentPosition = position;
            animationFrame ??= window.requestAnimationFrame(runFrame);
        }
    };
}

export function getCoalescedPointerSamples(
    event: PointerEvent
): readonly PointerEvent[] {
    if (typeof event.getCoalescedEvents !== 'function') return [event];

    try {
        const samples = event.getCoalescedEvents();

        return samples.length > 0 ? samples : [event];
    } catch {
        return [event];
    }
}

export function getPredictedPointerSample(
    event: PointerEvent,
    fallback: PointerEvent
): PointerEvent {
    if (typeof event.getPredictedEvents !== 'function') return fallback;

    try {
        const samples = event.getPredictedEvents();

        return samples[0] ?? fallback;
    } catch {
        return fallback;
    }
}

export function listenForRawPointerUpdates(
    target: HTMLElement,
    listener: (event: PointerEvent) => void
) {
    const handleRawUpdate = (event: Event) => listener(event as PointerEvent);

    target.addEventListener('pointerrawupdate', handleRawUpdate, {
        passive: true
    });

    return () =>
        target.removeEventListener('pointerrawupdate', handleRawUpdate);
}

export function updateGestureVelocity(
    state: GestureVelocityState,
    samples: readonly PointerEvent[],
    axis: PointerAxis
) {
    for (const sample of samples) {
        const elapsed = sample.timeStamp - state.lastTime;

        if (elapsed <= 0) continue;

        const position = sample[axis];
        const instantaneousVelocity = (position - state.lastPosition) / elapsed;
        const filterWeight =
            1 - Math.exp(-elapsed / velocityFilterTimeConstant);

        state.velocity +=
            (instantaneousVelocity - state.velocity) * filterWeight;
        state.lastPosition = position;
        state.lastTime = sample.timeStamp;
    }
}
