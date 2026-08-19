import { eq } from 'drizzle-orm';
import type { AppDb } from './index';
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

const ids = {
    july: '20000000-0000-4000-8000-000000000007',
    august: '20000000-0000-4000-8000-000000000008',
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
const augustPlans = [
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
            id: ids.july,
            householdId: DEFAULT_HOUSEHOLD_ID,
            month: '2026-07-01',
            note: 'Summer reset'
        },
        {
            id: ids.august,
            householdId: DEFAULT_HOUSEHOLD_ID,
            month: '2026-08-01',
            note: 'Back-to-school month'
        }
    ]);
    await db.insert(categories).values([
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
    ]);
    await db
        .insert(monthlyBudgetCategories)
        .values(
            [ids.july, ids.august].flatMap((monthId) =>
                [
                    ids.giving,
                    ids.housing,
                    ids.food,
                    ids.savings,
                    ids.lifestyle
                ].map((categoryId) => ({ monthId, categoryId }))
            )
        );
    await db.insert(budgetItems).values([
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
    ]);

    const julyPlanIds = new Map<string, string>();
    const augustPlanIds = new Map<string, string>();

    for (const [itemId, planned, carryover] of augustPlans) {
        const julyId = crypto.randomUUID();
        const augustId = crypto.randomUUID();

        julyPlanIds.set(itemId, julyId);
        augustPlanIds.set(itemId, augustId);
        await db.insert(monthlyBudgetItems).values([
            {
                id: julyId,
                monthId: ids.july,
                budgetItemId: itemId,
                plannedCents: itemId === ids.emergency ? 220_000n : planned,
                carryoverEnabled: carryover
            },
            {
                id: augustId,
                monthId: ids.august,
                budgetItemId: itemId,
                plannedCents: planned,
                carryoverEnabled: carryover
            }
        ]);
    }

    const incomeOne = '50000000-0000-4000-8000-000000000001';
    const incomeTwo = '50000000-0000-4000-8000-000000000002';
    const sideWork = '50000000-0000-4000-8000-000000000003';

    await db.insert(incomePlans).values([
        {
            id: incomeOne,
            monthId: ids.august,
            name: 'Paycheck',
            icon: 'briefcase',
            tone: 'mint',
            expectedCents: 360_000n,
            sortOrder: 10
        },
        {
            id: incomeTwo,
            monthId: ids.august,
            name: 'Paycheck',
            icon: 'wallet',
            tone: 'blue',
            expectedCents: 360_000n,
            sortOrder: 20
        },
        {
            id: sideWork,
            monthId: ids.august,
            name: 'Side work',
            icon: 'sparkles',
            tone: 'lilac',
            expectedCents: 0n,
            sortOrder: 30
        }
    ]);
    await db.insert(incomeReceipts).values([
        {
            incomePlanId: incomeOne,
            receivedOn: '2026-08-01',
            amountCents: 360_000n,
            note: 'First paycheck'
        },
        {
            incomePlanId: incomeTwo,
            receivedOn: '2026-08-15',
            amountCents: 360_000n,
            note: 'Second paycheck'
        }
    ]);

    const expenses: Array<[string, string, bigint, string]> = [
        ['Charity', ids.charity, 35_000n, '2026-08-02'],
        ['Mortgage', ids.mortgage, 215_000n, '2026-08-03'],
        ['Electricity Co.', ids.utilities, 28_600n, '2026-08-12'],
        ['Whole Foods', ids.groceries, 8_624n, '2026-08-12'],
        ['Target', ids.groceries, 4_311n, '2026-08-11'],
        ['Walmart', ids.groceries, 7_263n, '2026-08-09'],
        ['Costco', ids.groceries, 13_822n, '2026-08-07'],
        ['Aldi', ids.groceries, 5_547n, '2026-08-05'],
        ['Neighborhood Market', ids.groceries, 12_533n, '2026-08-04'],
        ['Uber Eats', ids.restaurants, 2_875n, '2026-08-10'],
        ['Restaurants', ids.restaurants, 16_925n, '2026-08-06'],
        ['Insurance', ids.insurance, 40_000n, '2026-08-05'],
        ['Gas Station', ids.transport, 4_500n, '2026-08-09'],
        ['Car repair', ids.transport, 12_200n, '2026-08-08'],
        ['Personal', ids.personal, 5_000n, '2026-08-06'],
        ['Debt payment', ids.debt, 6_000n, '2026-08-01']
    ];

    for (const [merchant, itemId, amount, occurredOn] of expenses) {
        const transactionId = crypto.randomUUID();

        await db.insert(transactions).values({
            id: transactionId,
            monthId: ids.august,
            kind: 'expense',
            merchant,
            occurredOn,
            totalCents: amount
        });
        await db.insert(transactionSplits).values({
            transactionId,
            monthlyItemId: augustPlanIds.get(itemId)!,
            amountCents: amount
        });
    }
}
