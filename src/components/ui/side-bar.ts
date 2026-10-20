'use client';

import { useSyncExternalStore } from 'react';

function subscribeSideBar(onChange: () => void) {
    const observer = new MutationObserver(onChange);

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-side-bar']
    });

    return () => observer.disconnect();
}

/**
 * Whether the page has its status bar down the right edge, as the folded
 * iPhone Duo does, from the `data-side-bar` mark `islandSideScript` keeps
 * current, so controls can move into that strip while it is there.
 */
export function isSideBar() {
    return document.documentElement.dataset.sideBar === 'right';
}

/** Re-renders when the side bar comes or goes, such as on folding. */
export function useSideBar() {
    return useSyncExternalStore(subscribeSideBar, isSideBar, () => false);
}
