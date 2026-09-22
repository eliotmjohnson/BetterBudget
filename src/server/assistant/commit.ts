import 'server-only';
import { z } from 'zod';
import {
    formatCurrencyInput,
    monthKeySchema,
    parseDollarsToCents,
    type Cents,
    type MonthKey
} from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { applyBudgetMutation } from '@/server/budget-service';
import { getMonthSnapshot } from '@/server/month-snapshot';
import { mutationSchema, type BudgetMutation } from '@/server/mutation-schema';
import { AssistantToolError } from './resolve';

export interface AssistantToolContext {
    householdId: string;
    viewedMonth: MonthKey;
    changedMonths: Set<MonthKey>;
}

type MutationDraft = {
    [Type in BudgetMutation['type']]: Omit<
        Extract<BudgetMutation, { type: Type }>,
        'clientMutationId'
    >;
}[BudgetMutation['type']];

export const money = (value: string) => formatCurrencyInput(value);

export const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.');

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);

    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];

    throw new AssistantToolError(
        `Invalid input${issue?.path.length ? ` for ${issue.path.join('.')}` : ''}: ${issue?.message ?? 'check the arguments'}.`
    );
}

export function resolveMonth(
    value: string | undefined,
    context: AssistantToolContext
): MonthKey {
    if (value === undefined || value === '') return context.viewedMonth;
    const parsed = monthKeySchema.safeParse(value);

    if (!parsed.success)
        throw new AssistantToolError(`"${value}" is not a YYYY-MM month.`);

    return parsed.data;
}

export const monthOfDate = (date: string) => date.slice(0, 7) as MonthKey;

export function dollars(
    value: string,
    label: string,
    { allowZero = false } = {}
): Cents {
    const parsed = parseDollarsToCents(value);

    if (parsed === null)
        throw new AssistantToolError(
            `${label} "${value}" is not a plain dollar amount like 12.34.`
        );
    if (!allowZero && BigInt(parsed) === 0n)
        throw new AssistantToolError(`${label} must be greater than $0.`);

    return parsed;
}

export const snapshotFor = (month: MonthKey, context: AssistantToolContext) =>
    getMonthSnapshot(month, context.householdId);

/**
 * Commits one mutation through the same validated, idempotent service the UI
 * uses, and returns the authoritative snapshot of the mutation's month.
 */
export async function commit(
    draft: MutationDraft,
    context: AssistantToolContext,
    alsoChanged: MonthKey[] = []
): Promise<MonthSnapshot> {
    const parsed = mutationSchema.safeParse({
        ...draft,
        clientMutationId: createUuid()
    });

    if (!parsed.success)
        throw new AssistantToolError(
            parsed.error.issues[0]?.message ?? 'That change is not valid.'
        );
    const result = await applyBudgetMutation(parsed.data, context.householdId);

    if (!result.ok) throw new AssistantToolError(result.message);
    for (const month of [draft.monthKey, ...alsoChanged])
        context.changedMonths.add(month);

    return result.snapshot;
}
