'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const TARGET_CACHE = 'better-budget-notification-target';
const TARGET_KEY = '/__notification-target';
const TARGET_MESSAGE = 'better-budget:notification-target';
const TARGET_MAX_AGE_MS = 2 * 60 * 1000;

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
 * the tap resumed it, cold-launched it, or launched it on another page.
 */
export function useNotificationTarget(): void {
    const router = useRouter();

    useEffect(() => {
        if (!('caches' in window)) return;
        let taking = false;
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
        const onVisible = () => {
            if (document.visibilityState === 'visible') void open();
        };
        const onMessage = (event: MessageEvent) => {
            if ((event.data as { type?: unknown })?.type === TARGET_MESSAGE)
                void open();
        };

        void open();
        document.addEventListener('visibilitychange', onVisible);
        navigator.serviceWorker?.addEventListener('message', onMessage);

        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            navigator.serviceWorker?.removeEventListener('message', onMessage);
        };
    }, [router]);
}
