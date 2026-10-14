import 'server-only';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { getDatabase, type AppDb } from '@/db';
import { billReminderDeliveries, pushSubscriptions } from '@/db/schema';
import {
    BILL_REMINDER_SEND_HOUR,
    billReminderTitle,
    formatDueDate
} from '@/domain/bill-reminders';
import { appDateTime, monthDate } from '@/domain/calendar';
import { formatCurrency, shiftMonth, type MonthKey } from '@/domain/money';
import {
    sendPush,
    type PushPayload,
    type PushTarget
} from '@/server/push/send';
import {
    loadBillReminderCandidates,
    type BillReminderCandidate
} from './candidates';

export type BillReminderStatus =
    'sent' | 'failed' | 'already_sent' | 'no_devices' | 'would_send';

export interface BillReminderRun {
    today: string;
    hour: number;
    skipped: 'before_send_hour' | null;
    reminders: Array<{
        name: string;
        month: MonthKey;
        kind: BillReminderCandidate['decision']['kind'];
        dueOn: string;
        status: BillReminderStatus;
    }>;
}

const DELIVERY_RETENTION_MONTHS = 3;

export function billReminderPayload(
    candidate: BillReminderCandidate
): PushPayload {
    const { decision, budgetItemId, monthKey } = candidate;

    return {
        title: billReminderTitle(candidate.name, decision),
        body:
            decision.kind === 'overdue'
                ? 'No transaction recorded yet. Tap to add it.'
                : `${formatCurrency(candidate.plannedCents)} planned · ${formatDueDate(decision.dueOn)}`,
        url: `/?month=${monthKey}&item=${budgetItemId}`,
        tag: `bill-${budgetItemId}-${monthKey}-${decision.kind}`
    };
}

async function deliver(
    db: AppDb,
    candidate: BillReminderCandidate,
    targets: PushTarget[],
    dryRun: boolean
): Promise<BillReminderStatus> {
    const delivery = {
        householdId: candidate.householdId,
        budgetItemId: candidate.budgetItemId,
        month: monthDate(candidate.monthKey),
        kind: candidate.decision.kind
    };
    const matchesDelivery = and(
        eq(billReminderDeliveries.budgetItemId, delivery.budgetItemId),
        eq(billReminderDeliveries.month, delivery.month),
        eq(billReminderDeliveries.kind, delivery.kind)
    );

    if (dryRun) {
        const existing = await db
            .select({ id: billReminderDeliveries.id })
            .from(billReminderDeliveries)
            .where(matchesDelivery)
            .limit(1);

        return existing[0] ? 'already_sent' : 'would_send';
    }
    if (targets.length === 0) return 'no_devices';
    const claimed = await db
        .insert(billReminderDeliveries)
        .values(delivery)
        .onConflictDoNothing()
        .returning({ id: billReminderDeliveries.id });

    if (!claimed[0]) return 'already_sent';
    const payload = billReminderPayload(candidate);
    const outcomes: string[] = [];

    for (const target of targets)
        outcomes.push(await sendPush(target, payload));
    if (outcomes.includes('sent')) return 'sent';
    if (outcomes.includes('failed'))
        await db.delete(billReminderDeliveries).where(matchesDelivery);

    return 'failed';
}

/**
 * Sends every bill alert due today, once per bill, month, and kind. Before
 * the daily send hour it does nothing; a run later the same day catches up.
 */
export async function runBillReminders({
    now = new Date(),
    dryRun = false
}: { now?: Date; dryRun?: boolean } = {}): Promise<BillReminderRun> {
    const { date: today, hour } = appDateTime(now);

    if (hour < BILL_REMINDER_SEND_HOUR)
        return { today, hour, skipped: 'before_send_hour', reminders: [] };
    const db = await getDatabase();

    await db
        .delete(billReminderDeliveries)
        .where(
            lt(
                billReminderDeliveries.month,
                monthDate(
                    shiftMonth(today.slice(0, 7), -DELIVERY_RETENTION_MONTHS)
                )
            )
        );
    const candidates = await loadBillReminderCandidates(db, today);
    const householdIds = [...new Set(candidates.map((c) => c.householdId))];
    const subscriptions =
        householdIds.length === 0
            ? []
            : await db
                  .select()
                  .from(pushSubscriptions)
                  .where(inArray(pushSubscriptions.householdId, householdIds));
    const reminders: BillReminderRun['reminders'] = [];

    for (const candidate of candidates) {
        const targets = subscriptions.filter(
            (subscription) => subscription.householdId === candidate.householdId
        );

        reminders.push({
            name: candidate.name,
            month: candidate.monthKey,
            kind: candidate.decision.kind,
            dueOn: candidate.decision.dueOn,
            status: await deliver(db, candidate, targets, dryRun)
        });
    }

    return { today, hour, skipped: null, reminders };
}
