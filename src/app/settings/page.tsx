import { BudgetRoute } from '@/components/budget/budget-route';

export default function SettingsPage({
    searchParams
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    return <BudgetRoute view='settings' searchParams={searchParams} />;
}
