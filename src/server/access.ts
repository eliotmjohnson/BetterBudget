import 'server-only';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDatabase } from '@/db';
import { DEFAULT_HOUSEHOLD_ID } from '@/db/household';
import { householdMembers } from '@/db/schema';
import { getAuth, isAuthBypassed } from '@/lib/auth';

export async function getAccess(): Promise<{
    householdId: string;
    userName: string;
} | null> {
    if (isAuthBypassed())
        return { householdId: DEFAULT_HOUSEHOLD_ID, userName: 'Our Household' };
    const authHeaders = await headers();
    const auth = await getAuth();
    const current = await auth.api.getSession({ headers: authHeaders });

    if (!current?.user) return null;

    const db = await getDatabase();
    const membership = await db
        .select({ householdId: householdMembers.householdId })
        .from(householdMembers)
        .where(
            and(
                eq(householdMembers.userId, current.user.id),
                eq(householdMembers.householdId, DEFAULT_HOUSEHOLD_ID),
                eq(householdMembers.role, 'owner')
            )
        )
        .limit(1);

    if (!membership[0]) return null;

    return {
        householdId: membership[0].householdId,
        userName: current.user.name
    };
}

export async function requireAccess() {
    const access = await getAccess();

    if (!access) redirect('/sign-in');

    return access;
}
