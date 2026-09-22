import 'server-only';
import { z } from 'zod';
import { cents, shiftMonth, type MonthKey } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import {
    money,
    parseInput,
    resolveMonth,
    snapshotFor,
    type AssistantToolContext
} from './commit';
import { AssistantToolError, resolveCategory, resolveItem } from './resolve';

const MAX_MONTHS = 24;
const historySchema = z.object({
    item: z.string().optional(),
    category: z.string().optional(),
    from_month: z.string().optional(),
    to_month: z.string().optional()
});

interface ItemMonth {
    month: MonthKey;
    planned: bigint;
    expenses: bigint;
    incomeIn: bigint;
    net: bigint;
    carryIn: bigint;
    available: bigint;
    overBy: bigint;
}

interface Series {
    label: string;
    rows: ItemMonth[];
}

/** Rounds half away from zero to the nearest cent. */
function average(total: bigint, count: number): bigint {
    if (count === 0) return 0n;
    const divisor = BigInt(count);
    const magnitude = total < 0n ? -total : total;
    const rounded = (magnitude * 2n + divisor) / (divisor * 2n);

    return total < 0n ? -rounded : rounded;
}

const $ = (value: bigint) => money(cents(value));
const over = (row: ItemMonth) => row.overBy;
const MAX_LISTED_MONTHS = 6;
const sum = (rows: ItemMonth[], pick: (row: ItemMonth) => bigint) =>
    rows.reduce((total, row) => total + pick(row), 0n);

function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
    const months: MonthKey[] = [];

    for (let month = from; month <= to; month = shiftMonth(month, 1)) {
        months.push(month);
        if (months.length > MAX_MONTHS)
            throw new AssistantToolError(
                `Ask for at most ${MAX_MONTHS} months at a time.`
            );
    }
    if (months.length === 0)
        throw new AssistantToolError('from_month must not be after to_month.');

    return months;
}

function allocatedTo(
    snapshot: MonthSnapshot,
    monthlyItemId: string,
    type: 'expense' | 'refund'
): bigint {
    return snapshot.activity
        .filter((entry) => entry.type === type)
        .flatMap((entry) => entry.allocations ?? [])
        .filter((allocation) => allocation.monthlyItemId === monthlyItemId)
        .reduce(
            (total, allocation) => total + BigInt(allocation.amountCents),
            0n
        );
}

function itemSeries(snapshots: MonthSnapshot[]): Map<string, Series> {
    const series = new Map<string, Series>();

    for (const snapshot of snapshots)
        for (const category of snapshot.categories)
            for (const item of category.items) {
                const entry = series.get(item.definitionId) ?? {
                    label: `${category.name} / ${item.name}`,
                    rows: []
                };
                const planned = BigInt(item.plannedCents);
                const expenses = allocatedTo(snapshot, item.id, 'expense');

                entry.rows.push({
                    month: snapshot.monthKey,
                    planned,
                    expenses,
                    overBy: expenses > planned ? expenses - planned : 0n,
                    incomeIn: allocatedTo(snapshot, item.id, 'refund'),
                    net: BigInt(item.spentCents),
                    carryIn: BigInt(item.carryInCents),
                    available: BigInt(item.availableCents)
                });
                series.set(item.definitionId, entry);
            }

    return series;
}

function combine(label: string, parts: Series[]): Series {
    const byMonth = new Map<MonthKey, ItemMonth>();

    for (const part of parts)
        for (const row of part.rows) {
            const total = byMonth.get(row.month);

            byMonth.set(
                row.month,
                total
                    ? {
                          month: row.month,
                          planned: total.planned + row.planned,
                          expenses: total.expenses + row.expenses,
                          incomeIn: total.incomeIn + row.incomeIn,
                          net: total.net + row.net,
                          carryIn: total.carryIn + row.carryIn,
                          available: total.available + row.available,
                          overBy: total.overBy + row.overBy
                      }
                    : { ...row }
            );
        }

    return {
        label,
        rows: [...byMonth.values()].sort((a, b) =>
            a.month.localeCompare(b.month)
        )
    };
}

