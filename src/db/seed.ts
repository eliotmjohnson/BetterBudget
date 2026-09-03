import { eq } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    households,
    incomePlans,
    incomeReceipts,
    monthlyBudgetCategories,
    monthlyBudgetItems,
    transactionSplits,
    transactions
} from './schema';
import { DEFAULT_HOUSEHOLD_ID, ensureDefaultHousehold } from './household';
import { APP_TIME_ZONE } from '@/domain/calendar';

const seedMonthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
});

type SeedMonth = { year: number; month: number };

function resolveSeedMonths(now = new Date()): {
    current: SeedMonth;
    previous: SeedMonth;
} {
    const parts = seedMonthFormatter.formatToParts(now);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const current: SeedMonth = { year, month };
    const previous: SeedMonth =
        month === 1
            ? { year: year - 1, month: 12 }
            : { year, month: month - 1 };

    return { current, previous };
}

function dayOfMonth(month: SeedMonth, day: number): string {
    const paddedMonth = String(month.month).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');

    return `${month.year}-${paddedMonth}-${paddedDay}`;
}

const seedMonths = resolveSeedMonths();
const ids = {
    previousMonth: '20000000-0000-4000-8000-000000000007',
    currentMonth: '20000000-0000-4000-8000-000000000008',
    giving: '30000000-0000-4000-8000-000000000001',
    housing: '30000000-0000-4000-8000-000000000002',
    food: '30000000-0000-4000-8000-000000000003',
    savings: '30000000-0000-4000-8000-000000000004',
    lifestyle: '30000000-0000-4000-8000-000000000005',
    charity: '40000000-0000-4000-8000-000000000001',
    mortgage: '40000000-0000-4000-8000-000000000002',
    utilities: '40000000-0000-4000-8000-000000000003',
    groceries: '40000000-0000-4000-8000-000000000004',
    restaurants: '40000000-0000-4000-8000-000000000005',
    emergency: '40000000-0000-4000-8000-000000000006',
    insurance: '40000000-0000-4000-8000-000000000007',
    transport: '40000000-0000-4000-8000-000000000008',
    personal: '40000000-0000-4000-8000-000000000009',
    debt: '40000000-0000-4000-8000-000000000010'
};
const monthlyPlans = [
    [ids.charity, 35_000n, false],
    [ids.mortgage, 215_000n, false],
    [ids.utilities, 34_000n, false],
    [ids.groceries, 70_000n, false],
    [ids.restaurants, 24_000n, false],
    [ids.emergency, 65_000n, true],
    [ids.insurance, 80_000n, false],
    [ids.transport, 60_000n, false],
    [ids.personal, 40_000n, false],
    [ids.debt, 54_500n, false]
] as const;
const seedCategories: Array<typeof categories.$inferInsert> = [
    {
        id: ids.giving,
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Giving',
        icon: 'heart',
        tone: 'yellow',
        sortOrder: 10
    },
    {
        id: ids.housing,
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Housing',
        icon: 'house',
        tone: 'coral',
        sortOrder: 20
    },
    {
        id: ids.food,
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Food',
        icon: 'utensils',
        tone: 'blue',
        sortOrder: 30
    },
    {
        id: ids.savings,
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Savings',
        icon: 'piggy-bank',
        tone: 'mint',
        sortOrder: 40
    },
    {
        id: ids.lifestyle,
        householdId: DEFAULT_HOUSEHOLD_ID,
        name: 'Everyday',
        icon: 'sparkles',
        tone: 'lilac',
        sortOrder: 50
    }
];
const seedBudgetItems: Array<typeof budgetItems.$inferInsert> = [
    {
        id: ids.charity,
        categoryId: ids.giving,
        name: 'Charity',
        sortOrder: 10
    },
    {
        id: ids.mortgage,
        categoryId: ids.housing,
        name: 'Mortgage',
        sortOrder: 10
    },
    {
        id: ids.utilities,
        categoryId: ids.housing,
        name: 'Utilities',
        sortOrder: 20
    },
    {
        id: ids.groceries,
        categoryId: ids.food,
        name: 'Groceries',
        sortOrder: 10
    },
    {
        id: ids.restaurants,
        categoryId: ids.food,
        name: 'Restaurants',
        sortOrder: 20
    },
    {
        id: ids.emergency,
        categoryId: ids.savings,
        name: 'Emergency fund',
        sortOrder: 10
    },
    {
        id: ids.insurance,
        categoryId: ids.lifestyle,
        name: 'Insurance',
        sortOrder: 10
    },
    {
        id: ids.transport,
        categoryId: ids.lifestyle,
        name: 'Transport',
        sortOrder: 20
    },
    {
        id: ids.personal,
        categoryId: ids.lifestyle,
        name: 'Personal',
        sortOrder: 30
    },
    {
        id: ids.debt,
        categoryId: ids.lifestyle,
        name: 'Debt payments',
        sortOrder: 40
    }
];
const incomeOne = '50000000-0000-4000-8000-000000000001';
const incomeTwo = '50000000-0000-4000-8000-000000000002';
const sideWork = '50000000-0000-4000-8000-000000000003';
const seedIncomePlans: Array<typeof incomePlans.$inferInsert> = [
    {
        id: incomeOne,
        monthId: ids.currentMonth,
        name: 'Paycheck',
        icon: 'briefcase',
        tone: 'mint',
        expectedCents: 360_000n,
        sortOrder: 10
    },
    {
        id: incomeTwo,
        monthId: ids.currentMonth,
        name: 'Paycheck',
        icon: 'wallet',
        tone: 'blue',
        expectedCents: 360_000n,
        sortOrder: 20
    },
    {
        id: sideWork,
        monthId: ids.currentMonth,
        name: 'Side work',
        icon: 'sparkles',
        tone: 'lilac',
        expectedCents: 0n,
        sortOrder: 30
    }
];
const seedIncomeReceipts: Array<typeof incomeReceipts.$inferInsert> = [
    {
        incomePlanId: incomeOne,
        receivedOn: dayOfMonth(seedMonths.current, 1),
        amountCents: 360_000n,
        note: 'First paycheck'
    },
    {
        incomePlanId: incomeTwo,
        receivedOn: dayOfMonth(seedMonths.current, 15),
        amountCents: 360_000n,
        note: 'Second paycheck'
    }
];
const expenses: Array<[string, string, bigint, string]> = [
    ['Charity', ids.charity, 35_000n, dayOfMonth(seedMonths.current, 2)],
    ['Mortgage', ids.mortgage, 215_000n, dayOfMonth(seedMonths.current, 3)],
    [
        'Electricity Co.',
        ids.utilities,
        28_600n,
        dayOfMonth(seedMonths.current, 12)
    ],
    ['Whole Foods', ids.groceries, 8_624n, dayOfMonth(seedMonths.current, 12)],
    ['Target', ids.groceries, 4_311n, dayOfMonth(seedMonths.current, 11)],
    ['Walmart', ids.groceries, 7_263n, dayOfMonth(seedMonths.current, 9)],
    ['Costco', ids.groceries, 13_822n, dayOfMonth(seedMonths.current, 7)],
    ['Aldi', ids.groceries, 5_547n, dayOfMonth(seedMonths.current, 5)],
    [
        'Neighborhood Market',
        ids.groceries,
        12_533n,
        dayOfMonth(seedMonths.current, 4)
    ],
    ['Uber Eats', ids.restaurants, 2_875n, dayOfMonth(seedMonths.current, 10)],
    [
        'Restaurants',
        ids.restaurants,
        16_925n,
        dayOfMonth(seedMonths.current, 6)
    ],
    ['Insurance', ids.insurance, 40_000n, dayOfMonth(seedMonths.current, 5)],
    ['Gas Station', ids.transport, 4_500n, dayOfMonth(seedMonths.current, 9)],
    ['Car repair', ids.transport, 12_200n, dayOfMonth(seedMonths.current, 8)],
    ['Personal', ids.personal, 5_000n, dayOfMonth(seedMonths.current, 6)],
    ['Debt payment', ids.debt, 6_000n, dayOfMonth(seedMonths.current, 1)]
];

