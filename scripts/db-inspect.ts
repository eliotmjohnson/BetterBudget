import { asc, count, eq, isNull, sql } from 'drizzle-orm';
import { closeDatabase, getDatabase } from '../src/db';
import {
    budgetMonths,
    incomeReceipts,
    monthlyBudgetItems,
    transactions
} from '../src/db/schema';

function centsToDisplay(value: bigint | number | string | null): string {
    const cents = BigInt(value ?? 0);
    const negative = cents < 0n;
    const absolute = negative ? -cents : cents;
    const dollars = absolute / 100n;
    const remainder = String(absolute % 100n).padStart(2, '0');

    return `${negative ? '-' : ''}$${dollars}.${remainder}`;
}

async function main() {
    const db = await getDatabase();
    const months = await db
        .select({ id: budgetMonths.id, month: budgetMonths.month })
        .from(budgetMonths)
        .orderBy(asc(budgetMonths.month));

    if (months.length === 0) {
        console.log('No budget months exist yet. Run: npm run db:seed');
        await closeDatabase();

        return;
    }

    console.log(`${months.length} month(s):\n`);

    for (const month of months) {
        const [planned] = await db
            .select({
                total: sql<string>`coalesce(sum(${monthlyBudgetItems.plannedCents}), 0)`,
                items: count()
            })
            .from(monthlyBudgetItems)
            .where(eq(monthlyBudgetItems.monthId, month.id));
        const [spent] = await db
            .select({
                total: sql<string>`coalesce(sum(${transactions.totalCents}), 0)`,
                entries: count()
            })
            .from(transactions)
            .where(
                sql`${transactions.monthId} = ${month.id} and ${transactions.deletedAt} is null`
            );
        const [received] = await db
            .select({
                total: sql<string>`coalesce(sum(${incomeReceipts.amountCents}), 0)`
            })
            .from(incomeReceipts)
            .where(isNull(incomeReceipts.deletedAt));

        console.log(`  ${String(month.month).slice(0, 7)}`);
        console.log(
            `    planned ${centsToDisplay(planned?.total ?? 0)} across ${planned?.items ?? 0} item plans`
        );
        console.log(
            `    spent   ${centsToDisplay(spent?.total ?? 0)} across ${spent?.entries ?? 0} transactions`
        );
        console.log(
            `    received (all months) ${centsToDisplay(received?.total ?? 0)}`
        );
    }

    await closeDatabase();
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
