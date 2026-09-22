import 'server-only';
import type {
    ActivityEntry,
    BudgetCategoryView,
    BudgetItemView,
    IncomePlanView,
    MonthSnapshot
} from '@/domain/types';
import { incomePlanLabel } from './render';

/** A tool input the model can correct, returned to it as an error result. */
export class AssistantToolError extends Error {}

const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, ' ');

function pickOne<T>(
    candidates: T[],
    query: string,
    {
        name,
        display,
        kind
    }: {
        name: (candidate: T) => string;
        display: (candidate: T) => string;
        kind: string;
    }
): T {
    const wanted = normalize(query);
    const exact = candidates.filter(
        (candidate) => normalize(name(candidate)) === wanted
    );
    const matches = exact.length
        ? exact
        : candidates.filter((candidate) =>
              normalize(name(candidate)).includes(wanted)
          );

    if (matches.length === 1 && matches[0]) return matches[0];
    const options = (matches.length ? matches : candidates)
        .slice(0, 30)
        .map(display)
        .join('; ');

    if (matches.length > 1)
        throw new AssistantToolError(
            `"${query}" matches more than one ${kind}: ${options}. Ask which one they mean.`
        );

    throw new AssistantToolError(
        options
            ? `No ${kind} named "${query}". Available: ${options}.`
            : `There are no ${kind}s in this month yet.`
    );
}

export function resolveCategory(
    snapshot: MonthSnapshot,
    query: string
): BudgetCategoryView {
    return pickOne(snapshot.categories, query, {
        name: (category) => category.name,
        display: (category) => category.name,
        kind: 'category'
    });
}

/** Accepts `Item` or `Category / Item` for items whose names repeat. */
export function resolveItem(
    snapshot: MonthSnapshot,
    query: string
): BudgetItemView {
    const slash = query.indexOf('/');
    const categoryName = slash >= 0 ? query.slice(0, slash) : null;
    const itemName = slash >= 0 ? query.slice(slash + 1) : query;
    const entries = snapshot.categories
        .filter(
            (category) =>
                categoryName === null ||
                normalize(category.name) === normalize(categoryName)
        )
        .flatMap((category) =>
            category.items.map((item) => ({ category, item }))
        );

    return pickOne(entries, itemName, {
        name: ({ item }) => item.name,
        display: ({ category, item }) => `${category.name} / ${item.name}`,
        kind: 'budget item'
    }).item;
}

export function resolveIncomePlan(
    snapshot: MonthSnapshot,
    query: string
): IncomePlanView {
    const labeled = snapshot.incomePlans.map((plan, index) => ({
        plan,
        label: incomePlanLabel(snapshot, index)
    }));

    return pickOne(labeled, query, {
        name: ({ label }) => label,
        display: ({ label }) => label,
        kind: 'income source'
    }).plan;
}

export function resolveTransaction(
    snapshot: MonthSnapshot,
    ref: string
): ActivityEntry {
    const wanted = ref.trim().toLowerCase();
    const matches =
        wanted.length < 4
            ? []
            : snapshot.activity.filter(
                  (entry) =>
                      entry.type !== 'income' &&
                      entry.id.toLowerCase().startsWith(wanted)
              );

    if (matches.length === 1 && matches[0]) return matches[0];

    throw new AssistantToolError(
        `No single transaction with ref "${ref}" in ${snapshot.monthKey}. Call list_transactions for that month and use the 8-character ref it shows.`
    );
}
