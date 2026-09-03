import 'server-only';
import { and, eq } from 'drizzle-orm';
import { monthlyBudgetItems } from '@/db/schema';
import { throwMonthlyItemMutationFailure } from '@/server/mutation-failures';
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
