import 'server-only';
import { eq } from 'drizzle-orm';
import type { AppDb } from '@/db';
import { households } from '@/db/schema';

/** Serializes budget writes for one household until the surrounding transaction ends. */
export async function lockHouseholdWrites(
    tx: AppDb,
    householdId: string
): Promise<void> {
    await tx
        .select({ id: households.id })
        .from(households)
        .where(eq(households.id, householdId))
        .for('no key update');
}
