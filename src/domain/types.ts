import type { Cents, MonthKey } from './money';

export type CategoryTone = 'yellow' | 'coral' | 'blue' | 'mint' | 'lilac';

export interface BudgetItemView {
    id: string;
    definitionId: string;
    definitionVersion: number;
    name: string;
    plannedCents: Cents;
    spentCents: Cents;
    availableCents: Cents;

    /** Balance received from the immediately previous calendar month. */
    carryInCents: Cents;

    /** Whether this month's ending balance flows into the next month. */
    carryoverEnabled: boolean;
    version: number;
}

export interface BudgetCategoryView {
    id: string;
    name: string;
    icon: string;
    tone: CategoryTone;
    availableCents: Cents;
    items: BudgetItemView[];
    version: number;
}

export interface ActivityEntry {
    id: string;
    type: 'expense' | 'refund' | 'income';
    title: string;
    subtitle: string;
    occurredOn: string;
    amountCents: Cents;
    tone: CategoryTone;
    split: boolean;
    version: number;
    note?: string | null;
    allocations?: Array<{ monthlyItemId: string; amountCents: Cents }>;
}

export interface IncomePlanView {
    id: string;
    name: string;
    icon: string;
    tone: CategoryTone;
    expectedCents: Cents;
    receivedCents: Cents;
    receipts: IncomeReceiptView[];
    version: number;
}

export interface IncomeReceiptView {
    id: string;
    receivedOn: string;
    amountCents: Cents;
    note: string | null;
    version: number;
}

export interface MonthSnapshot {
    householdId: string;

    /** Null while a month has only been viewed and has no persisted state. */
    monthId: string | null;
    monthKey: MonthKey;
    label: string;
    canCopyPreviousMonth: boolean;
    version: number;
    note: string | null;
    summary: {
        expectedIncomeCents: Cents;
        receivedIncomeCents: Cents;
        plannedCents: Cents;
        spentCents: Cents;
        leftToBudgetCents: Cents;
    };
    categories: BudgetCategoryView[];
    incomePlans: IncomePlanView[];
    activity: ActivityEntry[];
}

export type MutationErrorCode =
    | 'validation'
    | 'conflict'
    | 'target_not_empty'
    | 'split_mismatch'
    | 'offline'
    | 'not_found'
    | 'unauthorized';

export type MutationResult =
    | { ok: true; snapshot: MonthSnapshot; clientMutationId: string }
    | {
          ok: false;
          code: MutationErrorCode;
          message: string;
          snapshot?: MonthSnapshot;
      };
