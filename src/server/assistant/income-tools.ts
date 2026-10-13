import 'server-only';
import { z } from 'zod';
import type { IncomePlanView } from '@/domain/types';
import {
    categoryIconSchema,
    categoryToneSchema
} from '@/server/mutation-schema';
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
import {
    AssistantToolError,
    resolveIncomePlan,
    resolveIncomeReceipt
} from './resolve';

const optionalMonth = { month: z.string().optional() };

export async function addIncomeSource(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            ...optionalMonth,
            name: z.string(),
            expected_amount: z.string(),
            one_time: z.boolean().optional()
        }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const expectedCents = dollars(args.expected_amount, 'Expected amount', {
        allowZero: true
    });
    const after = await commit(
        {
            type: 'addIncomePlan',
            monthKey,
            name: args.name,
            icon: 'wallet',
            tone: 'mint',
            expectedCents,
            oneTime: args.one_time ?? false
        },
        context
    );

    return `Added ${args.one_time ? 'one-time ' : ''}income source ${args.name} expecting ${money(expectedCents)} in ${monthKey}. Left to budget: ${money(after.summary.leftToBudgetCents)}.`;
}

export async function updateIncomeSource(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            ...optionalMonth,
            source: z.string(),
            new_name: z.string().optional(),
            expected_amount: z.string().optional(),
            one_time: z.boolean().optional()
        }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const plan = resolveIncomePlan(
        await snapshotFor(monthKey, context),
        args.source
    );
    const expectedCents =
        args.expected_amount === undefined
            ? plan.expectedCents
            : dollars(args.expected_amount, 'Expected amount', {
                  allowZero: true
              });
    const name = args.new_name || plan.name;
    const oneTime = args.one_time ?? plan.oneTime;

    await commit(
        {
            type: 'updateIncomePlan',
            monthKey,
            incomePlanId: plan.id,
            expectedVersion: plan.version,
            name,
            icon: categoryIconSchema.catch('wallet').parse(plan.icon),
            tone: categoryToneSchema.catch('mint').parse(plan.tone),
            expectedCents,
            oneTime
        },
        context
    );

    return `Income source ${name} now expects ${money(expectedCents)} in ${monthKey} and ${oneTime ? 'is one-time, so copying the month leaves it behind' : 'carries forward when the month is copied'}.`;
}

export async function recordIncome(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            source: z.string(),
            date: dateSchema,
            amount: z.string(),
            note: z.string().optional()
        }),
        input
    );
    const monthKey = monthOfDate(args.date);
    const plan = resolveIncomePlan(
        await snapshotFor(monthKey, context),
        args.source
    );
    const amountCents = dollars(args.amount, 'Amount');
    const after = await commit(
        {
            type: 'addIncomeReceipt',
            monthKey,
            incomePlanId: plan.id,
            receivedOn: args.date,
            amountCents,
            note: args.note || undefined
        },
        context
    );

    return `Recorded ${money(amountCents)} from ${plan.name} on ${args.date}. Received this month: ${money(after.summary.receivedIncomeCents)}.`;
}

export async function updateIncomeReceipt(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            ...optionalMonth,
            ref: z.string(),
            date: dateSchema.optional(),
            amount: z.string().optional(),
            note: z.string().optional()
        }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const { plan, receipt } = resolveIncomeReceipt(
        await snapshotFor(monthKey, context),
        args.ref
    );
    const receivedOn = args.date ?? receipt.receivedOn;

    if (monthOfDate(receivedOn) !== monthKey)
        throw new AssistantToolError(
            `Received income stays in its source's month, so the date must fall in ${monthKey}. Nothing was changed. Offer to record the amount again in the other month and then delete this receipt.`
        );
    const amountCents =
        args.amount === undefined
            ? receipt.amountCents
            : dollars(args.amount, 'Amount');
    const note = (args.note ?? receipt.note ?? '').trim();
    const after = await commit(
        {
            type: 'updateIncomeReceipt',
            monthKey,
            incomeReceiptId: receipt.id,
            expectedVersion: receipt.version,
            receivedOn,
            amountCents,
            note: note || undefined
        },
        context
    );

    return `Updated ${plan.name} received income to ${money(amountCents)} on ${receivedOn}${note ? ` with note "${note}"` : ' with no note'}. Received this month: ${money(after.summary.receivedIncomeCents)}.`;
}

export async function deleteIncomeReceipt(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({ ...optionalMonth, ref: z.string() }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const { plan, receipt } = resolveIncomeReceipt(
        await snapshotFor(monthKey, context),
        args.ref
    );
    const after = await commit(
        {
            type: 'deleteIncomeReceipt',
            monthKey,
            incomeReceiptId: receipt.id,
            expectedVersion: receipt.version
        },
        context
    );

    return `Deleted ${money(receipt.amountCents)} received from ${plan.name} on ${receipt.receivedOn}. Received this month: ${money(after.summary.receivedIncomeCents)}.`;
}

function confirmReceivedAmount(
    plan: IncomePlanView,
    monthKey: string,
    confirmed: string | undefined
): void {
    if (BigInt(plan.receivedCents) === 0n) return;
    const received = money(plan.receivedCents);

    if (confirmed === undefined)
        throw new AssistantToolError(
            `${plan.name} has ${received} received in ${monthKey}. Nothing was deleted. Tell the person that amount is deleted with the source, ask them to confirm, then call again with received_amount "${received}".`
        );
    if (dollars(confirmed, 'Received amount') !== plan.receivedCents)
        throw new AssistantToolError(
            `${plan.name}'s received income is now ${received}, not ${confirmed}. Nothing was deleted. Tell the person the new amount and ask again before deleting.`
        );
}

export async function deleteIncomeSource(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(
        z.object({
            ...optionalMonth,
            source: z.string(),
            received_amount: z.string().optional()
        }),
        input
    );
    const monthKey = resolveMonth(args.month, context);
    const plan = resolveIncomePlan(
        await snapshotFor(monthKey, context),
        args.source
    );

    confirmReceivedAmount(plan, monthKey, args.received_amount);
    const after = await commit(
        {
            type: 'deleteIncomePlan',
            monthKey,
            incomePlanId: plan.id,
            expectedVersion: plan.version,
            receiptIds: plan.receipts.map((receipt) => receipt.id)
        },
        context
    );
    const count = plan.receipts.length;
    const removed =
        count > 0
            ? ` along with ${count} receipt${count === 1 ? '' : 's'} totaling ${money(plan.receivedCents)}`
            : '';

    return `Deleted income source ${plan.name} from ${monthKey}${removed}. Expected income is now ${money(after.summary.expectedIncomeCents)}, received ${money(after.summary.receivedIncomeCents)}, left to budget ${money(after.summary.leftToBudgetCents)}.`;
}
