'use client';

import { useCallback, useEffect, useState } from 'react';

export type PushState =
    'loading' | 'unsupported' | 'install' | 'denied' | 'off' | 'on';

const SERVICE_WORKER_URL = '/sw.js';

function isAppleMobile(): boolean {
    return (
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

function isStandalone(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

const pushSupported = () =>
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(key: ArrayBuffer | null, publicKey: string): boolean {
    if (!key) return false;
    const expected = base64UrlToBytes(publicKey);
    const actual = new Uint8Array(key);

    return (
        actual.length === expected.length &&
        actual.every((byte, index) => byte === expected[index])
    );
}

async function fetchPublicKey(): Promise<string> {
    const response = await fetch('/api/push/subscriptions');

    if (!response.ok) throw new Error('Push keys are unavailable.');

    return ((await response.json()) as { publicKey: string }).publicKey;
}

function postJson(url: string, method: string, body: unknown) {
    return fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function currentSubscription(): Promise<PushSubscription | null> {
    const registration =
        await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);

    return (await registration?.pushManager.getSubscription()) ?? null;
}

async function readPushState(sync: boolean): Promise<PushState> {
    if (!pushSupported())
        return isAppleMobile() && !isStandalone() ? 'install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const subscription = await currentSubscription();

    if (!subscription) return 'off';
    if (!sync) return 'on';
    const publicKey = await fetchPublicKey();

    if (!sameKey(subscription.options.applicationServerKey, publicKey)) {
        await subscription.unsubscribe();

        return 'off';
    }
    await postJson('/api/push/subscriptions', 'POST', subscription.toJSON());

    return 'on';
}

/**
 * This device's bill-reminder subscription. With `sync`, an existing
 * subscription is re-sent to the server, and one signed by a replaced key
 * pair is dropped so the switch shows it is off.
 */
export function usePushNotifications({ sync = false } = {}) {
    const [state, setState] = useState<PushState>('loading');

    useEffect(() => {
        let cancelled = false;

        readPushState(sync)
            .catch(() => 'off' as const)
            .then((next) => {
                if (!cancelled) setState(next);
            });

        return () => {
            cancelled = true;
        };
    }, [sync]);

    const enable = useCallback(async (): Promise<boolean> => {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            setState(permission === 'denied' ? 'denied' : 'off');

            return false;
        }
        const registration = await navigator.serviceWorker.register(
            SERVICE_WORKER_URL,
            { scope: '/' }
        );

        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(await fetchPublicKey())
        });
        const saved = await postJson(
            '/api/push/subscriptions',
            'POST',
            subscription.toJSON()
        );

        if (!saved.ok) {
            await subscription.unsubscribe();
            setState('off');

            return false;
        }
        setState('on');

        return true;
    }, []);
    const disable = useCallback(async (): Promise<void> => {
        const subscription = await currentSubscription();

        if (subscription) {
            await postJson('/api/push/subscriptions', 'DELETE', {
                endpoint: subscription.endpoint
            });
            await subscription.unsubscribe();
        }
        setState('off');
    }, []);
    const sendTest = useCallback(async (): Promise<boolean> => {
        const subscription = await currentSubscription();

        if (!subscription) return false;
        const response = await postJson('/api/push/test', 'POST', {
            endpoint: subscription.endpoint
        });

        return response.ok;
    }, []);

    return { state, enable, disable, sendTest };
}
