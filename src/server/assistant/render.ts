import 'server-only';
import { formatCurrencyInput } from '@/domain/money';
import type { ActivityEntry, MonthSnapshot } from '@/domain/types';

const TRANSACTION_LIST_LIMIT = 40;

export const transactionRef = (id: string) => id.slice(0, 8);

const money = (value: string) => formatCurrencyInput(value);

export function itemNamesById(snapshot: MonthSnapshot) {
    return new Map(
        snapshot.categories.flatMap((category) =>
            category.items.map((item) => [item.id, item.name] as const)
        )
    );
}

/** Repeated income source names get a `#n` suffix the resolver accepts. */
export function incomePlanLabel(snapshot: MonthSnapshot, index: number) {
    const plan = snapshot.incomePlans[index];

    if (!plan) return '';
    const sameName = snapshot.incomePlans.filter(
        (candidate) => candidate.name === plan.name
    );

    return sameName.length > 1
        ? `${plan.name} #${sameName.indexOf(plan) + 1}`
        : plan.name;
}

export function renderOverview(snapshot: MonthSnapshot): string {
    const { summary } = snapshot;
    const lines = [
        `Month ${snapshot.monthKey} (${snapshot.label})`,
        `Expected income ${money(summary.expectedIncomeCents)} | Received income ${money(summary.receivedIncomeCents)} | Planned ${money(summary.plannedCents)} | Spent ${money(summary.spentCents)} | Left to budget ${money(summary.leftToBudgetCents)}`
    ];

    if (snapshot.note) lines.push(`Month note: ${snapshot.note}`);
    if (snapshot.categories.length === 0)
        lines.push(
            'This month has no categories or items yet. The person can copy the previous month from the Budget page, or you can add categories and items.'
        );
    else lines.push('Categories and items:');
    for (const category of snapshot.categories) {
        lines.push(
            `- ${category.name} (available ${money(category.availableCents)})`
        );
        for (const item of category.items) {
            const extras = [
                item.carryoverEnabled ? 'carryover on' : 'carryover off',
                BigInt(item.carryInCents) === 0n
                    ? null
                    : `carry-in ${money(item.carryInCents)}`
            ].filter(Boolean);

            lines.push(
                `  - ${item.name}: planned ${money(item.plannedCents)}, spent ${money(item.spentCents)}, available ${money(item.availableCents)} (${extras.join(', ')})`
            );
        }
    }
    if (snapshot.incomePlans.length === 0) lines.push('No income sources.');
    else lines.push('Income sources:');
    for (const [index, plan] of snapshot.incomePlans.entries())
        lines.push(
            `- ${incomePlanLabel(snapshot, index)}: expected ${money(plan.expectedCents)}, received ${money(plan.receivedCents)} (${plan.receipts.length} receipt${plan.receipts.length === 1 ? '' : 's'})`
        );
    const transactionCount = snapshot.activity.filter(
        (entry) => entry.type !== 'income'
    ).length;

    lines.push(`Transactions this month: ${transactionCount}`);

    return lines.join('\n');
}

function renderTransaction(
    entry: ActivityEntry,
    itemNames: Map<string, string>
): string {
    const allocations = (entry.allocations ?? [])
        .map((allocation) => {
            const name = itemNames.get(allocation.monthlyItemId) ?? 'Unknown';

            return entry.split
                ? `${name} ${money(allocation.amountCents)}`
                : name;
        })
        .join(' + ');
    const note = entry.note ? ` | note: ${entry.note}` : '';

    return `${transactionRef(entry.id)} | ${entry.occurredOn} | ${entry.type === 'refund' ? 'income' : entry.type} | ${entry.title} | ${money(entry.amountCents)} | ${allocations}${note}`;
}

export function renderTransactions(
    snapshot: MonthSnapshot,
    filter: { search?: string; itemId?: string }
): string {
    const itemNames = itemNamesById(snapshot);
    const search = filter.search?.trim().toLowerCase();
    const matches = snapshot.activity.filter(
        (entry) =>
            entry.type !== 'income' &&
            (!search ||
                entry.title.toLowerCase().includes(search) ||
                (entry.note ?? '').toLowerCase().includes(search)) &&
            (!filter.itemId ||
                (entry.allocations ?? []).some(
                    (allocation) => allocation.monthlyItemId === filter.itemId
                ))
    );

    if (matches.length === 0)
        return `No matching transactions in ${snapshot.monthKey}.`;
    const shown = matches.slice(0, TRANSACTION_LIST_LIMIT);
    const header = `ref | date | kind | merchant | amount | items (${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > shown.length ? `, newest ${shown.length} shown` : ''})`;

    return [
        header,
        ...shown.map((entry) => renderTransaction(entry, itemNames))
    ].join('\n');
}
