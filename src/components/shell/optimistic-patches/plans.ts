import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { PatchOf } from './context';

type Input = PatchOf<'updatePlan' | 'movePlannedAmount' | 'toggleCarryover'>;

function shiftPlan(
    next: MonthSnapshot,
    monthlyItemId: string,
    deltaCents: bigint
): void {
    for (const category of next.categories) {
        const item = category.items.find(
            (candidate) => candidate.id === monthlyItemId
        );

        if (!item) continue;
        item.plannedCents = cents(BigInt(item.plannedCents) + deltaCents);
        item.availableCents = cents(BigInt(item.availableCents) + deltaCents);
        item.version += 1;
        category.availableCents = cents(
            BigInt(category.availableCents) + deltaCents
        );
        next.summary.plannedCents = cents(
            BigInt(next.summary.plannedCents) + deltaCents
        );
        next.summary.leftToBudgetCents = cents(
            BigInt(next.summary.leftToBudgetCents) - deltaCents
        );

        return;
    }
}

export function applyPlanPatch(next: MonthSnapshot, input: Input): void {
    switch (input.type) {
        case 'updatePlan': {
            const item = next.categories
                .flatMap((category) => category.items)
                .find((candidate) => candidate.id === input.monthlyItemId);

            if (item)
                shiftPlan(
                    next,
                    item.id,
                    BigInt(input.plannedCents) - BigInt(item.plannedCents)
                );
            break;
        }
        case 'movePlannedAmount': {
            const amount = BigInt(input.amountCents);

            shiftPlan(next, input.fromItemId, -amount);
            shiftPlan(next, input.toItemId, amount);
            break;
        }
        case 'toggleCarryover': {
            for (const category of next.categories) {
                const item = category.items.find(
                    (candidate) => candidate.id === input.monthlyItemId
                );

                if (!item) continue;

                item.carryoverEnabled = input.enabled;
                item.version += 1;
                break;
            }
            break;
        }
    }
}
