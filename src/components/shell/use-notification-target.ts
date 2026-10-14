'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const TARGET_CACHE = 'better-budget-notification-target';
const TARGET_KEY = '/__notification-target';
const TARGET_MESSAGE = 'better-budget:notification-target';
const TARGET_MAX_AGE_MS = 2 * 60 * 1000;
const VISIBLE_RECHECK_MS = [0, 300, 1_000, 2_500, 5_000];

async function takeTarget(): Promise<string | null> {
    const cache = await caches.open(TARGET_CACHE);
    const response = await cache.match(TARGET_KEY);

    if (!response) return null;
    await cache.delete(TARGET_KEY);
    const target = (await response.json().catch(() => null)) as {
        url?: unknown;
        at?: unknown;
    } | null;

    if (
        typeof target?.url !== 'string' ||
        typeof target.at !== 'number' ||
        !target.url.startsWith('/') ||
        target.url.startsWith('//') ||
        Date.now() - target.at > TARGET_MAX_AGE_MS
    )
        return null;

    return target.url;
}

/**
 * Opens the page a tapped notification points at. The service worker records
 * the target before it focuses or opens the app, so the app finds it whether
 * the tap resumed it, cold-launched it, or launched it on another page. A
 * resumed app becomes visible while the worker may still be recording, so it
 * checks again over the next few seconds.
 */
export function useNotificationTarget(): void {
    const router = useRouter();

    useEffect(() => {
        if (!('caches' in window)) return;
        let taking = false;
        let rechecks: number[] = [];
        const open = async () => {
            if (taking) return;
            taking = true;
            try {
                const url = await takeTarget();
                const current = `${window.location.pathname}${window.location.search}`;

                if (url && url !== current) router.push(url);
            } catch {
                return;
            } finally {
                taking = false;
            }
        };
        const clearRechecks = () => {
            rechecks.forEach((timer) => window.clearTimeout(timer));
            rechecks = [];
        };
        const onVisible = () => {
            clearRechecks();
            if (document.visibilityState !== 'visible') return;
            rechecks = VISIBLE_RECHECK_MS.map((delay) =>
                window.setTimeout(() => void open(), delay)
            );
        };
        const onMessage = (event: MessageEvent) => {
            if ((event.data as { type?: unknown })?.type === TARGET_MESSAGE)
                void open();
        };

        void open();
        document.addEventListener('visibilitychange', onVisible);
        navigator.serviceWorker?.addEventListener('message', onMessage);
        navigator.serviceWorker?.startMessages();

        return () => {
            clearRechecks();
            document.removeEventListener('visibilitychange', onVisible);
            navigator.serviceWorker?.removeEventListener('message', onMessage);
        };
    }, [router]);
}
