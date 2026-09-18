import 'server-only';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from '@/db/schema';
import { monthLabel } from '@/domain/money';
import { MutationFailure } from '@/server/mutation-failures';
import type { MutationOf } from './context';

type Reassignment = NonNullable<MutationOf<'archiveItem'>['reassignment']>;
type SourceRow = Awaited<ReturnType<typeof loadSourceRows>>[number];

export interface ArchivedActivity {
    sourceItemIds: string[];
    sourceLabel: string;
    excludedCategoryId?: string;
    fromDate: string;
    reassignment: Reassignment | undefined;
}

async function loadSourceRows(
    tx: AppDb,
    householdId: string,
    sourceItemIds: string[],
    fromDate: string
) {
    return tx
        .select({
            monthlyId: monthlyBudgetItems.id,
            monthId: monthlyBudgetItems.monthId,
            month: budgetMonths.month,
            plannedCents: monthlyBudgetItems.plannedCents
        })
        .from(monthlyBudgetItems)
        .innerJoin(
            budgetMonths,
            eq(monthlyBudgetItems.monthId, budgetMonths.id)
        )
        .where(
            and(
                eq(budgetMonths.householdId, householdId),
                gte(budgetMonths.month, fromDate),
                inArray(monthlyBudgetItems.budgetItemId, sourceItemIds)
            )
        );
}

async function loadDestination(
    tx: AppDb,
    householdId: string,
    { sourceItemIds, excludedCategoryId }: ArchivedActivity,
    destinationItemId: string
) {
    const [destination] = await tx
        .select({ name: budgetItems.name, categoryId: budgetItems.categoryId })
        .from(budgetItems)
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(
            and(
                eq(budgetItems.id, destinationItemId),
                eq(categories.householdId, householdId),
                isNull(budgetItems.archivedAt),
                isNull(categories.archivedAt)
            )
        )
        .limit(1);

    if (
        !destination ||
        sourceItemIds.includes(destinationItemId) ||
        destination.categoryId === excludedCategoryId
    )
        throw new MutationFailure(
            'validation',
            'Choose a different budget item to move this activity to.'
        );

    return destination;
}

async function loadDestinationRows(
    tx: AppDb,
    destinationItemId: string,
    destinationName: string,
    monthsNeeded: Map<string, string>
) {
    const rows = await tx
        .select({
            id: monthlyBudgetItems.id,
            monthId: monthlyBudgetItems.monthId
        })
        .from(monthlyBudgetItems)
        .where(
            and(
                eq(monthlyBudgetItems.budgetItemId, destinationItemId),
                inArray(monthlyBudgetItems.monthId, [...monthsNeeded.keys()])
            )
        );
    const byMonth = new Map(rows.map((row) => [row.monthId, row.id]));

    for (const [monthId, month] of monthsNeeded)
        if (!byMonth.has(monthId))
            throw new MutationFailure(
                'validation',
                `${destinationName} isn't in the ${monthLabel(month.slice(0, 7))} budget. Add it there or choose another item.`
            );

    return byMonth;
}

async function moveSplits(
    tx: AppDb,
    splits: Array<{
        id: string;
        transactionId: string;
        amountCents: bigint;
        destinationMonthlyId: string;
    }>
) {
    const transactionIds = [
        ...new Set(splits.map((split) => split.transactionId))
    ];
    const existing = await tx
        .select({
            id: transactionSplits.id,
            transactionId: transactionSplits.transactionId,
            monthlyItemId: transactionSplits.monthlyItemId
        })
        .from(transactionSplits)
        .where(
            and(
                inArray(transactionSplits.transactionId, transactionIds),
                inArray(
                    transactionSplits.monthlyItemId,
                    splits.map((split) => split.destinationMonthlyId)
                )
            )
        );
    const existingByKey = new Map(
        existing.map((row) => [
            `${row.transactionId}:${row.monthlyItemId}`,
            row.id
        ])
    );

    for (const split of splits) {
        const mergeInto = existingByKey.get(
            `${split.transactionId}:${split.destinationMonthlyId}`
        );

        if (mergeInto) {
            await tx
                .update(transactionSplits)
                .set({
                    amountCents: sql`${transactionSplits.amountCents} + ${split.amountCents}`
                })
                .where(eq(transactionSplits.id, mergeInto));
            await tx
                .delete(transactionSplits)
                .where(eq(transactionSplits.id, split.id));
        } else {
            await tx
                .update(transactionSplits)
                .set({ monthlyItemId: split.destinationMonthlyId })
                .where(eq(transactionSplits.id, split.id));
            existingByKey.set(
                `${split.transactionId}:${split.destinationMonthlyId}`,
                split.id
            );
        }
    }
    await tx
        .update(transactions)
        .set({
            version: sql`${transactions.version} + 1`,
            updatedAt: new Date()
        })
        .where(inArray(transactions.id, transactionIds));
}

