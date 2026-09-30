import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { AppDb } from '@/db';
import { monthlyBudgetItems } from '@/db/schema';
import {
    MutationFailure,
    throwMonthlyItemMutationFailure
} from '@/server/mutation-failures';
import { activeMovePair } from './active-items';
import type { MutationContext } from './context';

export async function updatePlan({
    tx,
    monthId,
    input
}: MutationContext<'updatePlan'>): Promise<void> {
    const updated = await tx
        .update(monthlyBudgetItems)
        .set({
            plannedCents: BigInt(input.plannedCents),
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(monthlyBudgetItems.id, input.monthlyItemId),
                eq(monthlyBudgetItems.monthId, monthId),
                eq(monthlyBudgetItems.version, input.expectedVersion)
            )
        )
        .returning({ id: monthlyBudgetItems.id });

    if (!updated[0])
        await throwMonthlyItemMutationFailure(tx, monthId, input.monthlyItemId);
}

export async function toggleCarryover({
    tx,
    monthId,
    input
}: MutationContext<'toggleCarryover'>): Promise<void> {
    const updated = await tx
        .update(monthlyBudgetItems)
        .set({
            carryoverEnabled: input.enabled,
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(monthlyBudgetItems.id, input.monthlyItemId),
                eq(monthlyBudgetItems.monthId, monthId),
                eq(monthlyBudgetItems.version, input.expectedVersion)
            )
        )
        .returning({ id: monthlyBudgetItems.id });

    if (!updated[0])
        await throwMonthlyItemMutationFailure(tx, monthId, input.monthlyItemId);
}

async function shiftPlan(
    tx: AppDb,
    monthId: string,
    change: {
        monthlyItemId: string;
        expectedVersion: number;
        deltaCents: bigint;
    }
): Promise<void> {
    const updated = await tx
        .update(monthlyBudgetItems)
        .set({
            plannedCents: sql`${monthlyBudgetItems.plannedCents} + ${change.deltaCents}`,
            version: change.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(monthlyBudgetItems.id, change.monthlyItemId),
                eq(monthlyBudgetItems.monthId, monthId),
                eq(monthlyBudgetItems.version, change.expectedVersion)
            )
        )
        .returning({ id: monthlyBudgetItems.id });

    if (!updated[0])
        await throwMonthlyItemMutationFailure(
            tx,
            monthId,
            change.monthlyItemId
        );
}

export async function movePlannedAmount(
    context: MutationContext<'movePlannedAmount'>
): Promise<void> {
    const { tx, monthId, input } = context;
    const amount = BigInt(input.amountCents);
    const { from } = await activeMovePair(context);

    await shiftPlan(tx, monthId, {
        monthlyItemId: input.fromItemId,
        expectedVersion: input.fromExpectedVersion,
        deltaCents: -amount
    });
    await shiftPlan(tx, monthId, {
        monthlyItemId: input.toItemId,
        expectedVersion: input.toExpectedVersion,
        deltaCents: amount
    });
    if (from.plannedCents < amount)
        throw new MutationFailure(
            'validation',
            `You can move at most what ${from.name} has planned.`
        );
}
