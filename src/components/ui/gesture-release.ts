export type PointerAxis = 'clientX' | 'clientY';

export interface PointerTrack {
    axis: PointerAxis;
    samples: { position: number; time: number }[];
}

const velocityWindow = 80;
const releaseStaleTime = 60;
const minimumExitDuration = 160;
const maximumExitDuration = 400;
const maximumFlickExitDuration = 300;
const flickExitVelocity = 0.55;
const minimumExitSpeed = 0.5;
const exitDurationScale = 1.6;
const exitCurveX1 = 0.3;
const exitCurveMinimumY1 = 0.3;

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

export function createPointerTrack(
    event: PointerEvent,
    axis: PointerAxis
): PointerTrack {
    return {
        axis,
        samples: [{ position: event[axis], time: event.timeStamp }]
    };
}

export function recordPointerSamples(
    track: PointerTrack,
    samples: readonly PointerEvent[]
) {
    for (const sample of samples) {
        const last = track.samples[track.samples.length - 1];

        if (last && sample.timeStamp <= last.time) continue;
        track.samples.push({
            position: sample[track.axis],
            time: sample.timeStamp
        });
    }

    const newest = track.samples[track.samples.length - 1];

    if (!newest) return;
    while (
        track.samples.length > 2 &&
        (track.samples[0]?.time ?? newest.time) < newest.time - velocityWindow
    )
        track.samples.shift();
}

export function releaseVelocity(
    track: PointerTrack,
    release: PointerEvent,
    samples: readonly PointerEvent[]
) {
    const last = track.samples[track.samples.length - 1];

    if (last && release[track.axis] !== last.position)
        recordPointerSamples(track, samples);

    const newest = track.samples[track.samples.length - 1];

    if (!newest || release.timeStamp - newest.time > releaseStaleTime) return 0;
    const recent = track.samples.filter(
        (sample) => sample.time >= newest.time - velocityWindow
    );

    if (recent.length < 2) return 0;
    const meanTime =
        recent.reduce((sum, sample) => sum + sample.time, 0) / recent.length;
    const meanPosition =
        recent.reduce((sum, sample) => sum + sample.position, 0) /
        recent.length;
    let covariance = 0;
    let variance = 0;

    for (const sample of recent) {
        covariance +=
            (sample.time - meanTime) * (sample.position - meanPosition);
        variance += (sample.time - meanTime) ** 2;
    }

    return variance > 0 ? covariance / variance : 0;
}

export function exitMotion(remaining: number, velocity: number) {
    const distance = Math.max(1, remaining);
    const duration = Math.round(
        Math.min(
            velocity >= flickExitVelocity
                ? maximumFlickExitDuration
                : maximumExitDuration,
            Math.max(
                minimumExitDuration,
                (distance / Math.max(velocity, minimumExitSpeed)) *
                    exitDurationScale
            )
        )
    );
    const normalizedVelocity = (Math.max(0, velocity) * duration) / distance;
    const y1 = Math.min(
        1,
        Math.max(exitCurveMinimumY1, normalizedVelocity * exitCurveX1)
    );

    return {
        duration,
        transition: `transform ${duration}ms cubic-bezier(${exitCurveX1}, ${y1.toFixed(3)}, 0.21, 1)`
    };
}
