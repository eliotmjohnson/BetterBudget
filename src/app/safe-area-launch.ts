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
 * Inline head script for the installed iOS app that keeps `--viewport-height`
 * from falling short of the screen. On some launches iOS resolves `100lvh`
 * below the height a fixed element spans, so the root and every surface sized
 * from the token end above the bottom edge. It measures both and, when the
 * fixed span is taller, sets `--viewport-height-floor` on `html` to it. The
 * floor only rises while the page width holds, so the keyboard never lowers
 * it, and resets when the width changes on rotation or folding. It measures
 * every frame for 3 s after the page starts or returns to view, and on resize.
 */
export const viewportFloorScript = `(() => {
    if (navigator.standalone !== true) return;
    const root = document.documentElement;
    const probe = (height) => {
        const box = document.createElement('div');

        box.style.cssText = 'position:fixed;top:0;width:0;visibility:hidden;pointer-events:none;' + height;
        root.append(box);
        const measured = box.getBoundingClientRect().height;

        box.remove();
        return measured;
    };
    let width = 0;
    let floor = 0;
    let until = 0;
    const measure = () => {
        const reach = probe('bottom:0');
        const large = probe('height:100lvh');

        if (innerWidth !== width) {
            width = innerWidth;
            floor = 0;
        }
        floor = Math.max(floor, reach);
        if (floor - large >= 1) root.style.setProperty('--viewport-height-floor', floor + 'px');
        else root.style.removeProperty('--viewport-height-floor');
    };
    const poll = () => {
        measure();
        if (performance.now() < until) requestAnimationFrame(poll);
    };
    const watch = () => {
        const idle = performance.now() >= until;

        until = performance.now() + 3000;
        if (idle) poll();
    };

    watch();
    addEventListener('resize', measure);
    addEventListener('pageshow', watch);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') watch();
    });
})();`;

/**
 * Inline head script that marks `html` with `data-island` (`left`, `right`, or
 * `top`) from the screen's rotation, and with `data-side-bar='right'` while a
 * page narrower than 760 px has its status bar down the right edge instead of
 * across the top, as the folded iPhone Duo does, and keeps both current on
 * every resize and orientation change. iOS reports equal left and right insets
 * in landscape, so the landscape layout reads `data-island` to pad only the
 * side the Dynamic Island is on. The side bar is read from the insets, not the
 * rotation, because the folded Duo reports a rotation of 0 with its status bar
 * on the right; it is re-read on visual-viewport resizes too, because the
 * Duo's last launch resize reaches only the visual viewport. Each change is
 * re-read every frame for 800 ms, because iOS can fire the resize before it
 * updates the insets: Safari on the folded Duo, rotated back to portrait,
 * otherwise kept landscape's right inset and the side bar.
 */
export const islandSideScript = `(() => {
    const root = document.documentElement;
    const probe = document.createElement('div');

    probe.style.cssText = 'position:fixed;top:0;width:env(safe-area-inset-right);height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    const mark = () => {
        const angle = screen.orientation ? screen.orientation.angle : Number(window.orientation) || 0;

        root.append(probe);
        const box = probe.getBoundingClientRect();

        probe.remove();

        root.setAttribute('data-island', angle === 90 ? 'left' : angle === 270 || angle === -90 ? 'right' : 'top');
        if (innerWidth < 760 && box.width >= 44 && box.width > box.height) root.setAttribute('data-side-bar', 'right');
        else root.removeAttribute('data-side-bar');
    };

    let settleUntil = 0;
    const settle = () => {
        mark();
        if (performance.now() < settleUntil) requestAnimationFrame(settle);
    };
    const remark = () => {
        const settling = performance.now() < settleUntil;

        settleUntil = performance.now() + 800;
        if (!settling) settle();
    };

    mark();
    window.addEventListener('resize', remark);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', remark);
    if (screen.orientation) screen.orientation.addEventListener('change', remark);
    else window.addEventListener('orientationchange', remark);
})();`;
