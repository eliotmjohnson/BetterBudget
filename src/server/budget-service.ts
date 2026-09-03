import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { MonthKey } from '@/domain/money';
import type { MutationResult } from '@/domain/types';
import { getDatabase, type AppDb } from '@/db';
import { budgetMonths, mutationReceipts } from '@/db/schema';
import type { BudgetMutation } from './mutation-schema';
import { monthDate } from '@/domain/calendar';
import { getMonthSnapshot } from './month-snapshot';
import { MutationFailure } from './mutation-failures';
import {
    ensureMonth,
    type MutationContext
} from '@/server/budget-mutations/context';
import { toggleCarryover, updatePlan } from '@/server/budget-mutations/plans';
import {
    addTransaction,
    deleteTransaction,
    undoDeleteTransaction,
    updateTransaction
} from '@/server/budget-mutations/transactions';
import {
    addIncomePlan,
    addIncomeReceipt,
    deleteIncomePlan,
    deleteIncomeReceipt,
    updateIncomePlan
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

async function dispatch(
    tx: AppDb,
    householdId: string,
    monthId: string,
    input: BudgetMutation
): Promise<void> {
    const context = <T extends BudgetMutation['type']>(
        narrowed: MutationContext<T>['input']
    ): MutationContext<T> => ({ tx, householdId, monthId, input: narrowed });

    switch (input.type) {
        case 'updatePlan':
            return updatePlan(context(input));
        case 'toggleCarryover':
            return toggleCarryover(context(input));
        case 'addTransaction':
            return addTransaction(context(input));
        case 'updateTransaction':
            return updateTransaction(context(input));
        case 'deleteTransaction':
            return deleteTransaction(context(input));
        case 'undoDeleteTransaction':
            return undoDeleteTransaction(context(input));
        case 'addIncomePlan':
            return addIncomePlan(context(input));
        case 'updateIncomePlan':
            return updateIncomePlan(context(input));
        case 'addIncomeReceipt':
            return addIncomeReceipt(context(input));
        case 'deleteIncomeReceipt':
            return deleteIncomeReceipt(context(input));
        case 'deleteIncomePlan':
            return deleteIncomePlan(context(input));
        case 'addCategory':
            return addCategory(context(input));
        case 'addItem':
            return addItem(context(input));
        case 'renameCategory':
            return renameCategory(context(input));
        case 'renameItem':
            return renameItem(context(input));
        case 'archiveCategory':
            return archiveCategory(context(input));
        case 'archiveItem':
            return archiveItem(context(input));
        case 'deleteCategory':
            return deleteCategory(context(input));
        case 'deleteItem':
            return deleteItem(context(input));
        case 'reorderCategories':
            return reorderCategories(context(input));
        case 'reorderItems':
            return reorderItems(context(input));
        case 'updateMonthNote':
            return updateMonthNote(context(input));
        case 'copyPreviousMonth':
            return copyPreviousMonth(context(input));
        case 'clearPlannedAmounts':
            return clearPlannedAmounts(context(input));
        case 'resetBudget':
            return resetBudget(context(input));
        default: {
            const unhandled: never = input;

            throw new MutationFailure(
                'validation',
                `Unsupported mutation: ${(unhandled as BudgetMutation).type}`
            );
        }
    }
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
                input.type === 'addTransaction' &&
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
