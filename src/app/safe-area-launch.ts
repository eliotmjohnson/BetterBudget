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
 * screen, because iOS then keeps the strip outside the page with no inset. It
 * saves the screen width that narrower page was seen on, and a later launch on
 * that screen stays hidden until the page narrows, for up to 1.5 s, because iOS
 * first lays it out at the screen's full width. If the page never narrows
 * there, it forgets the width. A side status bar seen only as an inset reveals
 * the page but keeps the script watching for the narrower page, because iOS
 * reports the inset at full width before it narrows the page. While a record
 * exists, `data-fence-launch` on `html` for the first 3 s lets `tokens.css`
 * hide the page in any frame it is laid out at the Duo cover's full 466 px, so
 * the full-width frame never shows whatever order iOS reports things in; a
 * resize to the narrower page at any time writes the record, and a launch that
 * ends still at 466 px without narrowing drops it.
 */
export const safeAreaLaunchScript = `(() => {
    if (navigator.standalone !== true || !matchMedia('(orientation: portrait)').matches) return;
    const key = 'betterBudgetSafeAreaTop';
    const sideKey = 'betterBudgetSideInset';
    const fenceKey = 'betterBudgetFencedScreen';
    const root = document.documentElement;
    const probe = document.createElement('div');
    const store = (name, value) => { try { localStorage.setItem(name, String(value)); } catch {} };
    const load = (name) => { try { return localStorage.getItem(name); } catch { return null; } };
    const read = () => {
        const box = probe.getBoundingClientRect();
        const fenced = innerWidth > 0 && screen.width < 760 ? screen.width - innerWidth : 0;

        return { top: box.height, side: fenced >= 44 ? fenced : box.width, fenced: fenced >= 44 };
    };
    const awaitFence = Number(load(fenceKey)) === screen.width;
    const fullCover = matchMedia('(device-width: 466px) and (width: 466px)');

    if (load(fenceKey)) {
        root.setAttribute('data-fence-launch', '');
        setTimeout(() => root.removeAttribute('data-fence-launch'), 3000);
    }
    addEventListener('resize', () => {
        if (read().fenced) store(fenceKey, screen.width);
    });
    const settled = (state) => awaitFence ? state.fenced : state.top > 0 || state.side > 0;
    const complete = (state) => settled(state) && !(state.side > 0 && !state.fenced && !awaitFence);
    let fencedSeen = false;
    const finish = (state) => {
        probe.remove();
        root.removeAttribute('data-safe-area-pending');
        root.style.removeProperty('--safe-area-top-launch');
        if (state.top > 0) store(key, state.top);
        else if (state.side > 0) store(sideKey, 1);
        if (fencedSeen) store(fenceKey, screen.width);
        else if (awaitFence || fullCover.matches) { try { localStorage.removeItem(fenceKey); } catch {} }
    };

    probe.style.cssText = 'position:fixed;top:0;width:max(env(safe-area-inset-left),env(safe-area-inset-right));height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    root.append(probe);
    const initial = read();

    fencedSeen = initial.fenced;
    if (complete(initial)) return finish(initial);
    let shown = settled(initial);

    if (!shown) {
        const saved = Number(load(key)) || 0;
        const sided = load(sideKey) === '1';

        if (saved > 0 && !sided && !awaitFence) root.style.setProperty('--safe-area-top-launch', saved + 'px');
        else root.setAttribute('data-safe-area-pending', '');
    }
    const hold = awaitFence ? 1500 : 600;
    const startedAt = performance.now();
    const check = () => {
        const state = read();
        const elapsed = performance.now() - startedAt;

        fencedSeen = fencedSeen || state.fenced;
        if (!shown && (settled(state) || elapsed >= hold)) {
            shown = true;
            root.removeAttribute('data-safe-area-pending');
        }
        if (!complete(state) && elapsed < 3000) return requestAnimationFrame(check);
        finish(state);
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