async function movePlans(
    tx: AppDb,
    plannedRows: SourceRow[],
    destinationByMonth: Map<string, string>
) {
    for (const row of plannedRows) {
        await tx
            .update(monthlyBudgetItems)
            .set({
                plannedCents: sql`${monthlyBudgetItems.plannedCents} + ${row.plannedCents}`,
                version: sql`${monthlyBudgetItems.version} + 1`,
                updatedAt: new Date()
            })
            .where(
                eq(monthlyBudgetItems.id, destinationByMonth.get(row.monthId)!)
            );
        await tx
            .update(monthlyBudgetItems)
            .set({
                plannedCents: 0n,
                version: sql`${monthlyBudgetItems.version} + 1`,
                updatedAt: new Date()
            })
            .where(eq(monthlyBudgetItems.id, row.monthlyId));
    }
}

/**
 * Archiving hides a definition from `fromDate` onward, so every allocation in
 * those months must move to a live item first or its spending would vanish
 * from the month's totals. Soft-deleted transactions move too so that Undo
 * restores them onto the destination.
 */
export async function moveArchivedActivity(
    tx: AppDb,
    householdId: string,
    activity: ArchivedActivity
): Promise<void> {
    const sourceRows = await loadSourceRows(
        tx,
        householdId,
        activity.sourceItemIds,
        activity.fromDate
    );

    if (sourceRows.length === 0) return;
    const sourceByMonthlyId = new Map(
        sourceRows.map((row) => [row.monthlyId, row])
    );
    const splits = await tx
        .select({
            id: transactionSplits.id,
            transactionId: transactionSplits.transactionId,
            monthlyItemId: transactionSplits.monthlyItemId,
            amountCents: transactionSplits.amountCents,
            deletedAt: transactions.deletedAt
        })
        .from(transactionSplits)
        .innerJoin(
            transactions,
            eq(transactionSplits.transactionId, transactions.id)
        )
        .where(
            inArray(transactionSplits.monthlyItemId, [
                ...sourceByMonthlyId.keys()
            ])
        );
    const { reassignment } = activity;

    if (!reassignment) {
        if (splits.some((split) => split.deletedAt === null))
            throw new MutationFailure(
                'target_not_empty',
                `Choose where to move the transactions assigned to ${activity.sourceLabel} before deleting it.`
            );

        return;
    }
    const destination = await loadDestination(
        tx,
        householdId,
        activity,
        reassignment.destinationItemId
    );
    const plannedRows = reassignment.movePlan
        ? sourceRows.filter((row) => row.plannedCents !== 0n)
        : [];
    const monthsNeeded = new Map<string, string>();

    for (const split of splits) {
        const row = sourceByMonthlyId.get(split.monthlyItemId)!;

        monthsNeeded.set(row.monthId, row.month);
    }
    for (const row of plannedRows) monthsNeeded.set(row.monthId, row.month);
    if (monthsNeeded.size === 0) return;
    const destinationByMonth = await loadDestinationRows(
        tx,
        reassignment.destinationItemId,
        destination.name,
        monthsNeeded
    );

    if (splits.length > 0)
        await moveSplits(
            tx,
            splits.map((split) => ({
                ...split,
                destinationMonthlyId: destinationByMonth.get(
                    sourceByMonthlyId.get(split.monthlyItemId)!.monthId
                )!
            }))
        );
    await movePlans(tx, plannedRows, destinationByMonth);
}