function summaryLines({ label, rows }: Series): string[] {
    const count = rows.length;
    const overRows = rows.filter((row) => over(row) > 0n);
    const overTotal = sum(rows, over);
    const largest = overRows.reduce<ItemMonth | null>(
        (best, row) => (!best || over(row) > over(best) ? row : best),
        null
    );
    const figure = (name: string, pick: (row: ItemMonth) => bigint) => {
        const total = sum(rows, pick);

        return `${name} total ${$(total)}, avg ${$(average(total, count))}/month`;
    };

    return [
        `${label}, ${count} month${count === 1 ? '' : 's'}: ${figure('planned', (row) => row.planned)} | ${figure('expenses', (row) => row.expenses)} | ${figure('income in', (row) => row.incomeIn)} | ${figure('net spent', (row) => row.net)}`,
        overRows.length === 0
            ? `  Expenses never went over planned.`
            : `  Expenses over planned in ${overRows.length} of ${count} months: total over ${$(overTotal)}, avg ${$(average(overTotal, count))} across all months, avg ${$(average(overTotal, overRows.length))} in months over, largest ${$(over(largest!))} in ${largest!.month}.`
    ];
}

function compactLine({ label, rows }: Series): string {
    const overRows = rows.filter((row) => over(row) > 0n);
    const expenses = sum(rows, (row) => row.expenses);
    const listed = overRows
        .slice(-MAX_LISTED_MONTHS)
        .map((row) => `${row.month} by ${$(over(row))}`)
        .join(', ');
    const overPart = overRows.length
        ? `over planned ${overRows.length} of ${rows.length} months (${listed}), avg ${$(average(sum(rows, over), overRows.length))} when over`
        : 'never over planned';

    return `- ${label}: planned avg ${$(
        average(
            sum(rows, (row) => row.planned),
            rows.length
        )
    )}, expenses avg ${$(average(expenses, rows.length))}/month, ${overPart}`;
}

function tableLines(rows: ItemMonth[]): string[] {
    return [
        'month | planned | expenses | income in | net spent | carry-in | available | over by',
        ...rows.map(
            (row) =>
                `${row.month} | ${$(row.planned)} | ${$(row.expenses)} | ${$(row.incomeIn)} | ${$(row.net)} | ${$(row.carryIn)} | ${$(row.available)} | ${$(over(row))}`
        )
    ];
}

function findDefinition(
    snapshots: MonthSnapshot[],
    query: string,
    resolve: (snapshot: MonthSnapshot) => string
): string {
    let lastError: unknown = null;

    for (const snapshot of [...snapshots].reverse())
        try {
            return resolve(snapshot);
        } catch (error) {
            lastError = error;
        }

    throw lastError instanceof AssistantToolError
        ? lastError
        : new AssistantToolError(`No "${query}" found in those months.`);
}

function render(
    snapshots: MonthSnapshot[],
    args: z.infer<typeof historySchema>,
    months: MonthKey[]
): string {
    const series = itemSeries(snapshots);
    const span = `${months[0]} to ${months.at(-1)}`;

    if (args.item) {
        const query = args.item;
        const id = findDefinition(
            snapshots,
            query,
            (snapshot) => resolveItem(snapshot, query).definitionId
        );
        const item = series.get(id)!;

        return [
            `History ${span} (months without the item are skipped)`,
            ...tableLines(item.rows),
            ...summaryLines(item)
        ].join('\n');
    }
    const categoryId = args.category
        ? findDefinition(
              snapshots,
              args.category,
              (snapshot) => resolveCategory(snapshot, args.category!).id
          )
        : null;
    const members = snapshots.flatMap((snapshot) =>
        snapshot.categories
            .filter(
                (category) => categoryId === null || category.id === categoryId
            )
            .flatMap((category) => category.items.map((i) => i.definitionId))
    );
    const parts = [...new Set(members)].flatMap((id) => {
        const part = series.get(id);

        return part ? [part] : [];
    });
    const total = combine(
        categoryId ? `${args.category} (all items)` : 'Whole budget',
        parts
    );

    return [
        `History ${span}`,
        ...tableLines(total.rows),
        ...summaryLines(total),
        'Per item:',
        ...parts.map(compactLine)
    ].join('\n');
}

/**
 * Exact multi-month figures for one item, one category, or the whole budget,
 * with totals, averages, and over-planned statistics computed server-side.
 */
export async function getHistory(
    input: unknown,
    context: AssistantToolContext
): Promise<string> {
    const args = parseInput(historySchema, input);

    if (args.item && args.category)
        throw new AssistantToolError('Pass item or category, not both.');
    const to = resolveMonth(args.to_month, context);
    const from = args.from_month ? resolveMonth(args.from_month, context) : to;
    const months = monthRange(from, to);
    const snapshots: MonthSnapshot[] = [];

    for (const month of months)
        snapshots.push(await snapshotFor(month, context));

    return render(snapshots, args, months);
}
