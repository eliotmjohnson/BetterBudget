import { cents, MAX_ENTRY_CENTS, type Cents } from '@/domain/money';

export const MONEY_OPERATORS = ['+', '−', '×', '÷'] as const;
export type MoneyOperator = (typeof MONEY_OPERATORS)[number];

type Ratio = { n: bigint; d: bigint };
type Token = Ratio | MoneyOperator;

const OPERAND = /^\$?(\d[\d,]*)?(?:\.(\d{0,4}))?$/;
const isOperator = (token: Token | undefined): token is MoneyOperator =>
    typeof token === 'string';

function parseOperand(text: string): Ratio | null {
    const match = OPERAND.exec(text);
    const whole = match?.[1]?.replaceAll(',', '') ?? '';
    const fraction = match?.[2] ?? '';

    if (!match || (whole === '' && fraction === '')) return null;

    return {
        n: BigInt(`${whole || '0'}${fraction}`),
        d: 10n ** BigInt(fraction.length)
    };
}

function tokenize(text: string): Token[] | null {
    const tokens: Token[] = [];

    for (const part of text.trim().split(/\s*([+−×÷])\s*/)) {
        if (part === '') continue;
        if ((MONEY_OPERATORS as readonly string[]).includes(part)) {
            if (isOperator(tokens.at(-1)) || tokens.length === 0) return null;
            tokens.push(part as MoneyOperator);
            continue;
        }
        const operand = parseOperand(part);

        if (!operand || (tokens.length > 0 && !isOperator(tokens.at(-1))))
            return null;
        tokens.push(operand);
    }
    if (isOperator(tokens.at(-1))) tokens.pop();

    return tokens.length > 0 ? tokens : null;
}

function apply(
    left: Ratio,
    operator: MoneyOperator,
    right: Ratio
): Ratio | null {
    switch (operator) {
        case '+':
            return {
                n: left.n * right.d + right.n * left.d,
                d: left.d * right.d
            };
        case '−':
            return {
                n: left.n * right.d - right.n * left.d,
                d: left.d * right.d
            };
        case '×':
            return { n: left.n * right.n, d: left.d * right.d };
        case '÷':
            return right.n === 0n
                ? null
                : { n: left.n * right.d, d: left.d * right.n };
    }
}

function evaluate(tokens: Token[]): Ratio | null {
    const terms: Ratio[] = [];
    const signs: MoneyOperator[] = [];
    let current = tokens[0] as Ratio;

    for (let index = 1; index < tokens.length; index += 2) {
        const operator = tokens[index] as MoneyOperator;
        const operand = tokens[index + 1] as Ratio;

        if (operator === '×' || operator === '÷') {
            const product = apply(current, operator, operand);

            if (!product) return null;
            current = product;
        } else {
            terms.push(current);
            signs.push(operator);
            current = operand;
        }
    }
    terms.push(current);

    return terms
        .slice(1)
        .reduce<Ratio | null>(
            (total, term, index) =>
                total && apply(total, signs[index] ?? '+', term),
            terms[0] ?? null
        );
}

/**
 * Evaluates a calculator expression of dollar operands such as
 * `$120.00 + 5` or `1,200 × 1.075` into exact cents, with × and ÷ binding
 * tighter than + and −. A trailing operator is ignored. The arithmetic is exact
 * rational bigint math rounded once, half-up, to cents; the result is null when
 * the text is malformed, divides by zero, or falls outside 0 to
 * `MAX_ENTRY_CENTS`.
 */
export function evaluateMoneyExpression(text: string): Cents | null {
    const tokens = tokenize(text);
    const result = tokens && evaluate(tokens);

    if (!result) return null;
    const { n, d } = result.d < 0n ? { n: -result.n, d: -result.d } : result;

    if (n < 0n) return null;
    const rounded = (n * 200n + d) / (2n * d);

    return rounded > MAX_ENTRY_CENTS ? null : cents(rounded);
}
