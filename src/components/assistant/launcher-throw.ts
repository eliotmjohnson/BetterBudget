import {
    createPointerTrack,
    getCoalescedPointerSamples,
    recordPointerSamples,
    releaseVelocity,
    type PointerTrack
} from '@/components/ui/gesture-release';

const PROJECTION_DECELERATION = 0.995;
const MAX_THROW_SPEED = 4;
const SPRING_STIFFNESS = 200;
const SPRING_DAMPING_RATIO = 0.78;
const SPRING_FREQUENCY = Math.sqrt(SPRING_STIFFNESS);
const SPRING_DAMPING = 2 * SPRING_DAMPING_RATIO * SPRING_FREQUENCY;
const AWAY_SPEED_LIMIT = 1000;
const STEP_SECONDS = 0.001;
const FRAME_SECONDS = 1 / 60;
const MAX_SETTLE_SECONDS = 1.2;
const REST_DISTANCE = 0.5;
const REST_SPEED = 20;

export interface ThrowTracks {
    x: PointerTrack;
    y: PointerTrack;
}

export interface Velocity {
    x: number;
    y: number;
}

export function createThrowTracks(event: PointerEvent): ThrowTracks {
    return {
        x: createPointerTrack(event, 'clientX'),
        y: createPointerTrack(event, 'clientY')
    };
}

export function recordThrow(tracks: ThrowTracks, event: PointerEvent) {
    const samples = getCoalescedPointerSamples(event);

    recordPointerSamples(tracks.x, samples);
    recordPointerSamples(tracks.y, samples);
}

/** Release velocity in px/ms, capped in magnitude so a jittery sample cannot fling Better Buddy across the screen. */
export function throwVelocity(
    tracks: ThrowTracks,
    event: PointerEvent
): Velocity {
    const samples = getCoalescedPointerSamples(event);
    const x = releaseVelocity(tracks.x, event, samples);
    const y = releaseVelocity(tracks.y, event, samples);
    const speed = Math.hypot(x, y);
    const scale = speed > MAX_THROW_SPEED ? MAX_THROW_SPEED / speed : 1;

    return { x: x * scale, y: y * scale };
}

/** Distance a release velocity (px/ms) coasts under per-millisecond exponential deceleration. */
export function projectThrow(velocity: number) {
    return (velocity * PROJECTION_DECELERATION) / (1 - PROJECTION_DECELERATION);
}

function springVelocity(offset: number, velocity: number) {
    const perSecond = velocity * 1000;

    if (perSecond * offset < 0)
        return (
            Math.sign(perSecond) *
            Math.min(Math.abs(perSecond), Math.abs(offset) * SPRING_FREQUENCY)
        );

    return (
        Math.sign(perSecond) * Math.min(Math.abs(perSecond), AWAY_SPEED_LIMIT)
    );
}

/**
 * Samples a damped spring from the drop offset to rest into linear keyframes,
 * one per frame, so the settle runs as a single Web Animation.
 */
export function settleKeyframes(
    offsetX: number,
    offsetY: number,
    velocity: Velocity
) {
    let x = offsetX;
    let y = offsetY;
    let vx = springVelocity(offsetX, velocity.x);
    let vy = springVelocity(offsetY, velocity.y);
    let elapsed = 0;
    let nextFrame = FRAME_SECONDS;
    const frames: { x: number; y: number; time: number }[] = [
        { x, y, time: 0 }
    ];

    while (elapsed < MAX_SETTLE_SECONDS) {
        vx += (-SPRING_STIFFNESS * x - SPRING_DAMPING * vx) * STEP_SECONDS;
        vy += (-SPRING_STIFFNESS * y - SPRING_DAMPING * vy) * STEP_SECONDS;
        x += vx * STEP_SECONDS;
        y += vy * STEP_SECONDS;
        elapsed += STEP_SECONDS;
        if (elapsed < nextFrame) continue;
        nextFrame += FRAME_SECONDS;
        frames.push({ x, y, time: elapsed });
        if (Math.hypot(x, y) < REST_DISTANCE && Math.hypot(vx, vy) < REST_SPEED)
            break;
    }

    const duration = Math.max(elapsed, FRAME_SECONDS);

    return {
        duration: Math.round(duration * 1000),
        keyframes: frames.map((frame, index) => ({
            offset: index === frames.length - 1 ? 1 : frame.time / duration,
            transform:
                index === frames.length - 1
                    ? 'translate3d(0px, 0px, 0)'
                    : `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`
        }))
    };
}
