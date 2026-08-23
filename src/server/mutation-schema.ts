import { z } from 'zod';
import { monthKeySchema } from '@/domain/money';

const base = z.object({
    clientMutationId: z.string().min(8).max(120),
    monthKey: monthKeySchema
});
const splitSchema = z.object({
    monthlyItemId: z.string().uuid(),
    amountCents: z.string().regex(/^\d+$/)
});
const categoryIconSchema = z.enum([
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
const categoryToneSchema = z.enum(['yellow', 'coral', 'blue', 'mint', 'lilac']);

export const mutationSchema = z.discriminatedUnion('type', [
    base.extend({
        type: z.literal('updatePlan'),
        monthlyItemId: z.string().uuid(),
        plannedCents: z.string().regex(/^\d+$/),
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
        totalCents: z.string().regex(/^\d+$/),
        note: z.string().trim().max(500).optional(),
        splits: z.array(splitSchema).min(1).max(20)
    }),
    base.extend({
        type: z.literal('updateTransaction'),
        transactionId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        kind: z.enum(['expense', 'refund']),
        merchant: z.string().trim().min(1).max(120),
        occurredOn: z.string().date(),
        totalCents: z.string().regex(/^\d+$/),
        note: z.string().trim().max(500).optional(),
        splits: z.array(splitSchema).min(1).max(20)
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
        expectedCents: z.string().regex(/^\d+$/)
    }),
    base.extend({
        type: z.literal('updateIncomePlan'),
        incomePlanId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        name: z.string().trim().min(1).max(80),
        icon: categoryIconSchema,
        tone: categoryToneSchema
    }),
    base.extend({
        type: z.literal('addIncomeReceipt'),
        incomePlanId: z.string().uuid(),
        receivedOn: z.string().date(),
        amountCents: z.string().regex(/^\d+$/),
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
        plannedCents: z.string().regex(/^\d+$/).default('0')
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
        expectedVersion: z.number().int().positive()
    }),
    base.extend({
        type: z.literal('archiveItem'),
        itemId: z.string().uuid(),
        expectedVersion: z.number().int().positive()
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
