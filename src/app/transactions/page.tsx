import { BudgetRoute } from '@/components/budget/budget-route';

export default function TransactionsPage({
    searchParams
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    return <BudgetRoute view='transactions' searchParams={searchParams} />;
}
