import { z } from 'zod';
import { MAX_ENTRY_CENTS, monthKeySchema } from '@/domain/money';

const base = z.object({
    clientMutationId: z.string().min(8).max(120),
    monthKey: monthKeySchema
});

export const centsSchema = z
    .string()
    .regex(/^\d+$/)
    .refine((value) => BigInt(value) <= MAX_ENTRY_CENTS, {
        message: 'Amounts can be at most $99,999,999.99.'
    });
const positiveCentsSchema = centsSchema.refine((value) => BigInt(value) > 0n, {
    message: 'Enter an amount greater than $0.'
});
const splitSchema = z.object({
    monthlyItemId: z.string().uuid(),
    amountCents: positiveCentsSchema
});
const splitsSchema = z
    .array(splitSchema)
    .min(1)
    .max(20)
    .refine(
        (splits) =>
            new Set(splits.map((split) => split.monthlyItemId)).size ===
            splits.length,
        { message: 'Choose each budget item only once.' }
    );
const reassignmentSchema = z.object({
    destinationItemId: z.string().uuid(),
    movePlan: z.boolean()
});

export const categoryIconSchema = z.enum([
    'heart',
    'house',
    'piggy-bank',
    'sparkles',
    'utensils',
    'wallet',
    'car',
    'baby',
    'briefcase',
    'plane',
    'gift',
    'dumbbell',
    'paw-print',
    'shopping-bag'
]);
export const categoryToneSchema = z.enum([
    'yellow',
    'coral',
    'blue',
    'mint',
    'lilac'
]);

export const mutationSchema = z.discriminatedUnion('type', [
    base.extend({
        type: z.literal('updatePlan'),
        monthlyItemId: z.string().uuid(),
        plannedCents: centsSchema,
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('toggleCarryover'),
        monthlyItemId: z.string().uuid(),
        enabled: z.boolean(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('addTransaction'),
        kind: z.enum(['expense', 'refund']),
        merchant: z.string().trim().min(1).max(120),
        occurredOn: z.string().date(),
        totalCents: positiveCentsSchema,
        note: z.string().trim().max(500).optional(),
        splits: splitsSchema
    }),
    base.extend({
        type: z.literal('updateTransaction'),
        transactionId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        kind: z.enum(['expense', 'refund']),
        merchant: z.string().trim().min(1).max(120),
        occurredOn: z.string().date(),
        totalCents: positiveCentsSchema,
        note: z.string().trim().max(500).optional(),
        splits: splitsSchema
    }),
    base.extend({
        type: z.literal('deleteTransaction'),
        transactionId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('undoDeleteTransaction'),
        transactionId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('addIncomePlan'),
        name: z.string().trim().min(1).max(80),
        icon: categoryIconSchema,
        tone: categoryToneSchema,
        expectedCents: centsSchema
    }),
    base.extend({
        type: z.literal('updateIncomePlan'),
        incomePlanId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        name: z.string().trim().min(1).max(80),
        icon: categoryIconSchema,
        tone: categoryToneSchema,
        expectedCents: centsSchema
    }),
    base.extend({
        type: z.literal('addIncomeReceipt'),
        incomePlanId: z.string().uuid(),
        receivedOn: z.string().date(),
        amountCents: positiveCentsSchema,
        note: z.string().trim().max(500).optional()
    }),
    base.extend({
        type: z.literal('deleteIncomeReceipt'),
        incomeReceiptId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('deleteIncomePlan'),
        incomePlanId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('addCategory'),
        name: z.string().trim().min(1).max(80),
        icon: categoryIconSchema.optional(),
        tone: categoryToneSchema.optional()
    }),
    base.extend({
        type: z.literal('addItem'),
        categoryId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        plannedCents: centsSchema.default('0')
    }),
    base.extend({
        type: z.literal('renameCategory'),
        categoryId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        icon: categoryIconSchema.optional(),
        tone: categoryToneSchema.optional(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('renameItem'),
        itemId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('archiveCategory'),
        categoryId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        reassignment: reassignmentSchema.optional()
    }),
    base.extend({
        type: z.literal('archiveItem'),
        itemId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        reassignment: reassignmentSchema.optional()
    }),
    base.extend({
        type: z.literal('deleteCategory'),
        categoryId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('deleteItem'),
        itemId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('reorderCategories'),
        categoryIds: z.array(z.string().uuid()).min(1)
    }),
    base.extend({
        type: z.literal('reorderItems'),
        categoryId: z.string().uuid(),
        itemIds: z.array(z.string().uuid()).min(1)
    }),
    base.extend({
        type: z.literal('updateMonthNote'),
        note: z.string().trim().max(500)
    }),
    base.extend({ type: z.literal('copyPreviousMonth') }),
    base.extend({ type: z.literal('clearPlannedAmounts') }),
    base.extend({ type: z.literal('resetBudget') })
]);

export type BudgetMutation = z.infer<typeof mutationSchema>;
