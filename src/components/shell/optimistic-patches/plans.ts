import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { PatchOf } from './context';

type Input = PatchOf<'updatePlan' | 'toggleCarryover'>;

export function applyPlanPatch(next: MonthSnapshot, input: Input): void {
    switch (input.type) {
        case 'updatePlan': {
            for (const category of next.categories) {
                const item = category.items.find(
                    (candidate) => candidate.id === input.monthlyItemId
                );

                if (!item) continue;
                const delta =
                    BigInt(input.plannedCents) - BigInt(item.plannedCents);

                item.plannedCents = cents(input.plannedCents);
                item.availableCents = cents(
                    BigInt(item.availableCents) + delta
                );
                item.version += 1;
                category.availableCents = cents(
                    BigInt(category.availableCents) + delta
                );
                next.summary.plannedCents = cents(
                    BigInt(next.summary.plannedCents) + delta
                );
                next.summary.leftToBudgetCents = cents(
                    BigInt(next.summary.leftToBudgetCents) - delta
                );
                break;
            }
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
