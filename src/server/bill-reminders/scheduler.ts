import 'server-only';
import { runBillReminders } from './index';

const TICK_MS = 30 * 60 * 1000;
const FIRST_TICK_MS = 60 * 1000;
const scheduler = globalThis as typeof globalThis & {
    betterBudgetBillReminders?: { running: boolean };
};

async function tick(state: { running: boolean }): Promise<void> {
    if (state.running) return;
    state.running = true;
    try {
        const run = await runBillReminders();
        const failed = run.reminders.filter(
            (reminder) => reminder.status === 'failed'
        );

        if (failed.length > 0) console.warn('bill reminders failed', failed);
    } catch (error) {
        console.error('bill reminders failed', error);
    } finally {
        state.running = false;
    }
}

/** Starts the in-process bill reminder loop once per server process. */
export function startBillReminderScheduler(): void {
    if (scheduler.betterBudgetBillReminders) return;
    const state = { running: false };

    scheduler.betterBudgetBillReminders = state;
    setTimeout(() => void tick(state), FIRST_TICK_MS).unref();
    setInterval(() => void tick(state), TICK_MS).unref();
}
