import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { incomePlans, incomeReceipts } from '@/db/schema';
import { MutationFailure } from '@/server/mutation-failures';
import type { MutationContext } from './context';

export async function addIncomePlan({
    tx,
    monthId,
    input
}: MutationContext<'addIncomePlan'>): Promise<void> {
    const existing = await tx
        .select({ sortOrder: incomePlans.sortOrder })
        .from(incomePlans)
        .where(eq(incomePlans.monthId, monthId));
    const nextOrder = Math.max(0, ...existing.map((row) => row.sortOrder)) + 10;

    await tx.insert(incomePlans).values({
        monthId,
        name: input.name,
        icon: input.icon,
        tone: input.tone,
        expectedCents: BigInt(input.expectedCents),
        sortOrder: nextOrder
    });
}

export async function updateIncomePlan({
    tx,
    monthId,
    input
}: MutationContext<'updateIncomePlan'>): Promise<void> {
    const updated = await tx
        .update(incomePlans)
        .set({
            name: input.name,
            icon: input.icon,
            tone: input.tone,
            expectedCents: BigInt(input.expectedCents),
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(
            and(
                eq(incomePlans.id, input.incomePlanId),
                eq(incomePlans.monthId, monthId),
                eq(incomePlans.version, input.expectedVersion)
            )
        )
        .returning({ id: incomePlans.id });

    if (updated[0]) return;
    const existing = await tx
        .select({ id: incomePlans.id })
        .from(incomePlans)
        .where(
            and(
                eq(incomePlans.id, input.incomePlanId),
                eq(incomePlans.monthId, monthId)
            )
        )
        .limit(1);

    if (!existing[0])
        throw new MutationFailure(
            'not_found',
            'That income source no longer exists.'
        );

    throw new MutationFailure(
        'conflict',
        'This income source changed on another device. The latest version has been loaded.'
    );
}

export async function addIncomeReceipt({
    tx,
    monthId,
    input
}: MutationContext<'addIncomeReceipt'>): Promise<void> {
    const plan = await tx
        .select({ id: incomePlans.id })
        .from(incomePlans)
        .where(
            and(
                eq(incomePlans.id, input.incomePlanId),
                eq(incomePlans.monthId, monthId)
            )
        )
        .limit(1);

    if (!plan[0])
        throw new MutationFailure(
            'validation',
            'Choose an income source from this month.'
        );
    await tx.insert(incomeReceipts).values({
        incomePlanId: input.incomePlanId,
        receivedOn: input.receivedOn,
        amountCents: BigInt(input.amountCents),
        note: input.note
    });
}

export async function deleteIncomeReceipt({
    tx,
    monthId,
    input
}: MutationContext<'deleteIncomeReceipt'>): Promise<void> {
    const receipt = await tx
        .select({ version: incomeReceipts.version })
        .from(incomeReceipts)
        .innerJoin(incomePlans, eq(incomeReceipts.incomePlanId, incomePlans.id))
        .where(
            and(
                eq(incomeReceipts.id, input.incomeReceiptId),
                eq(incomePlans.monthId, monthId),
                isNull(incomeReceipts.deletedAt)
            )
        )
        .limit(1);

    if (!receipt[0])
        throw new MutationFailure(
            'not_found',
            'That received-income transaction no longer exists.'
        );
    if (receipt[0].version !== input.expectedVersion)
        throw new MutationFailure(
            'conflict',
            'This income transaction changed on another device. The latest version has been loaded.'
        );
    await tx
        .update(incomeReceipts)
        .set({
            deletedAt: new Date(),
            version: input.expectedVersion + 1,
            updatedAt: new Date()
        })
        .where(eq(incomeReceipts.id, input.incomeReceiptId));
}

export async function deleteIncomePlan({
    tx,
    monthId,
    input
}: MutationContext<'deleteIncomePlan'>): Promise<void> {
    const plan = await tx
        .select({ version: incomePlans.version })
        .from(incomePlans)
        .where(
            and(
                eq(incomePlans.id, input.incomePlanId),
                eq(incomePlans.monthId, monthId)
            )
        )
        .limit(1);

    if (!plan[0])
        throw new MutationFailure(
            'not_found',
            'That income source no longer exists.'
        );
    if (plan[0].version !== input.expectedVersion)
        throw new MutationFailure(
            'conflict',
            'This income source changed on another device. The latest version has been loaded.'
        );
    const activeReceipt = await tx
        .select({ id: incomeReceipts.id })
        .from(incomeReceipts)
        .where(
            and(
                eq(incomeReceipts.incomePlanId, input.incomePlanId),
                isNull(incomeReceipts.deletedAt)
            )
        )
        .limit(1);

    if (activeReceipt[0])
        throw new MutationFailure(
            'validation',
            'Delete this source’s received-income transactions first.'
        );
    await tx
        .delete(incomeReceipts)
        .where(eq(incomeReceipts.incomePlanId, input.incomePlanId));
    await tx
        .delete(incomePlans)
        .where(
            and(
                eq(incomePlans.id, input.incomePlanId),
                eq(incomePlans.monthId, monthId)
            )
        );
}
