import { z } from 'zod';
import { monthKeySchema } from '@/domain/money';
import {
    categoryIconSchema,
    categoryToneSchema,
    centsSchema
} from '@/server/mutation-schema';

export const BACKUP_FORMAT = 'better-budget-backup';
export const BACKUP_FORMAT_VERSION = 1;

const nameSchema = z.string().trim().min(1).max(120);
const noteSchema = z.string().max(500).nullable();
const timestampSchema = z.string().datetime({ offset: true }).nullable();
const createdAtSchema = z.string().datetime({ offset: true }).optional();
const sortOrderSchema = z.number().int().min(0).max(1_000_000);
const categorySchema = z.object({
    id: z.string().uuid(),
    name: nameSchema,
    icon: categoryIconSchema,
    tone: categoryToneSchema,
    sortOrder: sortOrderSchema,
    archivedFromMonth: monthKeySchema.nullable()
});
const itemSchema = z.object({
    id: z.string().uuid(),
    categoryId: z.string().uuid(),
    name: nameSchema,
    sortOrder: sortOrderSchema,
    archivedFromMonth: monthKeySchema.nullable()
});
const monthlyItemSchema = z.object({
    budgetItemId: z.string().uuid(),
    plannedCents: centsSchema,
    carryoverEnabled: z.boolean()
});
const receiptSchema = z.object({
    id: z.string().uuid(),
    receivedOn: z.string().date(),
    amountCents: centsSchema,
    note: noteSchema,
    deletedAt: timestampSchema,
    createdAt: createdAtSchema
});
const incomePlanSchema = z.object({
    id: z.string().uuid(),
    name: nameSchema,
    icon: categoryIconSchema,
    tone: categoryToneSchema,
    expectedCents: centsSchema,
    sortOrder: sortOrderSchema,
    receipts: z.array(receiptSchema)
});
const transactionSchema = z.object({
    id: z.string().uuid(),
    kind: z.enum(['expense', 'refund']),
    merchant: nameSchema,
    occurredOn: z.string().date(),
    totalCents: centsSchema,
    note: noteSchema,
    deletedAt: timestampSchema,
    createdAt: createdAtSchema,
    splits: z
        .array(
            z.object({
                budgetItemId: z.string().uuid(),
                amountCents: centsSchema
            })
        )
        .min(1)
});
const monthSchema = z.object({
    month: monthKeySchema,
    note: noteSchema,
    categoryIds: z.array(z.string().uuid()),
    items: z.array(monthlyItemSchema),
    incomePlans: z.array(incomePlanSchema),
    transactions: z.array(transactionSchema)
});

export const backupSchema = z
    .object({
        format: z.literal(BACKUP_FORMAT),
        formatVersion: z.literal(BACKUP_FORMAT_VERSION),
        appVersion: z.string().max(40),
        exportedAt: z.string(),
        currency: z.literal('USD'),
        timeZone: z.literal('America/Chicago'),
        categories: z.array(categorySchema),
        items: z.array(itemSchema),
        months: z.array(monthSchema)
    })
    .superRefine((file, context) => {
        const problem = findBackupProblem(file);

        if (problem) context.addIssue({ code: 'custom', message: problem });
    });

export type BackupFile = z.infer<typeof backupSchema>;
export type BackupMonth = BackupFile['months'][number];
export type BackupSummary = {
    addedCategories: number;
    addedItems: number;
    addedMonths: number;
    addedTransactions: number;
    addedReceipts: number;
};

type UnvalidatedBackup = Omit<BackupFile, 'format' | 'formatVersion'>;

function hasDuplicates(values: string[]) {
    return new Set(values).size !== values.length;
}

function findBackupProblem(file: UnvalidatedBackup): string | null {
    const categoryIds = new Set(file.categories.map((category) => category.id));
    const itemIds = new Set(file.items.map((item) => item.id));

    if (hasDuplicates(file.categories.map((category) => category.id)))
        return 'The backup lists a category twice.';
    if (hasDuplicates(file.items.map((item) => item.id)))
        return 'The backup lists a budget item twice.';
    if (file.items.some((item) => !categoryIds.has(item.categoryId)))
        return 'A budget item belongs to a missing category.';
    if (hasDuplicates(file.months.map((month) => month.month)))
        return 'The backup lists a month twice.';
    const transactionIds = file.months.flatMap((month) =>
        month.transactions.map((transaction) => transaction.id)
    );
    const planIds = file.months.flatMap((month) =>
        month.incomePlans.map((plan) => plan.id)
    );
    const receiptIds = file.months.flatMap((month) =>
        month.incomePlans.flatMap((plan) =>
            plan.receipts.map((receipt) => receipt.id)
        )
    );

    if (
        hasDuplicates(transactionIds) ||
        hasDuplicates(planIds) ||
        hasDuplicates(receiptIds)
    )
        return 'The backup lists the same entry twice.';

    for (const month of file.months) {
        const problem = findMonthProblem(month, categoryIds, itemIds);

        if (problem) return problem;
    }

    return null;
}

function findMonthProblem(
    month: BackupMonth,
    categoryIds: Set<string>,
    itemIds: Set<string>
): string | null {
    const label = month.month;
    const monthItemIds = new Set(month.items.map((item) => item.budgetItemId));

    if (month.categoryIds.some((id) => !categoryIds.has(id)))
        return `${label} uses a missing category.`;
    if (month.items.some((item) => !itemIds.has(item.budgetItemId)))
        return `${label} uses a missing budget item.`;
    if (monthItemIds.size !== month.items.length)
        return `${label} lists a budget item twice.`;
    for (const plan of month.incomePlans)
        if (
            plan.receipts.some(
                (receipt) => !receipt.receivedOn.startsWith(`${label}-`)
            )
        )
            return `${label} has income dated outside the month.`;
    for (const transaction of month.transactions) {
        if (!transaction.occurredOn.startsWith(`${label}-`))
            return `${label} has a transaction dated outside the month.`;
        if (
            transaction.splits.some(
                (split) => !monthItemIds.has(split.budgetItemId)
            ) ||
            hasDuplicates(transaction.splits.map((split) => split.budgetItemId))
        )
            return `${label} has a transaction split to an item not in that month.`;
        const allocated = transaction.splits.reduce(
            (sum, split) => sum + BigInt(split.amountCents),
            0n
        );

        if (allocated !== BigInt(transaction.totalCents))
            return `${label} has a transaction whose splits do not add up.`;
    }

    return null;
}
