import {
    Baby,
    BriefcaseBusiness,
    Car,
    Dumbbell,
    Gift,
    Heart,
    House,
    PawPrint,
    PiggyBank,
    Plane,
    ShoppingBag,
    Sparkles,
    Utensils,
    WalletCards,
    type LucideIcon
} from 'lucide-react';
import type { CategoryTone } from '@/domain/types';

export const categoryIconOptions = [
    { value: 'heart', label: 'Heart' },
    { value: 'house', label: 'Home' },
    { value: 'piggy-bank', label: 'Savings' },
    { value: 'sparkles', label: 'Sparkles' },
    { value: 'utensils', label: 'Food' },
    { value: 'wallet', label: 'Wallet' },
    { value: 'car', label: 'Car' },
    { value: 'baby', label: 'Family' },
    { value: 'briefcase', label: 'Work' },
    { value: 'plane', label: 'Travel' },
    { value: 'gift', label: 'Gift' },
    { value: 'dumbbell', label: 'Fitness' },
    { value: 'paw-print', label: 'Pets' },
    { value: 'shopping-bag', label: 'Shopping' }
] as const;

const iconMap: Record<
    (typeof categoryIconOptions)[number]['value'],
    LucideIcon
> = {
    heart: Heart,
    house: House,
    'piggy-bank': PiggyBank,
    sparkles: Sparkles,
    utensils: Utensils,
    wallet: WalletCards,
    car: Car,
    baby: Baby,
    briefcase: BriefcaseBusiness,
    plane: Plane,
    gift: Gift,
    dumbbell: Dumbbell,
    'paw-print': PawPrint,
    'shopping-bag': ShoppingBag
};

export function CategoryIcon({
    icon,
    tone,
    size = 19
}: {
    icon: string;
    tone: CategoryTone;
    size?: number;
}) {
    const Icon = iconMap[icon as keyof typeof iconMap] ?? WalletCards;

    return (
        <span className={`category-medallion tone-${tone}`}>
            <Icon size={size} strokeWidth={1.8} />
        </span>
    );
}
