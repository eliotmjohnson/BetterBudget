import 'server-only';
import { z } from 'zod';
import { cents, type Cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import {
    commit,
    dateSchema,
    dollars,
    money,
    monthOfDate,
    parseInput,
    resolveMonth,
    snapshotFor,
    type AssistantToolContext
} from './commit';
import { transactionRef } from './render';
import { AssistantToolError, resolveItem, resolveTransaction } from './resolve';

const splitsSchema = z
    .array(z.object({ item: z.string(), amount: z.string() }))
    .min(1)
    .max(20);
const kindSchema = z
    .enum(['expense', 'income', 'refund'])
    .transform((kind) => (kind === 'expense' ? 'expense' : 'refund'));
const kindLabel = (kind: 'expense' | 'refund') =>
    kind === 'refund' ? 'income' : 'expense';
const addSchema = z.object({
    kind: kindSchema,
    merchant: z.string(),
    date: dateSchema,
    amount: z.string(),
    item: z.string().optional(),
    splits: splitsSchema.optional(),
    note: z.string().optional()
});
const updateSchema = z.object({
    month: z.string().optional(),
    ref: z.string(),
    kind: kindSchema.optional(),
    merchant: z.string().optional(),
    date: dateSchema.optional(),
    amount: z.string().optional(),
    item: z.string().optional(),
    splits: splitsSchema.optional(),
    note: z.string().optional()
});
const deleteSchema = z.object({
    month: z.string().optional(),
    ref: z.string()
});

type Allocation = { monthlyItemId: string; amountCents: Cents };

function allocate(
    snapshot: MonthSnapshot,
    totalCents: Cents,
    target: { item?: string; splits?: Array<{ item: string; amount: string }> }
): Allocation[] | null {
    if (target.splits?.length) {
        const allocations = target.splits.map((split) => ({
            monthlyItemId: resolveItem(snapshot, split.item).id,
            amountCents: dollars(split.amount, 'Split amount')
        }));
        const sum = allocations.reduce(
            (total, allocation) => total + BigInt(allocation.amountCents),
            0n
        );

        if (sum !== BigInt(totalCents))
            throw new AssistantToolError(
                `The splits add up to ${money(cents(sum))} but the total is ${money(totalCents)}. They must match exactly.`
            );

        return allocations;
    }
    if (target.item)
        return [
            {
                monthlyItemId: resolveItem(snapshot, target.item).id,
                amountCents: totalCents
            }
        ];

    return null;
}

function describeAllocations(
    snapshot: MonthSnapshot,
    allocations: Allocation[]
) {
    const names = new Map(
        snapshot.categories.flatMap((category) =>
            category.items.map((item) => [item.id, item] as const)
        )
    );

    return allocations
        .map((allocation) => {
            const item = names.get(allocation.monthlyItemId);

            return `${item?.name ?? 'item'} ${money(allocation.amountCents)} (available now ${money(item?.availableCents ?? '0')})`;
        })
        .join(', ');
}

export async function addTransaction(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(addSchema, input);
    const monthKey = monthOfDate(args.date);
    const snapshot = await snapshotFor(monthKey, context);
    const totalCents = dollars(args.amount, 'Amount');
    const splits = allocate(snapshot, totalCents, args);

    if (!splits)
        throw new AssistantToolError(
            'Say which budget item this belongs to (item), or give splits.'
        );
    const after = await commit(
        {
            type: 'addTransaction',
            monthKey,
            kind: args.kind,
            merchant: args.merchant,
            occurredOn: args.date,
            totalCents,
            note: args.note || undefined,
            splits
        },
        context
    );

    return `Added ${kindLabel(args.kind)} ${args.merchant} ${money(totalCents)} on ${args.date}: ${describeAllocations(after, splits)}.`;
}

function updatedAllocations(
    snapshot: MonthSnapshot,
    args: z.infer<typeof updateSchema>,
    totalCents: Cents,
    existing: Allocation[]
): Allocation[] {
    const explicit = allocate(snapshot, totalCents, args);

    if (explicit) return explicit;
    if (args.amount === undefined) return existing;
    if (existing.length === 1 && existing[0])
        return [{ ...existing[0], amountCents: totalCents }];

    throw new AssistantToolError(
        'This transaction is split. Pass the new splits along with the new amount.'
    );
}

export async function updateTransaction(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(updateSchema, input);
    const monthKey = resolveMonth(args.month, context);
    const snapshot = await snapshotFor(monthKey, context);
    const entry = resolveTransaction(snapshot, args.ref);
    const totalCents =
        args.amount === undefined
            ? entry.amountCents
            : dollars(args.amount, 'Amount');
    const occurredOn = args.date ?? entry.occurredOn;
    const splits = updatedAllocations(
        snapshot,
        args,
        totalCents,
        entry.allocations ?? []
    );
    const note = args.note ?? entry.note ?? '';

    await commit(
        {
            type: 'updateTransaction',
            monthKey,
            transactionId: entry.id,
            expectedVersion: entry.version,
            kind: args.kind ?? (entry.type === 'refund' ? 'refund' : 'expense'),
            merchant: args.merchant ?? entry.title,
            occurredOn,
            totalCents,
            note: note || undefined,
            splits
        },
        context,
        [monthOfDate(occurredOn)]
    );

    return `Updated ${transactionRef(entry.id)}: ${args.merchant ?? entry.title} ${money(totalCents)} on ${occurredOn}.`;
}

export async function deleteTransaction(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(deleteSchema, input);
    const monthKey = resolveMonth(args.month, context);
    const entry = resolveTransaction(
        await snapshotFor(monthKey, context),
        args.ref
    );

    await commit(
        {
            type: 'deleteTransaction',
            monthKey,
            transactionId: entry.id,
            expectedVersion: entry.version
        },
        context
    );

    return `Deleted ${entry.title} ${money(entry.amountCents)} from ${entry.occurredOn}.`;
}
