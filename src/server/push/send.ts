import 'server-only';
import { eq } from 'drizzle-orm';
import webpush, { WebPushError } from 'web-push';
import { getDatabase } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { getVapidDetails } from './vapid';

export interface PushPayload {
    title: string;
    body: string;
    url: string;
    tag: string;
}

export type PushTarget = Pick<
    typeof pushSubscriptions.$inferSelect,
    'id' | 'endpoint' | 'p256dh' | 'auth'
>;

export type PushOutcome = 'sent' | 'expired' | 'failed';

const PUSH_TTL_SECONDS = 24 * 60 * 60;
const DECLARATIVE_PUSH_MARKER = 8030;

function appOrigin(): string {
    return process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
}

/**
 * A Declarative Web Push message. Browsers that support it show the
 * notification and navigate to `navigate` on a tap without involving the
 * service worker; others deliver it to the worker's push handler, which shows
 * the same notification itself.
 */
function declarativeMessage(payload: PushPayload) {
    return {
        web_push: DECLARATIVE_PUSH_MARKER,
        notification: {
            title: payload.title,
            body: payload.body,
            tag: payload.tag,
            navigate: new URL(payload.url, appOrigin()).href,
            silent: false
        }
    };
}

/**
 * Sends one notification to one device. A subscription the push service
 * reports as gone (404/410) is deleted; other failures are logged and left
 * for the next attempt.
 */
export async function sendPush(
    target: PushTarget,
    payload: PushPayload
): Promise<PushOutcome> {
    const db = await getDatabase();

    try {
        await webpush.sendNotification(
            {
                endpoint: target.endpoint,
                keys: { p256dh: target.p256dh, auth: target.auth }
            },
            JSON.stringify(declarativeMessage(payload)),
            {
                vapidDetails: await getVapidDetails(),
                TTL: PUSH_TTL_SECONDS,
                urgency: 'normal',
                timeout: 10_000
            }
        );
        await db
            .update(pushSubscriptions)
            .set({ lastSuccessAt: new Date() })
            .where(eq(pushSubscriptions.id, target.id));

        return 'sent';
    } catch (error) {
        if (
            error instanceof WebPushError &&
            (error.statusCode === 404 || error.statusCode === 410)
        ) {
            await db
                .delete(pushSubscriptions)
                .where(eq(pushSubscriptions.id, target.id));

            return 'expired';
        }
        console.error(
            'push send failed',
            error instanceof WebPushError
                ? { statusCode: error.statusCode, body: error.body }
                : error
        );

        return 'failed';
    }
}
