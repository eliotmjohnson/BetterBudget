import 'server-only';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { getDatabase } from '@/db';
import { pushVapidKeys } from '@/db/schema';

export interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
}

const VAPID_ROW_ID = 1;

function vapidSubject(): string {
    const origin = process.env.BETTER_AUTH_URL?.trim();

    return origin?.startsWith('https://')
        ? origin
        : 'mailto:better-budget@example.com';
}

/**
 * The household's push signing keys, generated on first use. Concurrent first
 * calls both insert-if-absent and then read back the single winning row, so
 * every subscription and every send uses the same pair.
 */
export async function getVapidDetails(): Promise<VapidDetails> {
    const db = await getDatabase();
    const read = () =>
        db
            .select()
            .from(pushVapidKeys)
            .where(eq(pushVapidKeys.id, VAPID_ROW_ID))
            .limit(1);
    let [row] = await read();

    if (!row) {
        const generated = webpush.generateVAPIDKeys();

        await db
            .insert(pushVapidKeys)
            .values({
                id: VAPID_ROW_ID,
                publicKey: generated.publicKey,
                privateKey: generated.privateKey
            })
            .onConflictDoNothing();
        [row] = await read();
    }
    if (!row) throw new Error('Push keys could not be created.');

    return {
        subject: vapidSubject(),
        publicKey: row.publicKey,
        privateKey: row.privateKey
    };
}