export async function seedDatabase(db: AppDb): Promise<void> {
    if (process.env.NODE_ENV === 'production')
        throw new Error('Development seed data is disabled in production.');
    const existing = await db
        .select({ id: households.id })
        .from(households)
        .where(eq(households.id, DEFAULT_HOUSEHOLD_ID))
        .limit(1);

    if (existing.length > 0) return;

    await ensureDefaultHousehold(db);
    await db.insert(budgetMonths).values([
        {
            id: ids.previousMonth,
            householdId: DEFAULT_HOUSEHOLD_ID,
            month: dayOfMonth(seedMonths.previous, 1),
            note: 'Previous month'
        },
        {
            id: ids.currentMonth,
            householdId: DEFAULT_HOUSEHOLD_ID,
            month: dayOfMonth(seedMonths.current, 1),
            note: 'Planning this month'
        }
    ]);
    await db.insert(categories).values(seedCategories);
    await db
        .insert(monthlyBudgetCategories)
        .values(
            [ids.previousMonth, ids.currentMonth].flatMap((monthId) =>
                [
                    ids.giving,
                    ids.housing,
                    ids.food,
                    ids.savings,
                    ids.lifestyle
                ].map((categoryId) => ({ monthId, categoryId }))
            )
        );
    await db.insert(budgetItems).values(seedBudgetItems);

    const previousMonthPlanIds = new Map<string, string>();
    const currentMonthPlanIds = new Map<string, string>();

    for (const [itemId, planned, carryover] of monthlyPlans) {
        const previousMonthId = crypto.randomUUID();
        const currentMonthId = crypto.randomUUID();

        previousMonthPlanIds.set(itemId, previousMonthId);
        currentMonthPlanIds.set(itemId, currentMonthId);
        await db.insert(monthlyBudgetItems).values([
            {
                id: previousMonthId,
                monthId: ids.previousMonth,
                budgetItemId: itemId,
                plannedCents: itemId === ids.emergency ? 220_000n : planned,
                carryoverEnabled: carryover
            },
            {
                id: currentMonthId,
                monthId: ids.currentMonth,
                budgetItemId: itemId,
                plannedCents: planned,
                carryoverEnabled: carryover
            }
        ]);
    }

    await db.insert(incomePlans).values(seedIncomePlans);
    await db.insert(incomeReceipts).values(seedIncomeReceipts);

    for (const [merchant, itemId, amount, occurredOn] of expenses) {
        const transactionId = crypto.randomUUID();

        await db.insert(transactions).values({
            id: transactionId,
            monthId: ids.currentMonth,
            kind: 'expense',
            merchant,
            occurredOn,
            totalCents: amount
        });
        await db.insert(transactionSplits).values({
            transactionId,
            monthlyItemId: currentMonthPlanIds.get(itemId)!,
            amountCents: amount
        });
    }
}
