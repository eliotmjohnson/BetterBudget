import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { budgetItems, categories, monthlyBudgetItems } from '@/db/schema';
import {
    throwItemDefinitionMutationFailure,
    throwMonthlyItemMutationFailure
} from '@/server/mutation-failures';
import type { MutationContext } from './context';

export async function updateBillReminder({
    tx,
    householdId,
    input
}: MutationContext<'updateBillReminder'>): Promise<void> {
    const updated = await tx
        .update(budgetItems)
        .set({
            billReminderEnabled: input.enabled,
            billDueDay: input.dueDay,
            billLeadDays: input.leadDays,
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(budgetItems.id, input.itemId),
                eq(budgetItems.version, input.expectedVersion),
                inArray(
                    budgetItems.categoryId,
                    tx
                        .select({ id: categories.id })
                        .from(categories)
                        .where(eq(categories.householdId, householdId))
                )
            )
        )
        .returning({ id: budgetItems.id });

    if (!updated[0])
        await throwItemDefinitionMutationFailure(tx, householdId, input.itemId);
}

export async function setBillDueOverride({
    tx,
    monthId,
    input
}: MutationContext<'setBillDueOverride'>): Promise<void> {
    const updated = await tx
        .update(monthlyBudgetItems)
        .set({
            billDueDayOverride: input.dueDay,
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
