import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';

export function optimisticSnapshot(
    snapshot: MonthSnapshot,
    input: BudgetMutation
): MonthSnapshot {
    const next = structuredClone(snapshot);
    const adjustAllocation = (monthlyItemId: string, amountCents: bigint) => {
        for (const category of next.categories) {
            const item = category.items.find(
                (candidate) => candidate.id === monthlyItemId
            );

            if (!item) continue;
            item.spentCents = cents(BigInt(item.spentCents) + amountCents);
            item.availableCents = cents(
                BigInt(item.availableCents) - amountCents
            );
            category.availableCents = cents(
                BigInt(category.availableCents) - amountCents
            );
        }
    };

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
        case 'addTransaction': {
            const direction = input.kind === 'refund' ? -1n : 1n;

            for (const split of input.splits)
                adjustAllocation(
                    split.monthlyItemId,
                    BigInt(split.amountCents) * direction
                );
            next.summary.spentCents = cents(
                BigInt(next.summary.spentCents) +
                    BigInt(input.totalCents) * direction
            );
            const firstItem = next.categories
                .flatMap((category) =>
                    category.items.map((item) => ({ item, category }))
                )
                .find(({ item }) => item.id === input.splits[0]?.monthlyItemId);
            const itemNamesById = new Map(
                next.categories.flatMap((category) =>
                    category.items.map((item) => [item.id, item.name])
                )
            );
            const itemNames = input.splits.flatMap((split) => {
                const itemName = itemNamesById.get(split.monthlyItemId);

                return itemName ? [itemName] : [];
            });

            next.activity.unshift({
                id: `optimistic-${input.clientMutationId}`,
                type: input.kind,
                title: input.merchant,
                subtitle: itemNames.join(', ') || 'Budget item',
                occurredOn: input.occurredOn,
                amountCents: cents(input.totalCents),
                tone: firstItem?.category.tone ?? 'blue',
                split: input.splits.length > 1,
                version: 1,
                note: input.note,
                allocations: input.splits.map((split) => ({
                    monthlyItemId: split.monthlyItemId,
                    amountCents: cents(split.amountCents)
                }))
            });
            break;
        }
        case 'updateTransaction': {
            if (!input.occurredOn.startsWith(`${input.monthKey}-`)) break;
            const activity = next.activity.find(
                (entry) => entry.id === input.transactionId
            );

            if (!activity) break;
            const oldDirection = activity.type === 'refund' ? -1n : 1n;

            for (const allocation of activity.allocations ?? [])
                adjustAllocation(
                    allocation.monthlyItemId,
                    -BigInt(allocation.amountCents) * oldDirection
                );
            const direction = input.kind === 'refund' ? -1n : 1n;

            for (const split of input.splits)
                adjustAllocation(
                    split.monthlyItemId,
                    BigInt(split.amountCents) * direction
                );
            next.summary.spentCents = cents(
                BigInt(next.summary.spentCents) -
                    BigInt(activity.amountCents) * oldDirection +
                    BigInt(input.totalCents) * direction
            );
            const firstItem = next.categories
                .flatMap((category) =>
                    category.items.map((item) => ({ item, category }))
                )
                .find(({ item }) => item.id === input.splits[0]?.monthlyItemId);
            const itemNamesById = new Map(
                next.categories.flatMap((category) =>
                    category.items.map((item) => [item.id, item.name])
                )
            );
            const itemNames = input.splits.flatMap((split) => {
                const itemName = itemNamesById.get(split.monthlyItemId);

                return itemName ? [itemName] : [];
            });

            Object.assign(activity, {
                type: input.kind,
                title: input.merchant,
                subtitle: itemNames.join(', ') || 'Budget item',
                occurredOn: input.occurredOn,
                amountCents: cents(input.totalCents),
                tone: firstItem?.category.tone ?? 'blue',
                split: input.splits.length > 1,
                version: activity.version + 1,
                note: input.note,
                allocations: input.splits.map((split) => ({
                    monthlyItemId: split.monthlyItemId,
                    amountCents: cents(split.amountCents)
                }))
            });
            break;
        }
        case 'deleteTransaction': {
            const activity = next.activity.find(
                (entry) => entry.id === input.transactionId
            );

            if (activity) {
                const direction = activity.type === 'refund' ? -1n : 1n;

                for (const allocation of activity.allocations ?? [])
                    adjustAllocation(
                        allocation.monthlyItemId,
                        -BigInt(allocation.amountCents) * direction
                    );
                next.summary.spentCents = cents(
                    BigInt(next.summary.spentCents) -
                        BigInt(activity.amountCents) * direction
                );
            }
            next.activity = next.activity.filter(
                (entry) => entry.id !== input.transactionId
            );
            break;
        }
        case 'addIncomePlan':
            next.incomePlans.push({
                id: `optimistic-${input.clientMutationId}`,
                name: input.name,
                icon: input.icon,
                tone: input.tone,
                expectedCents: cents(input.expectedCents),
                receivedCents: cents(0),
                receipts: [],
                version: 1
            });
            next.summary.expectedIncomeCents = cents(
                BigInt(next.summary.expectedIncomeCents) +
                    BigInt(input.expectedCents)
            );
            next.summary.leftToBudgetCents = cents(
                BigInt(next.summary.leftToBudgetCents) +
                    BigInt(input.expectedCents)
            );
            break;
        case 'updateIncomePlan': {
            const plan = next.incomePlans.find(
                (candidate) => candidate.id === input.incomePlanId
            );

            if (!plan) break;
            const receiptIds = new Set(
                plan.receipts.map((receipt) => receipt.id)
            );

            plan.name = input.name;
            plan.icon = input.icon;
            plan.tone = input.tone;
            plan.version += 1;
            for (const entry of next.activity) {
                if (!receiptIds.has(entry.id)) continue;
                entry.title = input.name;
                entry.tone = input.tone;
            }
            break;
        }
        case 'addIncomeReceipt': {
            const plan = next.incomePlans.find(
                (candidate) => candidate.id === input.incomePlanId
            );
            const receiptId = `optimistic-${input.clientMutationId}`;

            if (plan) {
                plan.receivedCents = cents(
                    BigInt(plan.receivedCents) + BigInt(input.amountCents)
                );
                plan.receipts.unshift({
                    id: receiptId,
                    receivedOn: input.receivedOn,
                    amountCents: cents(input.amountCents),
                    note: input.note ?? null,
                    version: 1
                });
            }
            next.summary.receivedIncomeCents = cents(
                BigInt(next.summary.receivedIncomeCents) +
                    BigInt(input.amountCents)
            );
            next.activity.unshift({
                id: receiptId,
                type: 'income',
                title: plan?.name ?? 'Income',
                subtitle: 'Income',
                occurredOn: input.receivedOn,
                amountCents: cents(input.amountCents),
                tone: plan?.tone ?? 'mint',
                split: false,
                version: 1,
                note: input.note
            });
            break;
        }
        case 'deleteIncomeReceipt': {
            const plan = next.incomePlans.find((candidate) =>
                candidate.receipts.some(
                    (receipt) => receipt.id === input.incomeReceiptId
                )
            );
            const receipt = plan?.receipts.find(
                (candidate) => candidate.id === input.incomeReceiptId
            );

            if (plan && receipt) {
                plan.receivedCents = cents(
                    BigInt(plan.receivedCents) - BigInt(receipt.amountCents)
                );
                plan.receipts = plan.receipts.filter(
                    (candidate) => candidate.id !== input.incomeReceiptId
                );
                next.summary.receivedIncomeCents = cents(
                    BigInt(next.summary.receivedIncomeCents) -
                        BigInt(receipt.amountCents)
                );
            }
            next.activity = next.activity.filter(
                (entry) => entry.id !== input.incomeReceiptId
            );
            break;
        }
        case 'deleteIncomePlan': {
            const plan = next.incomePlans.find(
                (candidate) => candidate.id === input.incomePlanId
            );

            if (!plan) break;
            const receiptIds = new Set(
                plan.receipts.map((receipt) => receipt.id)
            );

            next.summary.expectedIncomeCents = cents(
                BigInt(next.summary.expectedIncomeCents) -
                    BigInt(plan.expectedCents)
            );
            next.summary.receivedIncomeCents = cents(
                BigInt(next.summary.receivedIncomeCents) -
                    BigInt(plan.receivedCents)
            );
            next.summary.leftToBudgetCents = cents(
                BigInt(next.summary.leftToBudgetCents) -
                    BigInt(plan.expectedCents)
            );
            next.incomePlans = next.incomePlans.filter(
                (candidate) => candidate.id !== input.incomePlanId
            );
            next.activity = next.activity.filter(
                (entry) => !receiptIds.has(entry.id)
            );
            break;
        }
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

            if (item) item.name = input.name;
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
        case 'updateMonthNote':
            next.note = input.note || null;
            next.version += 1;
            break;
        case 'clearPlannedAmounts':
        case 'copyPreviousMonth':
        case 'resetBudget':
        case 'undoDeleteTransaction':
            break;
    }

    return next;
}
