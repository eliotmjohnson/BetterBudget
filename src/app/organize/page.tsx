import { BudgetRoute } from '@/components/budget/budget-route';

export default function OrganizePage({
    searchParams
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    return <BudgetRoute view='organize' searchParams={searchParams} />;
}
