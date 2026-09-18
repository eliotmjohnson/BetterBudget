import 'server-only';
import { and, gt, isNull, or } from 'drizzle-orm';
import { budgetItems, budgetMonths, categories } from '@/db/schema';

export const definitionActiveIn = (month: string | typeof budgetMonths.month) =>
    and(
        or(
            isNull(categories.archivedAt),
            gt(categories.archivedFromMonth, month)
        ),
        or(
            isNull(budgetItems.archivedAt),
            gt(budgetItems.archivedFromMonth, month)
        )
    );
