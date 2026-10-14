import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDatabase } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import type { PushTarget } from './send';

export const pushEndpointSchema = z
    .string()
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://'), {
        message: 'Push endpoints must use HTTPS.'
    });

export const pushSubscriptionSchema = z.object({
    endpoint: pushEndpointSchema,
    keys: z.object({
        p256dh: z.string().min(1).max(512),
        auth: z.string().min(1).max(512)
    })
});

export async function savePushSubscription(
    householdId: string,
    subscription: z.infer<typeof pushSubscriptionSchema>,
    userAgent: string | null
): Promise<void> {
    const db = await getDatabase();
    const values = {
        householdId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
        updatedAt: new Date()
    };

    await db
        .insert(pushSubscriptions)
        .values({ ...values, endpoint: subscription.endpoint })
        .onConflictDoUpdate({
            target: pushSubscriptions.endpoint,
            set: values
        });
}

export async function deletePushSubscription(
    householdId: string,
    endpoint: string
): Promise<void> {
    const db = await getDatabase();

    await db
        .delete(pushSubscriptions)
        .where(
            and(
                eq(pushSubscriptions.householdId, householdId),
                eq(pushSubscriptions.endpoint, endpoint)
            )
        );
}

export async function findPushSubscription(
    householdId: string,
    endpoint: string
): Promise<PushTarget | null> {
    const db = await getDatabase();
    const [row] = await db
        .select({
            id: pushSubscriptions.id,
            endpoint: pushSubscriptions.endpoint,
            p256dh: pushSubscriptions.p256dh,
            auth: pushSubscriptions.auth
        })
        .from(pushSubscriptions)
        .where(
            and(
                eq(pushSubscriptions.householdId, householdId),
                eq(pushSubscriptions.endpoint, endpoint)
            )
        )
        .limit(1);

    return row ?? null;
}
