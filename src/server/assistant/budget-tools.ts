import 'server-only';
import { z } from 'zod';
import { cents } from '@/domain/money';
import {
    commit,
    dollars,
    money,
    parseInput,
    resolveMonth,
    snapshotFor,
    type AssistantToolContext
} from './commit';
import { resolveCategory, resolveItem } from './resolve';

const optionalMonth = { month: z.string().optional() };

export async function setPlanAmount(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({ ...optionalMonth, item: z.string(), amount: z.string() }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const item = resolveItem(await snapshotFor(monthKey, context), args.item);
    const plannedCents = dollars(args.amount, 'Planned amount', {
        allowZero: true
    });
    const after = await commit(
        {
            type: 'updatePlan',
            monthKey,
            monthlyItemId: item.id,
            plannedCents,
            expectedVersion: item.version
        },
        context
    );

    return `${item.name} planned is now ${money(plannedCents)} for ${monthKey}. Left to budget: ${money(after.summary.leftToBudgetCents)}.`;
}

export async function setCarryover(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({ ...optionalMonth, item: z.string(), enabled: z.boolean() }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const item = resolveItem(await snapshotFor(monthKey, context), args.item);

    await commit(
        {
            type: 'toggleCarryover',
            monthKey,
            monthlyItemId: item.id,
            enabled: args.enabled,
            expectedVersion: item.version
        },
        context
    );

    return `Carryover for ${item.name} in ${monthKey} is now ${args.enabled ? 'on' : 'off'}.`;
}

export async function addCategory(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({ ...optionalMonth, name: z.string() }),
        input
    );
    const monthKey = resolveMonth(args.month, context);

    await commit({ type: 'addCategory', monthKey, name: args.name }, context);

    return `Added category ${args.name} to ${monthKey}.`;
}

export async function addItem(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            ...optionalMonth,
            category: z.string(),
            name: z.string(),
            planned_amount: z.string().optional()
        }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const category = resolveCategory(
        await snapshotFor(monthKey, context),
        args.category
    );
    const plannedCents = args.planned_amount
        ? dollars(args.planned_amount, 'Planned amount', { allowZero: true })
        : cents(0);

    await commit(
        {
            type: 'addItem',
            monthKey,
            categoryId: category.id,
            name: args.name,
            plannedCents
        },
        context
    );

    return `Added ${args.name} to ${category.name} in ${monthKey} with ${money(plannedCents)} planned.`;
}

export async function renameCategory(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            ...optionalMonth,
            category: z.string(),
            new_name: z.string()
        }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const category = resolveCategory(
        await snapshotFor(monthKey, context),
        args.category
    );

    await commit(
        {
            type: 'renameCategory',
            monthKey,
            categoryId: category.id,
            name: args.new_name,
            expectedVersion: category.version
        },
        context
    );

    return `Renamed category ${category.name} to ${args.new_name}.`;
}

export async function renameItem(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({ ...optionalMonth, item: z.string(), new_name: z.string() }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const item = resolveItem(await snapshotFor(monthKey, context), args.item);

    await commit(
        {
            type: 'renameItem',
            monthKey,
            itemId: item.definitionId,
            name: args.new_name,
            expectedVersion: item.definitionVersion
        },
        context
    );

    return `Renamed ${item.name} to ${args.new_name}.`;
}

export async function setMonthNote(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({ ...optionalMonth, note: z.string() }),
        input
    );
    const monthKey = resolveMonth(args.month, context);

    await commit(
        { type: 'updateMonthNote', monthKey, note: args.note },
        context
    );

    return args.note.trim()
        ? `Saved the ${monthKey} note.`
        : `Cleared the ${monthKey} note.`;
}
