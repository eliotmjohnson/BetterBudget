import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { closeDatabase, getDatabase, type AppDb } from '../src/db';
import {
    DEFAULT_HOUSEHOLD_ID,
    ensureOwnerMembership
} from '../src/db/household';
import { householdMembers, user } from '../src/db/schema';
import { getAuth } from '../src/lib/auth';

const ownerEnvironmentSchema = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(10)
});

async function main() {
    const ownerEnvironment = ownerEnvironmentSchema.safeParse({
        email: process.env.BOOTSTRAP_OWNER_EMAIL,
        password: process.env.BOOTSTRAP_OWNER_PASSWORD
    });

    if (!ownerEnvironment.success)
        throw new Error(
            'Set BOOTSTRAP_OWNER_EMAIL and a BOOTSTRAP_OWNER_PASSWORD of at least 10 characters.'
        );
    const { email, password } = ownerEnvironment.data;
    const db = await getDatabase();

    try {
        const currentOwners = await db
            .select({ email: user.email })
            .from(householdMembers)
            .innerJoin(user, eq(householdMembers.userId, user.id))
            .where(
                and(
                    eq(householdMembers.householdId, DEFAULT_HOUSEHOLD_ID),
                    eq(householdMembers.role, 'owner')
                )
            );
        const differentOwner = currentOwners.find(
            (owner) => owner.email !== email
        );

        if (differentOwner)
            throw new Error(
                `The shared household already belongs to ${differentOwner.email}.`
            );
        const existingUser = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, email))
            .limit(1);
        let userId = existingUser[0]?.id;

        if (!userId) {
            const auth = await getAuth();
            const context = await auth.api.signUpEmail({
                body: { email, password, name: 'Our Household' }
            });

            userId = context.user.id;
        }
        await db.transaction(async (transaction) => {
            await ensureOwnerMembership(transaction as AppDb, userId);
        });
        console.log(`Shared owner ${email} is ready.`);
    } finally {
        await closeDatabase();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
