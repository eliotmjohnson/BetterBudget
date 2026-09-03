import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
    budgetItems,
    categories,
    monthlyBudgetCategories,
    monthlyBudgetItems
} from '@/db/schema';
import { monthDate } from '@/domain/calendar';
import {
    MutationFailure,
    throwCategoryMutationFailure,
    throwItemDefinitionMutationFailure
} from '@/server/mutation-failures';
import type { MutationContext } from './context';

export async function addCategory({
    tx,
    householdId,
    monthId,
    input
}: MutationContext<'addCategory'>): Promise<void> {
    const existing = await tx
        .select({ sortOrder: categories.sortOrder })
        .from(categories)
        .where(eq(categories.householdId, householdId));
    const tones = ['yellow', 'coral', 'blue', 'mint', 'lilac'] as const;
    const [category] = await tx
        .insert(categories)
        .values({
            householdId,
            name: input.name,
            icon: input.icon ?? 'sparkles',
            tone: input.tone ?? tones[existing.length % tones.length]!,
            sortOrder: Math.max(0, ...existing.map((row) => row.sortOrder)) + 10
        })
        .returning({ id: categories.id });

    if (!category)
        throw new MutationFailure(
            'not_found',
            'Budget category could not be created.'
        );
    await tx.insert(monthlyBudgetCategories).values({
        monthId,
        categoryId: category.id
    });
}

export async function addItem({
    tx,
    householdId,
    monthId,
    input
}: MutationContext<'addItem'>): Promise<void> {
    const category = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
            and(
                eq(categories.id, input.categoryId),
                eq(categories.householdId, householdId)
            )
        )
        .limit(1);

    if (!category[0])
        throw new MutationFailure('not_found', 'Category not found.');
    await tx
        .insert(monthlyBudgetCategories)
        .values({
            monthId,
            categoryId: input.categoryId
        })
        .onConflictDoNothing();
    const existing = await tx
        .select({ sortOrder: budgetItems.sortOrder })
        .from(budgetItems)
        .where(eq(budgetItems.categoryId, input.categoryId));
    const [item] = await tx
        .insert(budgetItems)
        .values({
            categoryId: input.categoryId,
            name: input.name,
            sortOrder: Math.max(0, ...existing.map((row) => row.sortOrder)) + 10
        })
        .returning({ id: budgetItems.id });

    if (!item)
        throw new MutationFailure(
            'not_found',
            'Budget item could not be created.'
        );
    await tx.insert(monthlyBudgetItems).values({
        monthId,
        budgetItemId: item.id,
        plannedCents: BigInt(input.plannedCents)
    });
}

export async function renameCategory({
    tx,
    householdId,
    input
}: MutationContext<'renameCategory'>): Promise<void> {
    const updated = await tx
        .update(categories)
        .set({
            name: input.name,
            ...(input.icon ? { icon: input.icon } : {}),
            ...(input.tone ? { tone: input.tone } : {}),
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(categories.id, input.categoryId),
                eq(categories.householdId, householdId),
                eq(categories.version, input.expectedVersion)
            )
        )
        .returning({ id: categories.id });

    if (!updated[0])
        await throwCategoryMutationFailure(tx, householdId, input.categoryId);
}

