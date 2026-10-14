export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const { startBillReminderScheduler } =
        await import('@/server/bill-reminders/scheduler');

    startBillReminderScheduler();
}
