import 'server-only';
import { z } from 'zod';
import {
    addCategory,
    addIncomeSource,
    addItem,
    recordIncome,
    renameCategory,
    renameItem,
    setCarryover,
    setMonthNote,
    setPlanAmount,
    updateIncomeSource
} from './budget-tools';
import {
    parseInput,
    resolveMonth,
    snapshotFor,
    type AssistantToolContext
} from './commit';
import { getHistory } from './history';
import { renderOverview, renderTransactions } from './render';
import { AssistantToolError, resolveItem } from './resolve';
import {
    addTransaction,
    deleteTransaction,
    updateTransaction
} from './transaction-tools';

type ToolHandler = (
    input: unknown,
    context: AssistantToolContext
) => Promise<string>;

async function getMonthOverview(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(z.object({ month: z.string().optional() }), input);

    return renderOverview(
        await snapshotFor(resolveMonth(args.month, context), context)
    );
}

async function listTransactions(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            month: z.string().optional(),
            search: z.string().optional(),
            item: z.string().optional()
        }),
        input
    );
    const snapshot = await snapshotFor(
        resolveMonth(args.month, context),
        context
    );

    return renderTransactions(snapshot, {
        search: args.search,
        itemId: args.item ? resolveItem(snapshot, args.item).id : undefined
    });
}

const handlers = new Map<string, ToolHandler>(
    Object.entries({
        get_month_overview: getMonthOverview,
        list_transactions: listTransactions,
        get_history: getHistory,
        set_plan_amount: setPlanAmount,
        set_carryover: setCarryover,
        add_transaction: addTransaction,
        update_transaction: updateTransaction,
        delete_transaction: deleteTransaction,
        add_income_source: addIncomeSource,
        update_income_source: updateIncomeSource,
        record_income: recordIncome,
        add_category: addCategory,
        add_item: addItem,
        rename_category: renameCategory,
        rename_item: renameItem,
        set_month_note: setMonthNote
    })
);

/**
 * Runs one tool call. Input problems come back as an error result the model
 * can correct; anything unexpected is logged and reported generically.
 */
export async function executeAssistantTool(
    name: string,
    input: unknown,
    context: AssistantToolContext
): Promise<{ content: string; isError: boolean }> {
    const handler = handlers.get(name);

    if (!handler) return { content: `Unknown tool ${name}.`, isError: true };
    try {
        return { content: await handler(input, context), isError: false };
    } catch (error) {
        if (error instanceof AssistantToolError)
            return { content: error.message, isError: true };
        console.error(error);

        return {
            content: 'That could not be completed because of a server error.',
            isError: true
        };
    }
}
