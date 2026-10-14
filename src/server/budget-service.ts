import 'server-only';
import { and, eq, lt } from 'drizzle-orm';
import type { MonthKey } from '@/domain/money';
import type { MutationResult } from '@/domain/types';
import { getDatabase, type AppDb } from '@/db';
import { budgetMonths, mutationReceipts } from '@/db/schema';
import type { BudgetMutation } from './mutation-schema';
import { monthDate } from '@/domain/calendar';
import { getMonthSnapshot } from './month-snapshot';
import { MutationFailure } from './mutation-failures';
import { lockHouseholdWrites } from './household-lock';
import {
    ensureMonth,
    type MutationContext
} from '@/server/budget-mutations/context';
import {
    movePlannedAmount,
    toggleCarryover,
    updatePlan
} from '@/server/budget-mutations/plans';
import {
    addTransaction,
    deleteTransaction,
    transferBetweenItems,
    restoreTransactions,
    undoDeleteTransaction,
    updateTransaction
} from '@/server/budget-mutations/transactions';
import {
    addIncomePlan,
    addIncomeReceipt,
    deleteIncomePlan,
    deleteIncomeReceipt,
    updateIncomePlan,
    updateIncomeReceipt
} from '@/server/budget-mutations/income';
import {
    addCategory,
    addItem,
    archiveCategory,
    archiveItem,
    deleteCategory,
    deleteItem,
    renameCategory,
    renameItem,
    reorderCategories,
    reorderItems
} from '@/server/budget-mutations/structure';
import {
    setBillDueOverride,
    updateBillReminder
} from '@/server/budget-mutations/bill-reminders';
import {
    clearPlannedAmounts,
    copyPreviousMonth,
    resetBudget,
    updateMonthNote
} from '@/server/budget-mutations/month-operations';

async function recordMutationReceipt(
    db: AppDb,
    householdId: string,
    input: BudgetMutation
): Promise<void> {
    await db.insert(mutationReceipts).values({
        householdId,
        clientMutationId: input.clientMutationId,
        operation: input.type,
        month: monthDate(input.monthKey),
        result: { ok: true }
    });
}

const MUTATION_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function pruneMutationReceipts(
    db: AppDb,
    householdId: string
): Promise<void> {
    try {
        await db
            .delete(mutationReceipts)
            .where(
                and(
                    eq(mutationReceipts.householdId, householdId),
                    lt(
                        mutationReceipts.createdAt,
                        new Date(Date.now() - MUTATION_RECEIPT_RETENTION_MS)
                    )
                )
            );
    } catch (error) {
        console.error(error);
    }
}

/**
 * The handler for each mutation type. A mapped `Record` rather than a switch,
 * so a new mutation type must name its handler.
 */
const handlers: {
    [K in BudgetMutation['type']]: (
        context: MutationContext<K>
    ) => Promise<void>;
} = {
    updatePlan,
    toggleCarryover,
    movePlannedAmount,
    transferBetweenItems,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    undoDeleteTransaction,
    restoreTransactions,
    addIncomePlan,
    updateIncomePlan,
    addIncomeReceipt,
    updateIncomeReceipt,
    deleteIncomeReceipt,
    deleteIncomePlan,
    addCategory,
    addItem,
    renameCategory,
    renameItem,
    updateBillReminder,
    setBillDueOverride,
    archiveCategory,
    archiveItem,
    deleteCategory,
    deleteItem,
    reorderCategories,
    reorderItems,
    updateMonthNote,
    copyPreviousMonth,
    clearPlannedAmounts,
    resetBudget
};

function dispatch(
    tx: AppDb,
    householdId: string,
    monthId: string,
    input: BudgetMutation
): Promise<void> {
    const handler = handlers[input.type] as (
        context: MutationContext<BudgetMutation['type']>
    ) => Promise<void>;

    return handler({ tx, householdId, monthId, input });
}

