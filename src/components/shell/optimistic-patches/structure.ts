import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { PatchOf } from './context';

type Input = PatchOf<
    | 'addCategory'
    | 'addItem'
    | 'renameCategory'
    | 'renameItem'
    | 'archiveCategory'
    | 'archiveItem'
    | 'deleteCategory'
    | 'deleteItem'
    | 'reorderCategories'
    | 'reorderItems'
>;

export function applyStructurePatch(next: MonthSnapshot, input: Input): void {
    switch (input.type) {
        case 'addCategory':
            next.categories.push({
                id: `optimistic-${input.clientMutationId}`,
                name: input.name,
                icon: input.icon ?? 'sparkles',
                tone: input.tone ?? 'lilac',
                availableCents: cents(0),
                items: [],
                version: 1
            });
            break;
        case 'addItem': {
            const category = next.categories.find(
                (candidate) => candidate.id === input.categoryId
            );

            category?.items.push({
                id: `optimistic-${input.clientMutationId}`,
                definitionId: `optimistic-${input.clientMutationId}`,
                definitionVersion: 1,
                name: input.name,
                plannedCents: cents(input.plannedCents),
                spentCents: cents(0),
                availableCents: cents(input.plannedCents),
                carryInCents: cents(0),
                carryoverEnabled: false,
                version: 1
            });
            if (category)
                category.availableCents = cents(
                    BigInt(category.availableCents) + BigInt(input.plannedCents)
                );
            next.summary.plannedCents = cents(
                BigInt(next.summary.plannedCents) + BigInt(input.plannedCents)
            );
            next.summary.leftToBudgetCents = cents(
                BigInt(next.summary.leftToBudgetCents) -
                    BigInt(input.plannedCents)
            );
            break;
        }
        case 'renameCategory': {
            const category = next.categories.find(
                (candidate) => candidate.id === input.categoryId
            );

            if (category) {
                category.name = input.name;
                if (input.icon) category.icon = input.icon;
                if (input.tone) category.tone = input.tone;
                category.version += 1;
            }
            break;
        }
        case 'renameItem': {
            const item = next.categories
                .flatMap((category) => category.items)
                .find((candidate) => candidate.definitionId === input.itemId);

            if (item) {
                item.name = input.name;
                item.definitionVersion += 1;
            }
            break;
        }
        case 'archiveCategory':
            next.categories = next.categories.filter(
                (category) => category.id !== input.categoryId
            );
            break;
        case 'archiveItem':
            for (const category of next.categories)
                category.items = category.items.filter(
                    (item) => item.definitionId !== input.itemId
                );
            break;
        case 'deleteCategory':
        case 'deleteItem':
            break;
        case 'reorderCategories':
            next.categories.sort(
                (a, b) =>
                    input.categoryIds.indexOf(a.id) -
                    input.categoryIds.indexOf(b.id)
            );
            break;
        case 'reorderItems': {
            const category = next.categories.find(
                (candidate) => candidate.id === input.categoryId
            );

            category?.items.sort(
                (a, b) =>
                    input.itemIds.indexOf(a.definitionId) -
                    input.itemIds.indexOf(b.definitionId)
            );
            break;
        }
    }
}
