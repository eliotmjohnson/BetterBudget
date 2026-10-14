'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type PushState =
    'loading' | 'unsupported' | 'install' | 'denied' | 'off' | 'on';

const SERVICE_WORKER_URL = '/sw.js';
const STORAGE_KEY = 'better-budget-push-v1';

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

function deviceState(): PushState | null {
    if (!pushSupported())
        return isAppleMobile() && !isStandalone() ? 'install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';

    return null;
}

function rememberedState(): PushState {
    try {
        const value = localStorage.getItem(STORAGE_KEY);

        return value === 'on' || value === 'off' ? value : 'loading';
    } catch {
        return 'loading';
    }
}

async function checkSubscription(): Promise<PushState> {
    const device = deviceState();

    if (device) return device;
    const subscription = await currentSubscription();

    if (!subscription) return 'off';
    try {
        const publicKey = await fetchPublicKey();

        if (!sameKey(subscription.options.applicationServerKey, publicKey)) {
            await subscription.unsubscribe();

            return 'off';
        }
        await postJson(
            '/api/push/subscriptions',
            'POST',
            subscription.toJSON()
        );
    } catch {
        return 'on';
    }

    return 'on';
}

const listeners = new Set<() => void>();
let current: PushState | null = null;
let changes = 0;
let checked = false;

function remember(next: PushState): void {
    if (next !== 'on' && next !== 'off') return;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        return;
    }
}

function publish(next: PushState): void {
    current = next;
    remember(next);
    listeners.forEach((listener) => listener());
}

function change(next: PushState): void {
    changes += 1;
    publish(next);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

function snapshot(): PushState {
    current ??= deviceState() ?? rememberedState();

    return current;
}

function settle(check: Promise<PushState>): void {
    const startedAt = changes;

    void check.then(
        (next) => {
            if (changes === startedAt) publish(next);
        },
        () => {
            if (changes === startedAt && current === 'loading') publish('off');
        }
    );
}

async function localState(): Promise<PushState> {
    return deviceState() ?? ((await currentSubscription()) ? 'on' : 'off');
}

function checkOnce(): void {
    if (checked) return;
    checked = true;
    settle(checkSubscription());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') settle(localState());
    });
}

/**
 * This device's bill-reminder subscription. The last known state is kept per
 * device so the controls render settled; once per app launch the
 * subscription is checked in the background, re-sent to the server, and
 * dropped when it was signed by a replaced key pair, and each return to the
 * foreground re-reads the permission and subscription on the device.
 */
export function usePushNotifications() {
    const state = useSyncExternalStore(
        subscribe,
        snapshot,
        () => 'loading' as const
    );

    useEffect(checkOnce, []);

    const enable = useCallback(async (): Promise<boolean> => {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            change(permission === 'denied' ? 'denied' : 'off');

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
            change('off');

            return false;
        }
        change('on');

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
        change('off');
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
