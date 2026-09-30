import 'server-only';
import { and, eq, gt, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    monthlyBudgetItems
} from '@/db/schema';
import { monthDate } from '@/domain/calendar';
import { MutationFailure } from '@/server/mutation-failures';
import type { MonthKey } from '@/domain/money';

export const definitionActiveIn = (month: string | typeof budgetMonths.month) =>
    and(
        or(
            isNull(categories.archivedAt),
            gt(categories.archivedFromMonth, month)
        ),
        or(
            isNull(budgetItems.archivedAt),
            gt(budgetItems.archivedFromMonth, month)
        )
    );

/** Monthly items whose category and item definitions are live in `month`. */
export const activeMonthlyItems = (tx: AppDb, month: string, condition: SQL) =>
    tx
        .select({
            id: monthlyBudgetItems.id,
            budgetItemId: monthlyBudgetItems.budgetItemId,
            name: budgetItems.name,
            plannedCents: monthlyBudgetItems.plannedCents
        })
        .from(monthlyBudgetItems)
        .innerJoin(
            budgetItems,
            eq(monthlyBudgetItems.budgetItemId, budgetItems.id)
        )
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(and(definitionActiveIn(month), condition));

/** Resolves the live source and destination items of a money move. */
export async function activeMovePair({
    tx,
    monthId,
    input
}: {
    tx: AppDb;
    monthId: string;
    input: { monthKey: MonthKey; fromItemId: string; toItemId: string };
}) {
    const { fromItemId, toItemId } = input;

    if (fromItemId === toItemId)
        throw new MutationFailure(
            'validation',
            'Choose two different budget items.'
        );
    const rows = await activeMonthlyItems(
        tx,
        monthDate(input.monthKey),
        and(
            eq(monthlyBudgetItems.monthId, monthId),
            inArray(monthlyBudgetItems.id, [fromItemId, toItemId])
        )!
    );
    const from = rows.find((row) => row.id === fromItemId);
    const to = rows.find((row) => row.id === toItemId);

    if (!from || !to)
        throw new MutationFailure('not_found', 'That budget item is not here.');

    return { from, to };
}
