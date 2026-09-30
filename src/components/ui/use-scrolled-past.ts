'use client';

import { type RefObject, useEffect, useState } from 'react';

/**
 * Reports whether the target has scrolled fully above the top of its
 * `.app-content` scroller: past the scroller's top padding plus `coveredTop`,
 * the height of anything docked over the content there. False until measured
 * and whenever the target is on screen or below it. Pass `mounted` as false
 * while the target is not rendered, so it is observed once it appears.
 */
export function useScrolledPast(
    targetRef: RefObject<HTMLElement | null>,
    coveredTop = 0,
    mounted = true
) {
    const [past, setPast] = useState(false);

    useEffect(() => {
        const target = targetRef.current;
        const scroller = target?.closest<HTMLElement>('.app-content');

        if (!mounted || !target || !scroller) {
            setPast(false);

            return;
        }

        const inset =
            (parseFloat(getComputedStyle(scroller).paddingTop) || 0) +
            coveredTop;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.rootBounds) return;
                setPast(
                    !entry.isIntersecting &&
                        entry.boundingClientRect.bottom <= entry.rootBounds.top
                );
            },
            { root: scroller, rootMargin: `${-inset}px 0px 0px 0px` }
        );

        observer.observe(target);

        return () => observer.disconnect();
    }, [targetRef, coveredTop, mounted]);

    return past;
}
