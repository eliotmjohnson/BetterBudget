import { eq } from 'drizzle-orm';
import type { AppDb } from './index';
import { householdMembers, households } from './schema';

export const DEFAULT_HOUSEHOLD_ID = '10000000-0000-4000-8000-000000000001';

export async function ensureDefaultHousehold(db: AppDb): Promise<void> {
    await db
        .insert(households)
        .values({ id: DEFAULT_HOUSEHOLD_ID, name: 'Our Household' })
        .onConflictDoNothing();
}

export async function ensureOwnerMembership(
    db: AppDb,
    userId: string
): Promise<void> {
    await ensureDefaultHousehold(db);
    const existingOwners = await db
        .select({ userId: householdMembers.userId })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, DEFAULT_HOUSEHOLD_ID));

    if (existingOwners.some((owner) => owner.userId !== userId))
        throw new Error(
            'The shared household already belongs to another owner account.'
        );
    await db
        .insert(householdMembers)
        .values({ householdId: DEFAULT_HOUSEHOLD_ID, userId, role: 'owner' })
        .onConflictDoNothing();
}
