/**
 * Whether `animation` is a CSS animation that is playing now and will stop by
 * itself, such as a sheet's entrance. A finished animation that a `both` or
 * `forwards` fill keeps applied, such as a page's entrance, an endless one,
 * and a scroll-driven one, which runs as long as its scroller exists, are not:
 * none of them is a motion anything can wait out.
 */
export function isRunningFiniteAnimation(animation: Animation) {
    return (
        animation instanceof CSSAnimation &&
        animation.playState === 'running' &&
        animation.timeline === document.timeline &&
        animation.effect?.getComputedTiming().endTime !== Infinity
    );
}
