/**
 * Inline head script for the installed iOS app. When iOS has not yet reported
 * its safe-area insets as the page starts, it sets `--safe-area-top-launch` to
 * the status-bar height saved on an earlier portrait launch, or, before one
 * exists or on a device that has shown a side status bar (the folded iPhone
 * Duo, whose top inset is 0), marks the document `data-safe-area-pending` so it
 * stays hidden until iOS reports an inset. Once iOS reports a top inset it
 * clears both and saves the value; a side status bar instead clears both at
 * once and records that this device has one. A side status bar is a side inset
 * or, from iOS 27.2, a phone-sized page at least 44 px narrower than its
 * screen, because iOS then keeps the strip outside the page with no inset.
 */
export const safeAreaLaunchScript = `(() => {
    if (navigator.standalone !== true || !matchMedia('(orientation: portrait)').matches) return;
    const key = 'betterBudgetSafeAreaTop';
    const sideKey = 'betterBudgetSideInset';
    const root = document.documentElement;
    const probe = document.createElement('div');
    const store = (name, value) => { try { localStorage.setItem(name, String(value)); } catch {} };
    const read = () => {
        const box = probe.getBoundingClientRect();
        const fenced = innerWidth > 0 && screen.width < 760 ? screen.width - innerWidth : 0;

        return { top: box.height, side: fenced >= 44 ? fenced : box.width };
    };

    probe.style.cssText = 'position:fixed;top:0;width:max(env(safe-area-inset-left),env(safe-area-inset-right));height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    root.append(probe);
    const initial = read();

    if (initial.top > 0 || initial.side > 0) {
        probe.remove();
        return initial.top > 0 ? store(key, initial.top) : store(sideKey, 1);
    }
    let saved = 0;
    let sided = false;

    try {
        saved = Number(localStorage.getItem(key)) || 0;
        sided = localStorage.getItem(sideKey) === '1';
    } catch {}
    if (saved > 0 && !sided) root.style.setProperty('--safe-area-top-launch', saved + 'px');
    else root.setAttribute('data-safe-area-pending', '');
    const startedAt = performance.now();
    const check = () => {
        const { top, side } = read();
        const reported = top > 0 || side > 0;
        const elapsed = performance.now() - startedAt;

        if (reported || elapsed >= 600) root.removeAttribute('data-safe-area-pending');
        if (!reported && elapsed < 3000) return requestAnimationFrame(check);
        probe.remove();
        root.style.removeProperty('--safe-area-top-launch');
        if (top > 0) store(key, top);
        else if (side > 0) store(sideKey, 1);
    };

    requestAnimationFrame(check);
})();`;

/**
 * Inline head script that marks `html` with `data-island` (`left`, `right`, or
 * `top`) from the screen's rotation, and keeps it current on every resize and
 * orientation change. iOS reports equal
 * left and right insets in landscape, so the landscape layout reads this to
 * pad only the side the Dynamic Island is on.
 */
export const islandSideScript = `(() => {
    const root = document.documentElement;
    const mark = () => {
        const angle = screen.orientation ? screen.orientation.angle : Number(window.orientation) || 0;

        root.setAttribute('data-island', angle === 90 ? 'left' : angle === 270 || angle === -90 ? 'right' : 'top');
    };

    mark();
    window.addEventListener('resize', mark);
    if (screen.orientation) screen.orientation.addEventListener('change', mark);
    else window.addEventListener('orientationchange', mark);
})();`;
