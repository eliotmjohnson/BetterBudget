import 'server-only';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import {
    assertValidRuntimeEnvironment,
    isOwnerBootstrap
} from '../../runtime-environment.mjs';
import { getDatabase } from '@/db';
import * as schema from '@/db/schema';

let authPromise: ReturnType<typeof createAuth> | undefined;

async function createAuth() {
    assertValidRuntimeEnvironment();
    const db = await getDatabase();

    return betterAuth({
        appName: 'Better Budget',
        baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        secret:
            process.env.BETTER_AUTH_SECRET ??
            'better-budget-local-development-secret-change-me',
        database: drizzleAdapter(db, {
            provider: 'pg',
            schema,
            usePlural: false
        }),
        emailAndPassword: {
            enabled: true,
            disableSignUp: !isOwnerBootstrap(),
            minPasswordLength: 10
        },
        session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
        rateLimit: { enabled: true, window: 60, max: 20 }
    });
}

export function getAuth() {
    authPromise ??= createAuth();

    return authPromise;
}

export function isAuthBypassed(): boolean {
    return (
        process.env.AUTH_BYPASS !== 'false' &&
        (process.env.NODE_ENV !== 'production' ||
            process.env.ALLOW_INSECURE_LOCAL_AUTH === 'true')
    );
}
