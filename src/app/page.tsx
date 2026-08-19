import { BudgetRoute } from '@/components/budget/budget-route';

export default function Page({
    searchParams
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    return <BudgetRoute view='budget' searchParams={searchParams} />;
}
