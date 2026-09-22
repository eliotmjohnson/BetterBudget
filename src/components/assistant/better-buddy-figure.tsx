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
    );
}
