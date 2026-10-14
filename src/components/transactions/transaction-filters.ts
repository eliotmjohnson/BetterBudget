import { parseAmountSearch } from '@/domain/money';
import type { ActivityEntry } from '@/domain/types';

export type TypeFilter = 'all' | 'expense' | 'refund';
export type SplitFilter = 'all' | 'split' | 'single';
export type TransactionEntry = ActivityEntry & {
    type: Exclude<ActivityEntry['type'], 'income'>;
};

export interface TransactionCriteria {
    search: string;
    type: TypeFilter;
    itemId: string;
    split: SplitFilter;
}

/**
 * A name or search reduced to its lowercase letters and digits, without
 * accents, so punctuation and spacing never decide a match: `kids` finds
 * "Kid's" and `dr` finds "Dr.".
 */
export function searchable(text: string) {
    return text
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLocaleLowerCase();
}

/**
 * The expense and refund entries that match the Transactions search and
 * filters, in their given order. A search matches the title, item names, or
 * note, compared through `searchable`, or an amount range, read from the
 * search as typed, that the total or any one split falls in.
 */
export function filterTransactions<Entry extends ActivityEntry>(
    entries: Entry[],
    criteria: TransactionCriteria
): Array<Entry & TransactionEntry> {
    const query = criteria.search.trim().toLocaleLowerCase();
    const text = searchable(query);
    const amountRange = parseAmountSearch(query);
    const inAmountRange = (value: string) => {
        const amount = BigInt(value);

        return (
            amountRange !== null &&
            amount >= amountRange.minCents &&
            amount <= amountRange.maxCents
        );
    };

    return entries.filter((entry): entry is Entry & TransactionEntry => {
        if (entry.type === 'income') return false;
        const matchesType =
            criteria.type === 'all' || entry.type === criteria.type;
        const matchesItem =
            criteria.itemId === 'all' ||
            (entry.allocations?.some(
                (allocation) => allocation.monthlyItemId === criteria.itemId
            ) ??
                false);
        const matchesSplit =
            criteria.split === 'all' ||
            (criteria.split === 'split' ? entry.split : !entry.split);

        return (
            matchesType &&
            matchesItem &&
            matchesSplit &&
            ((!text && amountRange === null) ||
                (text !== '' &&
                    searchable(
                        `${entry.title}${entry.subtitle}${entry.note ?? ''}`
                    ).includes(text)) ||
                inAmountRange(entry.amountCents) ||
                (entry.allocations?.some((allocation) =>
                    inAmountRange(allocation.amountCents)
                ) ??
                    false))
        );
    });
}