export async function applyBudgetMutation(
    input: BudgetMutation,
    householdId: string
): Promise<MutationResult> {
    const db = await getDatabase();
    const duplicate = await db
        .select({ id: mutationReceipts.id })
        .from(mutationReceipts)
        .where(
            and(
                eq(mutationReceipts.householdId, householdId),
                eq(mutationReceipts.clientMutationId, input.clientMutationId)
            )
        )
        .limit(1);

    if (duplicate[0])
        return {
            ok: true,
            snapshot: await getMonthSnapshot(input.monthKey, householdId),
            clientMutationId: input.clientMutationId
        };

    try {
        await db.transaction(async (tx) => {
            await lockHouseholdWrites(tx as AppDb, householdId);
            const noOpWhenMonthIsMissing =
                input.type === 'clearPlannedAmounts' ||
                input.type === 'resetBudget' ||
                (input.type === 'updateMonthNote' && input.note.length === 0);

            if (noOpWhenMonthIsMissing) {
                const existingMonth = await tx
                    .select({ id: budgetMonths.id })
                    .from(budgetMonths)
                    .where(
                        and(
                            eq(budgetMonths.householdId, householdId),
                            eq(budgetMonths.month, monthDate(input.monthKey))
                        )
                    )
                    .limit(1);

                if (!existingMonth[0]) {
                    await recordMutationReceipt(
                        tx as AppDb,
                        householdId,
                        input
                    );

                    return;
                }
            }
            const monthId = await ensureMonth(
                tx as AppDb,
                householdId,
                input.monthKey
            );

            if (
                (input.type === 'addTransaction' ||
                    input.type === 'transferBetweenItems') &&
                !input.occurredOn.startsWith(`${input.monthKey}-`)
            )
                throw new MutationFailure(
                    'validation',
                    'Add the transaction from its destination month.'
                );
            if (
                'receivedOn' in input &&
                !input.receivedOn.startsWith(`${input.monthKey}-`)
            )
                throw new MutationFailure(
                    'validation',
                    'Income must be recorded in the selected month.'
                );
            await dispatch(tx as AppDb, householdId, monthId, input);
            await recordMutationReceipt(tx as AppDb, householdId, input);
        });
        await pruneMutationReceipts(db, householdId);

        return {
            ok: true,
            snapshot: await getMonthSnapshot(input.monthKey, householdId),
            clientMutationId: input.clientMutationId
        };
    } catch (error) {
        const committed = await db
            .select({ id: mutationReceipts.id })
            .from(mutationReceipts)
            .where(
                and(
                    eq(mutationReceipts.householdId, householdId),
                    eq(
                        mutationReceipts.clientMutationId,
                        input.clientMutationId
                    )
                )
            )
            .limit(1);

        if (committed[0])
            return {
                ok: true,
                snapshot: await getMonthSnapshot(input.monthKey, householdId),
                clientMutationId: input.clientMutationId
            };
        const snapshot = await getMonthSnapshot(input.monthKey, householdId);

        if (error instanceof MutationFailure)
            return {
                ok: false,
                code: error.code,
                message: error.message,
                snapshot
            };
        console.error(error);

        return {
            ok: false,
            code: 'validation',
            message:
                'That change could not be saved. Your latest data has been restored.',
            snapshot
        };
    }
}

export async function getMutationStatus(
    clientMutationId: string,
    monthKey: MonthKey,
    householdId: string
) {
    const db = await getDatabase();
    const receipt = await db
        .select({ id: mutationReceipts.id })
        .from(mutationReceipts)
        .where(
            and(
                eq(mutationReceipts.householdId, householdId),
                eq(mutationReceipts.clientMutationId, clientMutationId)
            )
        )
        .limit(1);

    return receipt[0]
        ? {
              committed: true,
              snapshot: await getMonthSnapshot(monthKey, householdId)
          }
        : { committed: false as const };
}
