import 'server-only';
import { eq } from 'drizzle-orm';
import type { AppDb } from '@/db';
import {
    budgetItems,
    budgetMonths,
    categories,
    monthlyBudgetCategories,
    monthlyBudgetItems
} from '@/db/schema';
import { monthDate } from '@/domain/calendar';
import { mergeActivity } from './import-activity';
import { chunks, nameKey } from './rows';
import type { BackupFile, BackupSummary } from './schema';

export type ResolvedDefinitions = {
    categoryIds: Map<string, string>;
    itemIds: Map<string, string>;
    itemArchivedFrom: Map<string, string | null>;
};

const archiveDate = (month: string | null) => (month ? monthDate(month) : null);
const earliest = (left: string | null, right: string | null) =>
    left === null ? right : right === null || left < right ? left : right;
const nextSortOrder = (orders: number[]) =>
    orders.length === 0 ? 0 : Math.max(...orders) + 1;

async function mergeCategories(
    tx: AppDb,
    householdId: string,
    file: BackupFile,
    summary: BackupSummary
) {
    const existing = await tx
        .select()
        .from(categories)
        .where(eq(categories.householdId, householdId));
    const byId = new Map(existing.map((row) => [row.id, row]));
    const liveByName = new Map(
        existing
            .filter((row) => row.archivedAt === null)
            .map((row) => [nameKey(row.name), row])
    );
    const offset = nextSortOrder(existing.map((row) => row.sortOrder));
    const resolved = new Map<string, string>();
    const archivedFrom = new Map<string, string | null>(
        existing.map((row) => [row.id, row.archivedFromMonth])
    );

    for (const category of file.categories) {
        const match =
            byId.get(category.id) ??
            (category.archivedFromMonth === null
                ? liveByName.get(nameKey(category.name))
                : undefined);

        if (match) {
            resolved.set(category.id, match.id);
            continue;
        }
        const archivedFromMonth = archiveDate(category.archivedFromMonth);

        await tx.insert(categories).values({
            id: category.id,
            householdId,
            name: category.name,
            icon: category.icon,
            tone: category.tone,
            sortOrder: offset + category.sortOrder,
            archivedAt: archivedFromMonth ? new Date() : null,
            archivedFromMonth
        });
        resolved.set(category.id, category.id);
        archivedFrom.set(category.id, archivedFromMonth);
        summary.addedCategories += 1;
    }

    return { resolved, archivedFrom };
}

async function mergeDefinitions(
    tx: AppDb,
    householdId: string,
    file: BackupFile,
    summary: BackupSummary
): Promise<ResolvedDefinitions> {
    const { resolved: categoryIds, archivedFrom: categoryArchivedFrom } =
        await mergeCategories(tx, householdId, file, summary);
    const existing = await tx
        .select({ item: budgetItems })
        .from(budgetItems)
        .innerJoin(categories, eq(budgetItems.categoryId, categories.id))
        .where(eq(categories.householdId, householdId));
    const byId = new Map(existing.map(({ item }) => [item.id, item]));
    const liveByName = new Map(
        existing
            .filter(({ item }) => item.archivedAt === null)
            .map(({ item }) => [
                `${item.categoryId}:${nameKey(item.name)}`,
                item
            ])
    );
    const itemIds = new Map<string, string>();
    const itemArchivedFrom = new Map<string, string | null>();
    const offsets = new Map<string, number>();

    for (const item of file.items) {
        const categoryId = categoryIds.get(item.categoryId) ?? item.categoryId;
        const match =
            byId.get(item.id) ??
            (item.archivedFromMonth === null
                ? liveByName.get(`${categoryId}:${nameKey(item.name)}`)
                : undefined);
        const categoryArchive = categoryArchivedFrom.get(categoryId) ?? null;

        if (match) {
            itemIds.set(item.id, match.id);
            itemArchivedFrom.set(
                match.id,
                earliest(match.archivedFromMonth, categoryArchive)
            );
            continue;
        }
        if (!offsets.has(categoryId))
            offsets.set(
                categoryId,
                nextSortOrder(
                    existing
                        .filter((row) => row.item.categoryId === categoryId)
                        .map((row) => row.item.sortOrder)
                )
            );
        const archivedFromMonth = archiveDate(item.archivedFromMonth);

        await tx.insert(budgetItems).values({
            id: item.id,
            categoryId,
            name: item.name,
            sortOrder: (offsets.get(categoryId) ?? 0) + item.sortOrder,
            archivedAt: archivedFromMonth ? new Date() : null,
            archivedFromMonth
        });
        itemIds.set(item.id, item.id);
        itemArchivedFrom.set(
            item.id,
            earliest(archivedFromMonth, categoryArchive)
        );
        summary.addedItems += 1;
    }

    return { categoryIds, itemIds, itemArchivedFrom };
}

async function mergeMonths(
    tx: AppDb,
    householdId: string,
    file: BackupFile,
    {
        definitions,
        summary
    }: { definitions: ResolvedDefinitions; summary: BackupSummary }
) {
    const existing = await tx
        .select({ id: budgetMonths.id, month: budgetMonths.month })
        .from(budgetMonths)
        .where(eq(budgetMonths.householdId, householdId));
    const monthIds = new Map(existing.map((row) => [row.month, row.id]));

    for (const month of file.months) {
        const date = monthDate(month.month);
        let monthId = monthIds.get(date);

        if (!monthId) {
            const inserted = await tx
                .insert(budgetMonths)
                .values({ householdId, month: date, note: month.note })
                .returning({ id: budgetMonths.id });

            monthId = inserted[0]!.id;
            monthIds.set(date, monthId);
            summary.addedMonths += 1;
        }
        const links = month.categoryIds.map((categoryId) => ({
            monthId: monthId!,
            categoryId: definitions.categoryIds.get(categoryId) ?? categoryId
        }));
        const items = month.items.map((item) => ({
            monthId: monthId!,
            budgetItemId:
                definitions.itemIds.get(item.budgetItemId) ?? item.budgetItemId,
            plannedCents: BigInt(item.plannedCents),
            carryoverEnabled: item.carryoverEnabled
        }));

        if (links.length > 0)
            await tx
                .insert(monthlyBudgetCategories)
                .values(links)
                .onConflictDoNothing();
        for (const batch of chunks(items))
            await tx
                .insert(monthlyBudgetItems)
                .values(batch)
                .onConflictDoNothing();
    }

    return monthIds;
}

/** Adds everything in the backup that the household does not already have; existing rows are never changed. */
export async function mergeBackup(
    tx: AppDb,
    householdId: string,
    file: BackupFile
): Promise<BackupSummary> {
    const summary: BackupSummary = {
        addedCategories: 0,
        addedItems: 0,
        addedMonths: 0,
        addedTransactions: 0,
        addedReceipts: 0
    };
    const definitions = await mergeDefinitions(tx, householdId, file, summary);
    const monthIds = await mergeMonths(tx, householdId, file, {
        definitions,
        summary
    });

    await mergeActivity(tx, householdId, file, {
        definitions,
        monthIds,
        summary
    });

    return summary;
}