export async function renameItem({
    tx,
    householdId,
    input
}: MutationContext<'renameItem'>): Promise<void> {
    const updated = await tx
        .update(budgetItems)
        .set({
            name: input.name,
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

export async function archiveCategory({
    tx,
    householdId,
    input
}: MutationContext<'archiveCategory'>): Promise<void> {
    const updated = await tx
        .update(categories)
        .set({
            archivedAt: new Date(),
            archivedFromMonth: monthDate(input.monthKey),
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(categories.id, input.categoryId),
                eq(categories.householdId, householdId),
                eq(categories.version, input.expectedVersion)
            )
        )
        .returning({ id: categories.id });

    if (!updated[0])
        await throwCategoryMutationFailure(tx, householdId, input.categoryId);
}

export async function archiveItem({
    tx,
    householdId,
    input
}: MutationContext<'archiveItem'>): Promise<void> {
    const updated = await tx
        .update(budgetItems)
        .set({
            archivedAt: new Date(),
            archivedFromMonth: monthDate(input.monthKey),
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

export async function deleteCategory({
    tx,
    householdId,
    input
}: MutationContext<'deleteCategory'>): Promise<void> {
    const owned = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
            and(
                eq(categories.id, input.categoryId),
                eq(categories.householdId, householdId)
            )
        )
        .limit(1);

    if (!owned[0])
        throw new MutationFailure('not_found', 'That category is not here.');
    const definitions = await tx
        .select({ id: budgetItems.id })
        .from(budgetItems)
        .where(eq(budgetItems.categoryId, input.categoryId));
    const used = definitions.length
        ? await tx
              .select({ id: monthlyBudgetItems.id })
              .from(monthlyBudgetItems)
              .where(
                  inArray(
                      monthlyBudgetItems.budgetItemId,
                      definitions.map((definition) => definition.id)
                  )
              )
              .limit(1)
        : [];

    if (used[0])
        throw new MutationFailure(
            'validation',
            'This category has budget history and can only be archived.'
        );
    await tx
        .delete(budgetItems)
        .where(eq(budgetItems.categoryId, input.categoryId));
    const deleted = await tx
        .delete(categories)
        .where(
            and(
                eq(categories.id, input.categoryId),
                eq(categories.householdId, householdId),
                eq(categories.version, input.expectedVersion)
            )
        )
        .returning({ id: categories.id });

    if (!deleted[0])
        await throwCategoryMutationFailure(tx, householdId, input.categoryId);
}

export async function deleteItem({
    tx,
    householdId,
    input
}: MutationContext<'deleteItem'>): Promise<void> {
    const owned = await tx
        .select({ id: budgetItems.id })
        .from(budgetItems)
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(
            and(
                eq(budgetItems.id, input.itemId),
                eq(categories.householdId, householdId)
            )
        )
        .limit(1);

    if (!owned[0])
        throw new MutationFailure('not_found', 'That budget item is not here.');
    const used = await tx
        .select({ id: monthlyBudgetItems.id })
        .from(monthlyBudgetItems)
        .where(eq(monthlyBudgetItems.budgetItemId, input.itemId))
        .limit(1);

    if (used[0])
        throw new MutationFailure(
            'validation',
            'This item has budget history and can only be archived.'
        );
    const deleted = await tx
        .delete(budgetItems)
        .where(
            and(
                eq(budgetItems.id, input.itemId),
                eq(budgetItems.version, input.expectedVersion)
            )
        )
        .returning({ id: budgetItems.id });

    if (!deleted[0])
        await throwItemDefinitionMutationFailure(tx, householdId, input.itemId);
}

export async function reorderCategories({
    tx,
    householdId,
    monthId,
    input
}: MutationContext<'reorderCategories'>): Promise<void> {
    const existing = await tx
        .select({ id: categories.id })
        .from(monthlyBudgetCategories)
        .innerJoin(
            categories,
            eq(monthlyBudgetCategories.categoryId, categories.id)
        )
        .where(
            and(
                eq(monthlyBudgetCategories.monthId, monthId),
                eq(categories.householdId, householdId),
                isNull(categories.archivedAt)
            )
        );

    if (
        existing.length !== input.categoryIds.length ||
        input.categoryIds.some((id) => !existing.some((row) => row.id === id))
    )
        throw new MutationFailure(
            'conflict',
            'Budget organization changed. Refresh and try again.'
        );
    for (const [index, id] of input.categoryIds.entries())
        await tx
            .update(categories)
            .set({
                sortOrder: (index + 1) * 10,
                updatedAt: new Date()
            })
            .where(eq(categories.id, id));
}

export async function reorderItems({
    tx,
    householdId,
    monthId,
    input
}: MutationContext<'reorderItems'>): Promise<void> {
    const existing = await tx
        .select({ id: budgetItems.id })
        .from(monthlyBudgetItems)
        .innerJoin(
            budgetItems,
            eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
        )
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(
            and(
                eq(monthlyBudgetItems.monthId, monthId),
                eq(budgetItems.categoryId, input.categoryId),
                eq(categories.householdId, householdId),
                isNull(budgetItems.archivedAt)
            )
        );

    if (
        existing.length !== input.itemIds.length ||
        input.itemIds.some((id) => !existing.some((row) => row.id === id))
    )
        throw new MutationFailure(
            'conflict',
            'Budget organization changed. Refresh and try again.'
        );
    for (const [index, id] of input.itemIds.entries())
        await tx
            .update(budgetItems)
            .set({
                sortOrder: (index + 1) * 10,
                updatedAt: new Date()
            })
            .where(eq(budgetItems.id, id));
}
