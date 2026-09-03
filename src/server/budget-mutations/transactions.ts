import 'server-only';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { MonthKey } from '@/domain/money';
import { splitsMatchTotal } from '@/domain/budget-calculations';
import {
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from '@/db/schema';
import {
    MutationFailure,
    throwTransactionMutationFailure
} from '@/server/mutation-failures';
import { ensureMonth, type MutationContext } from './context';

export async function addTransaction({
    tx,
    monthId,
    input
}: MutationContext<'addTransaction'>): Promise<void> {
    const total = BigInt(input.totalCents);

    if (!splitsMatchTotal(input.totalCents, input.splits))
        throw new MutationFailure(
            'split_mismatch',
            'Split amounts must equal the transaction total.'
        );
    const allowed = await tx
        .select({ id: monthlyBudgetItems.id })
        .from(monthlyBudgetItems)
        .where(eq(monthlyBudgetItems.monthId, monthId));
    const allowedIds = new Set(allowed.map((row) => row.id));

    if (input.splits.some((split) => !allowedIds.has(split.monthlyItemId)))
        throw new MutationFailure(
            'validation',
            'Choose budget items from this month.'
        );
    const id = crypto.randomUUID();

    await tx.insert(transactions).values({
        id,
        monthId,
        kind: input.kind,
        merchant: input.merchant,
        occurredOn: input.occurredOn,
        totalCents: total,
        note: input.note
    });
    await tx.insert(transactionSplits).values(
        input.splits.map((split) => ({
            transactionId: id,
            monthlyItemId: split.monthlyItemId,
            amountCents: BigInt(split.amountCents)
        }))
    );
}

export async function updateTransaction({
    tx,
    householdId,
    monthId,
    input
}: MutationContext<'updateTransaction'>): Promise<void> {
    const total = BigInt(input.totalCents);

    if (!splitsMatchTotal(input.totalCents, input.splits))
        throw new MutationFailure(
            'split_mismatch',
            'Split amounts must equal the transaction total.'
        );
    const sourcePlans = await tx
        .select({
            id: monthlyBudgetItems.id,
            budgetItemId: monthlyBudgetItems.budgetItemId
        })
        .from(monthlyBudgetItems)
        .where(
            and(
                eq(monthlyBudgetItems.monthId, monthId),
                inArray(
                    monthlyBudgetItems.id,
                    input.splits.map((split) => split.monthlyItemId)
                )
            )
        );

    if (sourcePlans.length !== input.splits.length)
        throw new MutationFailure(
            'validation',
            'Choose budget items from this month.'
        );
    const destinationKey = input.occurredOn.slice(0, 7) as MonthKey;
    const destinationMonthId =
        destinationKey === input.monthKey
            ? monthId
            : await ensureMonth(tx, householdId, destinationKey);
    let normalizedSplits = input.splits;

    if (destinationMonthId !== monthId) {
        const destinationPlans = await tx
            .select({
                id: monthlyBudgetItems.id,
                budgetItemId: monthlyBudgetItems.budgetItemId
            })
            .from(monthlyBudgetItems)
            .where(
                and(
                    eq(monthlyBudgetItems.monthId, destinationMonthId),
                    inArray(
                        monthlyBudgetItems.budgetItemId,
                        sourcePlans.map((plan) => plan.budgetItemId)
                    )
                )
            );
        const destinationByDefinition = new Map(
            destinationPlans.map((plan) => [plan.budgetItemId, plan.id])
        );
        const sourceByMonthlyId = new Map(
            sourcePlans.map((plan) => [plan.id, plan.budgetItemId])
        );

        normalizedSplits = input.splits.map((split) => ({
            ...split,
            monthlyItemId:
                destinationByDefinition.get(
                    sourceByMonthlyId.get(split.monthlyItemId) ?? ''
                ) ?? ''
        }));
        if (normalizedSplits.some((split) => !split.monthlyItemId))
            throw new MutationFailure(
                'validation',
                'The destination month needs matching budget items before this transaction can move.'
            );
    }
    const updated = await tx
        .update(transactions)
        .set({
            monthId: destinationMonthId,
            kind: input.kind,
            merchant: input.merchant,
            occurredOn: input.occurredOn,
            totalCents: total,
            note: input.note,
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(transactions.id, input.transactionId),
                eq(transactions.monthId, monthId),
                eq(transactions.version, input.expectedVersion),
                isNull(transactions.deletedAt)
            )
        )
        .returning({ id: transactions.id });

    if (!updated[0])
        await throwTransactionMutationFailure(tx, monthId, input.transactionId);
    await tx
        .delete(transactionSplits)
        .where(eq(transactionSplits.transactionId, input.transactionId));
    await tx.insert(transactionSplits).values(
        normalizedSplits.map((split) => ({
            transactionId: input.transactionId,
            monthlyItemId: split.monthlyItemId,
            amountCents: BigInt(split.amountCents)
        }))
    );
}

export async function deleteTransaction({
    tx,
    monthId,
    input
}: MutationContext<'deleteTransaction'>): Promise<void> {
    const updated = await tx
        .update(transactions)
        .set({
            deletedAt: new Date(),
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(transactions.id, input.transactionId),
                eq(transactions.monthId, monthId),
                eq(transactions.version, input.expectedVersion),
                isNull(transactions.deletedAt)
            )
        )
        .returning({ id: transactions.id });

    if (!updated[0])
        await throwTransactionMutationFailure(tx, monthId, input.transactionId);
}

export async function undoDeleteTransaction({
    tx,
    monthId,
    input
}: MutationContext<'undoDeleteTransaction'>): Promise<void> {
    const updated = await tx
        .update(transactions)
        .set({
            deletedAt: null,
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(transactions.id, input.transactionId),
                eq(transactions.monthId, monthId),
                eq(transactions.version, input.expectedVersion),
                isNotNull(transactions.deletedAt)
            )
        )
        .returning({ id: transactions.id });

    if (!updated[0])
        await throwTransactionMutationFailure(tx, monthId, input.transactionId);
}
