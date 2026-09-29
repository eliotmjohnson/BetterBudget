import { formatCurrencyInput } from '@/domain/money';
import { MONEY_OPERATORS, type MoneyOperator } from '@/domain/money-expression';

const OPERATOR_KEYS: Record<string, MoneyOperator> = {
    '+': '+',
    '-': '−',
    '−': '−',
    '*': '×',
    x: '×',
    X: '×',
    '×': '×',
    '/': '÷',
    '÷': '÷'
};
const MAX_OPERAND_WHOLE_DIGITS = 11;
const MAX_OPERAND_DECIMALS = 4;
const operatorSuffix = (expression: string) =>
    MONEY_OPERATORS.find((operator) => expression.endsWith(` ${operator} `));

export const operatorForKey = (key: string): MoneyOperator | null =>
    OPERATOR_KEYS[key] ?? null;

export const hasOperator = (expression: string) =>
    MONEY_OPERATORS.some((operator) => expression.includes(` ${operator} `));

export const startExpression = (valueCents: string, operator: MoneyOperator) =>
    `${formatCurrencyInput(valueCents)} ${operator} `;

const currentOperand = (expression: string) =>
    expression.split(/ [+−×÷] /).at(-1) ?? '';

function appendDigitOrPoint(expression: string, character: string) {
    const operand = currentOperand(expression);
    const [whole = '', decimals] = operand.split('.');

    if (character === '.')
        return decimals === undefined ? `${expression}.` : expression;
    if (decimals !== undefined)
        return decimals.length < MAX_OPERAND_DECIMALS
            ? `${expression}${character}`
            : expression;

    return whole.replace(/\D/g, '').length < MAX_OPERAND_WHOLE_DIGITS
        ? `${expression}${character}`
        : expression;
}

/**
 * Appends one typed character to an expression. Operators replace a trailing
 * operator rather than stacking; digits and one decimal point extend the
 * operand being typed; anything else is ignored.
 */
export function appendToExpression(expression: string, character: string) {
    const operator = operatorForKey(character);

    if (operator) {
        const trailing = operatorSuffix(expression);

        return trailing
            ? `${expression.slice(0, -3)} ${operator} `
            : `${expression} ${operator} `;
    }
    if (/^[\d.]$/.test(character))
        return appendDigitOrPoint(expression, character);

    return expression;
}

/** Removes one character, or a whole trailing operator with its spacing. */
export const deleteFromExpression = (expression: string) =>
    expression.slice(0, operatorSuffix(expression) ? -3 : -1);

/**
 * Applies a native edit to an expression whose caret is pinned to the end:
 * appended text is fed through `appendToExpression` one character at a time,
 * and a deletion removes whole characters or operators until the text is no
 * longer than what the input now holds. Any other edit is refused.
 */
export function applyExpressionEdit(previous: string, next: string) {
    if (next.startsWith(previous))
        return [...next.slice(previous.length)].reduce(
            appendToExpression,
            previous
        );
    if (!previous.startsWith(next)) return previous;
    let expression = previous;

    while (expression.length > next.length)
        expression = deleteFromExpression(expression);

    return expression;
}
