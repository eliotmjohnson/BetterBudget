import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { MonthKey } from '@/domain/money';
import type { AppDb } from '@/db';
import { budgetMonths } from '@/db/schema';
import { monthDate } from '@/domain/calendar';
import type { BudgetMutation } from '@/server/mutation-schema';
import { MutationFailure } from '@/server/mutation-failures';

export type MutationOf<T extends BudgetMutation['type']> = Extract<
    BudgetMutation,
    { type: T }
>;

export interface MutationContext<T extends BudgetMutation['type']> {
    tx: AppDb;
    householdId: string;
    monthId: string;
    input: MutationOf<T>;
}

export async function ensureMonth(
    db: AppDb,
    householdId: string,
    monthKey: MonthKey
): Promise<string> {
    const date = monthDate(monthKey);

    await db
        .insert(budgetMonths)
        .values({ householdId, month: date })
        .onConflictDoNothing();
    const row = await db
        .select({ id: budgetMonths.id })
        .from(budgetMonths)
        .where(
            and(
                eq(budgetMonths.householdId, householdId),
                eq(budgetMonths.month, date)
            )
        )
        .limit(1);

    if (!row[0])
        throw new MutationFailure(
            'not_found',
            'Budget month could not be created.'
        );

    return row[0].id;
}
