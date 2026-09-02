import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { MutationErrorCode } from '@/domain/types';
import type { AppDb } from '@/db';
import {
    budgetItems,
    categories,
    monthlyBudgetItems,
    transactions
} from '@/db/schema';

export class MutationFailure extends Error {
    constructor(
        readonly code: MutationErrorCode,
        message: string
    ) {
        super(message);
    }
}

export async function throwMonthlyItemMutationFailure(
    db: AppDb,
    monthId: string,
    id: string
): Promise<never> {
    const rows = await db
        .select({ id: monthlyBudgetItems.id })
        .from(monthlyBudgetItems)
        .where(
            and(
                eq(monthlyBudgetItems.id, id),
                eq(monthlyBudgetItems.monthId, monthId)
            )
        )
        .limit(1);

    if (!rows[0])
        throw new MutationFailure('not_found', 'That budget item is not here.');

    throw new MutationFailure(
        'conflict',
        'This changed on another device. The latest version has been loaded.'
    );
}

export async function throwTransactionMutationFailure(
    db: AppDb,
    monthId: string,
    id: string
): Promise<never> {
    const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.monthId, monthId)))
        .limit(1);

    if (!rows[0])
        throw new MutationFailure(
            'not_found',
            'That transaction is not in this month.'
        );

    throw new MutationFailure(
        'conflict',
        'This changed on another device. The latest version has been loaded.'
    );
}

export async function throwCategoryMutationFailure(
    db: AppDb,
    householdId: string,
    id: string
): Promise<never> {
    const rows = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
            and(eq(categories.id, id), eq(categories.householdId, householdId))
        )
        .limit(1);

    if (!rows[0])
        throw new MutationFailure('not_found', 'That category is not here.');

    throw new MutationFailure(
        'conflict',
        'This changed on another device. The latest version has been loaded.'
    );
}

export async function throwItemDefinitionMutationFailure(
    db: AppDb,
    householdId: string,
    id: string
): Promise<never> {
    const rows = await db
        .select({ id: budgetItems.id })
        .from(budgetItems)
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(
            and(eq(budgetItems.id, id), eq(categories.householdId, householdId))
        )
        .limit(1);

    if (!rows[0])
        throw new MutationFailure('not_found', 'That budget item is not here.');

    throw new MutationFailure(
        'conflict',
        'This changed on another device. The latest version has been loaded.'
    );
}
