import { BudgetRoute } from '@/components/shell/budget-route';

export default function IncomePage({
    searchParams
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    return <BudgetRoute view='income' searchParams={searchParams} />;
}
