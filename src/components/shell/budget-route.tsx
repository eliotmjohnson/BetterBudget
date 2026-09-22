import { cookies } from 'next/headers';
import { BudgetApp } from './app-client';
import type { AppView } from './app-shell';
import {
    ASSISTANT_PREFERENCE_COOKIE,
    BUDGET_AMOUNT_VIEW_COOKIE,
    parseAssistantPreference,
    parseBudgetAmountView
} from '@/domain/budget-preferences';
import { monthKeySchema } from '@/domain/money';
import { currentMonthKey } from '@/domain/calendar';
import { requireAccess } from '@/server/access';
import { assistantConfigured } from '@/server/assistant/config';
import { getMonthSnapshot } from '@/server/month-snapshot';

export async function BudgetRoute({
    view,
    searchParams
}: {
    view: AppView;
    searchParams: Promise<{ month?: string }>;
}) {
    const [access, params, cookieStore] = await Promise.all([
        requireAccess(),
        searchParams,
        cookies()
    ]);
    const fallbackMonth = currentMonthKey();
    const parsed = monthKeySchema.safeParse(params.month ?? fallbackMonth);
    const monthKey = parsed.success ? parsed.data : fallbackMonth;
    const snapshot = await getMonthSnapshot(monthKey, access.householdId);
    const initialBudgetAmountView = parseBudgetAmountView(
        cookieStore.get(BUDGET_AMOUNT_VIEW_COOKIE)?.value
    );

    return (
        <BudgetApp
            assistantAvailable={assistantConfigured()}
            initialAssistantEnabled={parseAssistantPreference(
                cookieStore.get(ASSISTANT_PREFERENCE_COOKIE)?.value
            )}
            initialBudgetAmountView={initialBudgetAmountView}
            initialSnapshot={snapshot}
            view={view}
        />
    );
}
