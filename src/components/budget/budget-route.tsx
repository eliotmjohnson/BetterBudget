import { BudgetApp } from './app-client';
import type { AppView } from './app-shell';
import { monthKeySchema } from '@/domain/money';
import { requireAccess } from '@/server/access';
import { getMonthSnapshot } from '@/server/budget-service';

export async function BudgetRoute({
    view,
    searchParams
}: {
    view: AppView;
    searchParams: Promise<{ month?: string }>;
}) {
    const access = await requireAccess();
    const params = await searchParams;
    const parsed = monthKeySchema.safeParse(params.month ?? '2026-08');
    const monthKey = parsed.success
        ? parsed.data
        : monthKeySchema.parse('2026-08');
    const snapshot = await getMonthSnapshot(monthKey, access.householdId);

    return <BudgetApp initialSnapshot={snapshot} view={view} />;
}
