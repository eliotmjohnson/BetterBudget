import { BudgetRoute } from '@/components/shell/budget-route';

export default function Page({
    searchParams
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    return <BudgetRoute view='budget' searchParams={searchParams} />;
}
