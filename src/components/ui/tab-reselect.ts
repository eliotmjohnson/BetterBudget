'use client';

import { useEffect, useEffectEvent } from 'react';

const tabReselectEvent = 'better-budget:tab-reselect';

/**
 * Tells the open page that its own tab was tapped again, so a page showing a
 * secondary view in place of its list (Transactions' Recently deleted) can go
 * back to the list, the way re-tapping an iOS tab returns to its root.
 */
export function announceTabReselect() {
    window.dispatchEvent(new Event(tabReselectEvent));
}

/** Runs `onReselect` whenever the open page's tab is tapped again. */
export function useTabReselect(onReselect: () => void) {
    const handleReselect = useEffectEvent(onReselect);

    useEffect(() => {
        const listener = () => handleReselect();

        window.addEventListener(tabReselectEvent, listener);

        return () => window.removeEventListener(tabReselectEvent, listener);
    }, []);
}
