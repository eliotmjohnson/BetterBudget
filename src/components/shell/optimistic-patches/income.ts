import { cents } from '@/domain/money';
import type { MonthSnapshot } from '@/domain/types';
import type { PatchOf } from './context';

type Input = PatchOf<
    | 'addIncomePlan'
    | 'updateIncomePlan'
    | 'addIncomeReceipt'
    | 'deleteIncomeReceipt'
    | 'deleteIncomePlan'
>;

export function applyIncomePatch(next: MonthSnapshot, input: Input): void {
    switch (input.type) {
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
            const expectedDelta =
                BigInt(input.expectedCents) - BigInt(plan.expectedCents);

            plan.name = input.name;
            plan.icon = input.icon;
            plan.tone = input.tone;
            plan.expectedCents = cents(input.expectedCents);
            plan.version += 1;
            next.summary.expectedIncomeCents = cents(
                BigInt(next.summary.expectedIncomeCents) + expectedDelta
            );
            next.summary.leftToBudgetCents = cents(
                BigInt(next.summary.leftToBudgetCents) + expectedDelta
            );
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
    }
}
