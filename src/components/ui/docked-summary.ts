'use client';

export interface DockedSummaryRange {
    start: number;
    end: number;
}

export interface DockedSummaryTrack {
    measure: () => DockedSummaryRange | null;
    media: string;
    observed: (HTMLElement | null)[];
    progressProperty: string;
    scrollDriven: boolean;
    scroller: HTMLElement;
    summary: HTMLElement;
}

/**
 * Scrubs a docked summary strip's reveal progress by its scroller's position
 * across the measured range. Where the stylesheet drives the progress from a
 * scroll timeline the script only measures; under reduced motion, or without
 * scroll-driven animations, it writes the progress itself, snapping to 1 at
 * the range end and back to 0 at its start under reduced motion. Returns the
 * teardown.
 */
export function trackDockedSummary(track: DockedSummaryTrack) {
    const { progressProperty, scroller, summary } = track;
    const mediaQuery = window.matchMedia(track.media);
    const reducedMotionQuery = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    );
    let range: DockedSummaryRange | null = null;
    let reducedMotionShown = false;
    let animationFrame: number | null = null;
    const measure = () => {
        range = mediaQuery.matches ? track.measure() : null;
    };
    const apply = () => {
        animationFrame = null;
        if (!range) {
            summary.style.removeProperty(progressProperty);

            return;
        }
        if (track.scrollDriven && !reducedMotionQuery.matches) return;

        const scrollTop = Math.max(0, scroller.scrollTop);
        let progress = Math.min(
            1,
            Math.max(0, (scrollTop - range.start) / (range.end - range.start))
        );

        if (reducedMotionQuery.matches) {
            if (scrollTop >= range.end) reducedMotionShown = true;
            else if (scrollTop <= range.start) reducedMotionShown = false;
            progress = reducedMotionShown ? 1 : 0;
        }
        summary.style.setProperty(progressProperty, progress.toFixed(4));
    };
    const schedule = () => {
        if (animationFrame !== null) return;
        animationFrame = window.requestAnimationFrame(apply);
    };
    const remeasure = () => {
        measure();
        schedule();
    };
    const resizeObserver = new ResizeObserver(remeasure);

    scroller.addEventListener('scroll', schedule, { passive: true });
    mediaQuery.addEventListener('change', remeasure);
    reducedMotionQuery.addEventListener('change', schedule);
    for (const element of track.observed)
        if (element) resizeObserver.observe(element);
    measure();
    apply();

    return () => {
        scroller.removeEventListener('scroll', schedule);
        mediaQuery.removeEventListener('change', remeasure);
        reducedMotionQuery.removeEventListener('change', schedule);
        resizeObserver.disconnect();
        if (animationFrame !== null)
            window.cancelAnimationFrame(animationFrame);
    };
}
