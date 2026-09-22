import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

type Properties = Record<string, Record<string, unknown>>;

const month = {
    type: 'string',
    description:
        'Budget month as YYYY-MM. Omit to use the month the person is viewing.'
};
const amount = (description: string) => ({
    type: 'string',
    description: `${description} Dollars as plain text, e.g. "12.34" or "1,200". Never negative.`
});
const date = {
    type: 'string',
    description: 'Calendar date as YYYY-MM-DD.'
};
const item = {
    type: 'string',
    description:
        'Budget item name exactly as shown by get_month_overview. Use "Category / Item" when the same item name exists in two categories.'
};
const ref = {
    type: 'string',
    description: 'The 8-character transaction ref shown by list_transactions.'
};
const splits = {
    type: 'array',
    description:
        'Use instead of item to split one transaction across several budget items. The split amounts must add up exactly to the total amount.',
    items: {
        type: 'object',
        properties: { item, amount: amount('This split’s share.') },
        required: ['item', 'amount'],
        additionalProperties: false
    }
};

function tool(
    name: string,
    description: string,
    properties: Properties,
    required: string[] = []
): Anthropic.Tool {
    return {
        name,
        description,
        input_schema: {
            type: 'object',
            properties,
            required,
            additionalProperties: false
        }
    };
}

/** Frozen and ordered: any change here invalidates the cached prompt prefix. */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
    tool(
        'get_month_overview',
        'Read one month of the budget: income, planned, spent, and left-to-budget totals; every category and budget item with planned, spent, available, carry-in, and carryover setting; income sources with expected and received amounts; and the month note. Call this before answering questions about the budget or making changes, and again whenever you need names you have not seen yet.',
        { month }
    ),
    tool(
        'list_transactions',
        'List a month’s expense and income transactions, newest first, with the ref needed to edit or delete one. Optionally filter by text in the merchant or note, or by budget item.',
        {
            month,
            search: {
                type: 'string',
                description: 'Text to find in the merchant or note.'
            },
            item
        }
    ),
    tool(
        'get_history',
        'Exact figures over a range of months for one budget item, one category, or the whole budget (omit both item and category). Returns each month’s planned, expenses only, income into the item, net spent, carry-in, available, and how far expenses went over planned (for a category or the whole budget, the sum of each item’s own overage), then totals, per-month averages, how many months went over planned, the average overage across all months and across only the months that went over, and the largest overage. A category or whole-budget request adds one short line per item. Use this for averages, trends, comparisons, and anything spanning more than one month instead of adding numbers yourself. Keep the range as short as the question allows.',
        {
            item,
            category: {
                type: 'string',
                description: 'Category name, instead of item.'
            },
            from_month: {
                type: 'string',
                description:
                    'First month as YYYY-MM. Omit for a single month (to_month).'
            },
            to_month: {
                type: 'string',
                description:
                    'Last month as YYYY-MM, at most 24 months after from_month. Omit to use the viewed month.'
            }
        }
    ),
    tool(
        'set_plan_amount',
        'Set the planned (budgeted) amount of one budget item for a month.',
        { month, item, amount: amount('The new planned amount.') },
        ['item', 'amount']
    ),
    tool(
        'set_carryover',
        'Turn a budget item’s carryover on or off for a month. When on, the month’s ending available balance (positive or negative) flows into the next month.',
        {
            month,
            item,
            enabled: {
                type: 'boolean',
                description: 'True to carry the balance over.'
            }
        },
        ['item', 'enabled']
    ),
    tool(
        'add_transaction',
        'Record a new expense or income transaction against budget items. An income transaction adds money to a budget item (a refund, reimbursement, rebate, or money given toward that item) and shows as Income on the Transactions page. This is not for paychecks or other income sources; use record_income for those. The transaction is added to the month its date falls in. Give either item (one budget item) or splits (several).',
        {
            kind: {
                type: 'string',
                enum: ['expense', 'income'],
                description:
                    'expense for money spent from a budget item; income for money coming into a budget item.'
            },
            merchant: {
                type: 'string',
                description:
                    'Who was paid, or who the money came from, max 120 chars.'
            },
            date,
            amount: amount('Total amount of the transaction.'),
            item,
            splits,
            note: { type: 'string', description: 'Optional short note.' }
        },
        ['kind', 'merchant', 'date', 'amount']
    ),
    tool(
        'update_transaction',
        'Edit an existing expense or income transaction. Only pass the fields that change. If the total changes on a split transaction, pass the new splits too. Changing the date to another month moves the transaction there.',
        {
            month,
            ref,
            kind: { type: 'string', enum: ['expense', 'income'] },
            merchant: { type: 'string' },
            date,
            amount: amount('New total amount.'),
            item,
            splits,
            note: {
                type: 'string',
                description: 'New note; an empty string removes it.'
            }
        },
        ['ref']
    ),
    tool(
        'delete_transaction',
        'Delete one expense or income transaction. The person can undo this from the Transactions page.',
        { month, ref },
        ['ref']
    ),
    tool(
        'add_income_source',
        'Add an expected-income source (for example a paycheck) with its expected amount for a month.',
        {
            month,
            name: { type: 'string', description: 'Source name, max 80 chars.' },
            expected_amount: amount('Expected income for the month.')
        },
        ['name', 'expected_amount']
    ),
    tool(
        'update_income_source',
        'Rename an income source or change its expected amount for a month. Only pass the fields that change.',
        {
            month,
            source: {
                type: 'string',
                description: 'Current income source name.'
            },
            new_name: { type: 'string' },
            expected_amount: amount('New expected amount.')
        },
        ['source']
    ),
    tool(
        'record_income',
        'Record a paycheck or other money received from an income source on the Income page (money that funds the whole budget). Not for money coming into a single budget item; use add_transaction with kind income for that. It is recorded in the month its date falls in.',
        {
            source: { type: 'string', description: 'Income source name.' },
            date,
            amount: amount('Amount received.'),
            note: { type: 'string', description: 'Optional short note.' }
        },
        ['source', 'date', 'amount']
    ),
    tool(
        'add_category',
        'Add a new budget category to a month.',
        {
            month,
            name: {
                type: 'string',
                description: 'Category name, max 80 chars.'
            }
        },
        ['name']
    ),
    tool(
        'add_item',
        'Add a new budget item inside an existing category, optionally with a planned amount.',
        {
            month,
            category: {
                type: 'string',
                description: 'Existing category name.'
            },
            name: { type: 'string', description: 'Item name, max 80 chars.' },
            planned_amount: amount('Optional planned amount.')
        },
        ['category', 'name']
    ),
    tool(
        'rename_category',
        'Rename a category. Names are shared by every month.',
        {
            month,
            category: { type: 'string', description: 'Current category name.' },
            new_name: { type: 'string' }
        },
        ['category', 'new_name']
    ),
    tool(
        'rename_item',
        'Rename a budget item. Names are shared by every month.',
        { month, item, new_name: { type: 'string' } },
        ['item', 'new_name']
    ),
    tool(
        'set_month_note',
        'Replace the month’s note. An empty string clears it.',
        {
            month,
            note: { type: 'string', description: 'Max 500 characters.' }
        },
        ['note']
    )
];
