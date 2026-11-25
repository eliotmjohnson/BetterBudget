'use client';

import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';

const CHECKED_AT_KEY = 'better-budget-session-checked-at';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let memoryCheckedAt = 0;
let checking = false;

function readCheckedAt(): number {
    try {
        const stored = Number(window.localStorage.getItem(CHECKED_AT_KEY));

        return Math.max(memoryCheckedAt, Number.isFinite(stored) ? stored : 0);
    } catch {
        return memoryCheckedAt;
    }
}

function writeCheckedAt(at: number): void {
    memoryCheckedAt = at;
    try {
        window.localStorage.setItem(CHECKED_AT_KEY, String(at));
    } catch {
        return;
    }
}

async function checkSession(): Promise<void> {
    const now = Date.now();
    const elapsed = now - readCheckedAt();

    if (checking || (elapsed >= 0 && elapsed < CHECK_INTERVAL_MS)) return;
    checking = true;
    try {
        const result = await authClient.getSession();

        if (!result.error) writeCheckedAt(now);
    } catch {
        return;
    } finally {
        checking = false;
    }
}

/**
 * Keeps the sign-in cookie sliding with use. Server Components cannot set
 * cookies, so server reads skip Better Auth's refresh and this hook asks the
 * auth endpoint instead, whose response carries the extended cookie. It checks
 * at most once an hour per device, on launch and when the app returns to the
 * foreground; Better Auth itself writes at most once a day.
 */
export function useSessionRefresh(): void {
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') void checkSession();
        };

        void checkSession();
        document.addEventListener('visibilitychange', onVisible);

        return () =>
            document.removeEventListener('visibilitychange', onVisible);
    }, []);
}
