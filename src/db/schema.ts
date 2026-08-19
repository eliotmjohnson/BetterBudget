import {
    bigint,
    boolean,
    date,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const createdAt = timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow();

export const entryKind = pgEnum('entry_kind', ['expense', 'refund']);
export const categoryTone = pgEnum('category_tone', [
    'yellow',
    'coral',
    'blue',
    'mint',
    'lilac'
]);

export const user = pgTable('auth_user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt,
    updatedAt
});

export const session = pgTable(
    'auth_session',
    {
        id: text('id').primaryKey(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        token: text('token').notNull().unique(),
        createdAt,
        updatedAt,
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' })
    },
    (table) => [index('auth_session_user_idx').on(table.userId)]
);

export const account = pgTable(
    'auth_account',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: timestamp('access_token_expires_at', {
            withTimezone: true
        }),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
            withTimezone: true
        }),
        scope: text('scope'),
        password: text('password'),
        createdAt,
        updatedAt
    },
    (table) => [index('auth_account_user_idx').on(table.userId)]
);

export const verification = pgTable(
    'auth_verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt,
        updatedAt
    },
    (table) => [index('auth_verification_identifier_idx').on(table.identifier)]
);

export const households = pgTable('households', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('USD'),
    timeZone: text('time_zone').notNull().default('America/Chicago'),
    createdAt,
    updatedAt
});

export const householdMembers = pgTable(
    'household_members',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        householdId: uuid('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        role: text('role').notNull().default('owner'),
        createdAt
    },
    (table) => [
        uniqueIndex('household_members_household_user_uidx').on(
            table.householdId,
            table.userId
        ),
        index('household_members_user_idx').on(table.userId)
    ]
);

export const budgetMonths = pgTable(
    'budget_months',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        householdId: uuid('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        month: date('month', { mode: 'string' }).notNull(),
        note: text('note'),
        version: integer('version').notNull().default(1),
        createdAt,
        updatedAt
    },
    (table) => [
        uniqueIndex('budget_months_household_month_uidx').on(
            table.householdId,
            table.month
        ),
        index('budget_months_household_idx').on(table.householdId)
    ]
);

export const categories = pgTable(
    'categories',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        householdId: uuid('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        icon: text('icon').notNull(),
        tone: categoryTone('tone').notNull(),
        sortOrder: integer('sort_order').notNull(),
        version: integer('version').notNull().default(1),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        createdAt,
        updatedAt
    },
    (table) => [
        index('categories_household_order_idx').on(
            table.householdId,
            table.sortOrder
        )
    ]
);

export const budgetItems = pgTable(
    'budget_items',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        categoryId: uuid('category_id')
            .notNull()
            .references(() => categories.id, { onDelete: 'restrict' }),
        name: text('name').notNull(),
        sortOrder: integer('sort_order').notNull(),
        version: integer('version').notNull().default(1),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        createdAt,
        updatedAt
    },
    (table) => [
        index('budget_items_category_order_idx').on(
            table.categoryId,
            table.sortOrder
        )
    ]
);

export const monthlyBudgetCategories = pgTable(
    'monthly_budget_categories',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        monthId: uuid('month_id')
            .notNull()
            .references(() => budgetMonths.id, { onDelete: 'cascade' }),
        categoryId: uuid('category_id')
            .notNull()
            .references(() => categories.id, { onDelete: 'cascade' }),
        createdAt
    },
    (table) => [
        uniqueIndex('monthly_budget_categories_month_category_uidx').on(
            table.monthId,
            table.categoryId
        ),
        index('monthly_budget_categories_category_idx').on(table.categoryId)
    ]
);

export const monthlyBudgetItems = pgTable(
    'monthly_budget_items',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        monthId: uuid('month_id')
            .notNull()
            .references(() => budgetMonths.id, { onDelete: 'cascade' }),
        budgetItemId: uuid('budget_item_id')
            .notNull()
            .references(() => budgetItems.id, { onDelete: 'restrict' }),
        plannedCents: bigint('planned_cents', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        carryoverEnabled: boolean('carryover_enabled').notNull().default(false),
        version: integer('version').notNull().default(1),
        createdAt,
        updatedAt
    },
    (table) => [
        uniqueIndex('monthly_budget_items_month_item_uidx').on(
            table.monthId,
            table.budgetItemId
        ),
        index('monthly_budget_items_budget_item_idx').on(table.budgetItemId)
    ]
);

export const incomePlans = pgTable(
    'income_plans',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        monthId: uuid('month_id')
            .notNull()
            .references(() => budgetMonths.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        icon: text('icon').notNull().default('wallet'),
        tone: categoryTone('tone').notNull().default('blue'),
        expectedCents: bigint('expected_cents', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        sortOrder: integer('sort_order').notNull(),
        version: integer('version').notNull().default(1),
        createdAt,
        updatedAt
    },
    (table) => [
        index('income_plans_month_order_idx').on(table.monthId, table.sortOrder)
    ]
);

export const incomeReceipts = pgTable(
    'income_receipts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        incomePlanId: uuid('income_plan_id')
            .notNull()
            .references(() => incomePlans.id, { onDelete: 'restrict' }),
        receivedOn: date('received_on', { mode: 'string' }).notNull(),
        amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
        note: text('note'),
        version: integer('version').notNull().default(1),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        createdAt,
        updatedAt
    },
    (table) => [
        index('income_receipts_plan_date_idx').on(
            table.incomePlanId,
            table.receivedOn
        )
    ]
);

export const transactions = pgTable(
    'transactions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        monthId: uuid('month_id')
            .notNull()
            .references(() => budgetMonths.id, { onDelete: 'restrict' }),
        kind: entryKind('kind').notNull(),
        merchant: text('merchant').notNull(),
        occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
        totalCents: bigint('total_cents', { mode: 'bigint' }).notNull(),
        note: text('note'),
        version: integer('version').notNull().default(1),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        createdAt,
        updatedAt
    },
    (table) => [
        index('transactions_month_date_idx').on(table.monthId, table.occurredOn)
    ]
);

export const transactionSplits = pgTable(
    'transaction_splits',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        transactionId: uuid('transaction_id')
            .notNull()
            .references(() => transactions.id, { onDelete: 'cascade' }),
        monthlyItemId: uuid('monthly_item_id')
            .notNull()
            .references(() => monthlyBudgetItems.id, { onDelete: 'restrict' }),
        amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
        createdAt
    },
    (table) => [
        uniqueIndex('transaction_splits_transaction_item_uidx').on(
            table.transactionId,
            table.monthlyItemId
        ),
        index('transaction_splits_monthly_item_idx').on(table.monthlyItemId)
    ]
);

export const mutationReceipts = pgTable(
    'mutation_receipts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        householdId: uuid('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        clientMutationId: text('client_mutation_id').notNull(),
        operation: text('operation').notNull(),
        month: date('month', { mode: 'string' }).notNull(),
        result: jsonb('result').notNull().default({}),
        createdAt
    },
    (table) => [
        uniqueIndex('mutation_receipts_household_client_uidx').on(
            table.householdId,
            table.clientMutationId
        ),
        index('mutation_receipts_created_idx').on(table.createdAt)
    ]
);
