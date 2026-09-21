import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    incomePlans,
    incomeReceipts,
    monthlyBudgetCategories,
    monthlyBudgetItems,
    mutationReceipts,
    transactions
} from '@/db/schema';

/** Permanently removes every budget row the household owns, leaving the household, its members, and auth untouched. */
export async function clearHousehold(tx: AppDb, householdId: string) {
    const householdMonths = tx
        .select({ id: budgetMonths.id })
        .from(budgetMonths)
        .where(eq(budgetMonths.householdId, householdId));
    const householdCategories = tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.householdId, householdId));
    const householdPlans = tx
        .select({ id: incomePlans.id })
        .from(incomePlans)
        .where(inArray(incomePlans.monthId, householdMonths));

    await tx
        .delete(transactions)
        .where(inArray(transactions.monthId, householdMonths));
    await tx
        .delete(incomeReceipts)
        .where(inArray(incomeReceipts.incomePlanId, householdPlans));
    await tx
        .delete(incomePlans)
        .where(inArray(incomePlans.monthId, householdMonths));
    await tx
        .delete(monthlyBudgetItems)
        .where(inArray(monthlyBudgetItems.monthId, householdMonths));
    await tx
        .delete(monthlyBudgetCategories)
        .where(inArray(monthlyBudgetCategories.monthId, householdMonths));
    await tx
        .delete(budgetMonths)
        .where(eq(budgetMonths.householdId, householdId));
    await tx
        .delete(budgetItems)
        .where(inArray(budgetItems.categoryId, householdCategories));
    await tx.delete(categories).where(eq(categories.householdId, householdId));
    await tx
        .delete(mutationReceipts)
        .where(eq(mutationReceipts.householdId, householdId));
}
