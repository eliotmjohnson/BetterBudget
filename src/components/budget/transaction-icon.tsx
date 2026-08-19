import { Receipt, RotateCcw, type LucideIcon } from 'lucide-react';
import type { ActivityEntry, CategoryTone } from '@/domain/types';

type TransactionType = Exclude<ActivityEntry['type'], 'income'>;

const iconMap: Record<TransactionType, LucideIcon> = {
    expense: Receipt,
    refund: RotateCcw
};

export function TransactionIcon({
    type,
    tone,
    size = 19
}: {
    type: TransactionType;
    tone: CategoryTone;
    size?: number;
}) {
    const Icon = iconMap[type];

    return (
        <span className={`category-medallion tone-${tone}`}>
            <Icon size={size} strokeWidth={1.8} />
        </span>
    );
}
