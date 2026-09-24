'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import betterBuddy from './better-buddy.png';

/**
 * Starts every float, spin, and shadow animation at the document timeline's
 * origin, so the launcher and the chat seat are always in the same pose.
 */
function alignToTimeline(figure: HTMLSpanElement | null) {
    if (!figure) return;
    for (const animation of figure.getAnimations({ subtree: true }))
        animation.startTime = 0;
}

function findAnimation(animations: Animation[], name: string) {
    return animations.find(
        (animation): animation is CSSAnimation =>
            animation instanceof CSSAnimation &&
            animation.animationName === name
    );
}

/**
 * Re-locks the floor shadow to the float after both resume from a pause, since
 * an element and its pseudo-element can restart a frame apart and drift out of
 * step. Call it right after removing the attribute that paused them;
 * `getAnimations` flushes that style change first.
 */
export function resyncFloorShadow(root: HTMLElement) {
    const animations = root.getAnimations({ subtree: true });
    const float = findAnimation(animations, 'buddy-float');
    const shadow = findAnimation(animations, 'buddy-shadow');

    if (!float || !shadow) return;
    void Promise.all([float.ready, shadow.ready]).then(() => {
        if (float.playState === 'running' && shadow.playState === 'running')
            shadow.startTime = float.startTime;
    });
}

/**
 * Restarts the float, spin, and floor-shadow cycles together, so Better Buddy
 * sits at the bottom of his hover facing front, with the spin cycle's idle
 * stretch ahead before he turns again.
 */
export function restartIdle(root: HTMLElement) {
    const animations = root.getAnimations({ subtree: true });

    for (const name of ['buddy-float', 'buddy-spin', 'buddy-shadow']) {
        const animation = findAnimation(animations, name);

        if (animation) animation.currentTime = 0;
    }
}

/**
 * Better Buddy floating over a soft glow and a floor shadow that shrinks as he
 * rises. Both are gradients rather than a filter, so nothing clips them.
 */
export function BetterBuddyFigure({
    size,
    className = '',
    priority = false
}: {
    size: number;
    className?: string;
    priority?: boolean;
}) {
    return (
        <span
            ref={alignToTimeline}
            className={`buddy-figure ${className}`}
            style={{ '--buddy-size': `${size}px` } as CSSProperties}
            aria-hidden='true'
        >
            <span className='buddy-figure-body'>
                <Image
                    className='buddy-figure-art'
                    src={betterBuddy}
                    alt=''
                    width={size}
                    height={size}
                    draggable={false}
                    priority={priority}
                    unoptimized
                />
            </span>
        </span>
    );
}
