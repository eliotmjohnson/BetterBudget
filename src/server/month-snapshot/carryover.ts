import 'server-only';
import { cents, shiftMonth, type MonthKey } from '@/domain/money';
import { availableBalance } from '@/domain/budget-calculations';
import type { HistoricalPlanRow, SplitRow, TargetPlanRow } from './queries';

type CarryoverRow = HistoricalPlanRow;

export interface DerivedBalance {
    available: bigint;
    carryIn: bigint;
    spent: bigint;
}

/**
 * Carry in is the immediately previous month's ending available balance only
 * when that month's outbound carryover is enabled and the item exists in both
 * adjacent months, so each item is reduced to the unbroken chain of months
 * ending at the target before any balance is derived.
 */
export function buildCarryoverChains(
    targetPlanRows: TargetPlanRow[],
    historicalPlanRows: HistoricalPlanRow[],
    monthKey: MonthKey
): CarryoverRow[] {
    const historicalPlansByDefinition = new Map<string, HistoricalPlanRow[]>();

    for (const plan of historicalPlanRows) {
        const plans = historicalPlansByDefinition.get(plan.itemId) ?? [];

        plans.push(plan);
        historicalPlansByDefinition.set(plan.itemId, plans);
    }

    return targetPlanRows.flatMap((targetPlan) => {
        const history =
            historicalPlansByDefinition.get(targetPlan.itemId) ?? [];
        const chain: CarryoverRow[] = [targetPlan];
        let nextMonth = monthKey;

        for (let index = history.length - 1; index >= 0; index -= 1) {
            const plan = history[index]!;
            const expectedMonth = shiftMonth(nextMonth, -1);

            if (
                plan.month.slice(0, 7) !== expectedMonth ||
                !plan.carryoverEnabled
            )
                break;
            chain.unshift(plan);
            nextMonth = expectedMonth;
        }

        return chain;
    });
}

export function sumSpendByMonthlyItem(
    splitRows: SplitRow[]
): Map<string, bigint> {
    const spendByMonthlyItem = new Map<string, bigint>();

    for (const row of splitRows) {
        const direction = row.kind === 'refund' ? -1n : 1n;

        spendByMonthlyItem.set(
            row.monthlyItemId,
            (spendByMonthlyItem.get(row.monthlyItemId) ?? 0n) +
                row.amountCents * direction
        );
    }

    return spendByMonthlyItem;
}

export function deriveBalances(
    planRows: CarryoverRow[],
    spendByMonthlyItem: Map<string, bigint>
): Map<string, DerivedBalance> {
    const balancesByDefinition = new Map<
        string,
        { month: string; available: bigint; carryoverEnabled: boolean }
    >();
    const calculated = new Map<
        string,
        { available: bigint; carryIn: bigint; spent: bigint }
    >();

    for (const row of planRows) {
        const previous = balancesByDefinition.get(row.itemId);
        const rowMonthKey = row.month.slice(0, 7) as MonthKey;
        const carryIn =
            previous?.carryoverEnabled &&
            previous?.month === shiftMonth(rowMonthKey, -1)
                ? previous.available
                : 0n;
        const spent = spendByMonthlyItem.get(row.monthlyId) ?? 0n;
        const available = BigInt(
            availableBalance({
                plannedCents: cents(row.plannedCents),
                netSpendingCents: cents(spent),
                carryInCents: cents(carryIn)
            })
        );

        balancesByDefinition.set(row.itemId, {
            month: rowMonthKey,
            available,
            carryoverEnabled: row.carryoverEnabled
        });
        calculated.set(row.monthlyId, { available, carryIn, spent });
    }

    return calculated;
}
