/**
 * Inline head script for the installed iOS app. When iOS has not yet reported
 * `env(safe-area-inset-top)` as the page starts, it sets
 * `--safe-area-top-launch` to the status-bar height saved on an earlier
 * portrait launch, or, before one exists, marks the document
 * `data-safe-area-pending` so it stays hidden until iOS reports the inset.
 * Once iOS reports the real value it clears both and saves the value.
 */
export const safeAreaLaunchScript = `(() => {
    if (navigator.standalone !== true || !matchMedia('(orientation: portrait)').matches) return;
    const key = 'betterBudgetSafeAreaTop';
    const root = document.documentElement;
    const probe = document.createElement('div');
    const save = (inset) => { try { localStorage.setItem(key, String(inset)); } catch {} };

    probe.style.cssText = 'position:fixed;top:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    root.append(probe);
    const initial = probe.getBoundingClientRect().height;

    if (initial > 0) {
        probe.remove();
        return save(initial);
    }
    let saved = 0;

    try { saved = Number(localStorage.getItem(key)) || 0; } catch {}
    if (saved > 0) root.style.setProperty('--safe-area-top-launch', saved + 'px');
    else root.setAttribute('data-safe-area-pending', '');
    const startedAt = performance.now();
    const check = () => {
        const inset = probe.getBoundingClientRect().height;
        const elapsed = performance.now() - startedAt;

        if (inset > 0 || elapsed >= 600) root.removeAttribute('data-safe-area-pending');
        if (inset <= 0 && elapsed < 3000) return requestAnimationFrame(check);
        probe.remove();
        root.style.removeProperty('--safe-area-top-launch');
        if (inset > 0) save(inset);
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
