'use client';

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ComponentPropsWithoutRef
} from 'react';
import { useStillField } from '@/components/ui/still-focus';
import {
    formatCurrency,
    formatCurrencyInput,
    MAX_ENTRY_CENTS
} from '@/domain/money';
import {
    evaluateMoneyExpression,
    type MoneyOperator
} from '@/domain/money-expression';
import {
    appendToExpression,
    applyExpressionEdit,
    hasOperator,
    operatorForKey,
    startExpression
} from './expression-edit';
import { publishCalculator, releaseCalculator } from './calculator-store';
import type { OperatorBarFill, OperatorBarKey } from './operator-bar';

type CurrencyInputProps = Omit<
    ComponentPropsWithoutRef<'input'>,
    'defaultValue' | 'inputMode' | 'onChange' | 'type' | 'value'
> & {
    value: string;
    onValueChange: (valueCents: string) => void;
    fill?: (OperatorBarFill & { valueCents: string }) | null;
    fitText?: boolean;
    stillFocus?: boolean;
};

const moveCaretToEnd = (input: HTMLInputElement) => {
    const end = input.value.length;

    input.setSelectionRange(end, end);
};
const centsFromDigits = (text: string) =>
    text.replace(/\D/g, '').replace(/^0+/, '') || '0';
const MIN_EXPRESSION_FONT_PX = 11;

/**
 * Steps an expression's font size down one pixel at a time until the whole
 * expression fits the input, so its start is never scrolled out of view; any
 * inline size is cleared first, so leaving expression mode restores the
 * stylesheet's size.
 */
function fitExpression(input: HTMLInputElement, calculating: boolean) {
    input.style.removeProperty('font-size');
    if (!calculating) return;
    let fontSize = parseFloat(getComputedStyle(input).fontSize);

    while (
        input.scrollWidth > input.clientWidth &&
        fontSize > MIN_EXPRESSION_FONT_PX
    ) {
        fontSize -= 1;
        input.style.fontSize = `${fontSize}px`;
    }
}

/**
 * A money field that takes digits ATM-style, shifting them in from the right
 * as cents. Typing an operator, or tapping one on the docked operator bar,
 * turns the field into a calculator expression that starts from the current
 * amount and takes dollar operands; every valid intermediate result is
 * reported through `onValueChange`, and blur or `=` collapses the field back
 * to the last valid result. An optional `fill` offers one amount on the bar
 * that replaces the field's value in a single tap. With `fitText`, an
 * invisible copy of the displayed text follows the input, so a stylesheet can
 * size the surrounding box to the text while the input keeps one width:
 * WebKit scrolls the page to the caret whenever a focused field's text box
 * changes size. With `stillFocus`, focusing the field never slides the page
 * on iOS (`useStillField`).
 */
export function CurrencyInput({
    className,
    fill,
    fitText,
    onBlur,
    onClick,
    onFocus,
    onKeyDown,
    onTouchEnd,
    onTouchStart,
    onValueChange,
    size,
    stillFocus = false,
    value,
    ...props
}: CurrencyInputProps) {
    const [expression, setExpression] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);
    const [owner] = useState(() => ({}));
    const result =
        expression === null ? null : evaluateMoneyExpression(expression);
    const inputRef = useRef<HTMLInputElement>(null);
    const displayed = expression ?? formatCurrencyInput(value);
    const still = useStillField({
        enabled: stillFocus,
        calculator: true,
        onFocus,
        onTouchStart,
        onTouchEnd
    });

    useLayoutEffect(() => {
        if (inputRef.current)
            fitExpression(inputRef.current, expression !== null);
    }, [displayed, expression]);
    useEffect(() => {
        const input = inputRef.current;
        const viewport = window.visualViewport;

        if (!focused || !input || !viewport || !input.closest('.sheet-content'))
            return;
        let frame = 0;
        const replaceCaret = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (document.activeElement === input) moveCaretToEnd(input);
            });
        };

        viewport.addEventListener('scroll', replaceCaret);
        viewport.addEventListener('resize', replaceCaret);

        return () => {
            cancelAnimationFrame(frame);
            viewport.removeEventListener('scroll', replaceCaret);
            viewport.removeEventListener('resize', replaceCaret);
        };
    }, [focused]);

    const updateExpression = (next: string) => {
        const nextResult = evaluateMoneyExpression(next);

        setExpression(hasOperator(next) ? next : null);
        if (nextResult !== null && nextResult !== value)
            onValueChange(nextResult);
    };
    const enterOperator = (operator: MoneyOperator) =>
        updateExpression(
            expression === null
                ? startExpression(value, operator)
                : appendToExpression(expression, operator)
        );
    const pressKey = (key: OperatorBarKey) => {
        if (key === '=') setExpression(null);
        else if (key !== '.') enterOperator(key);
        else if (expression !== null)
            updateExpression(appendToExpression(expression, key));
    };
    const fillValue = () => {
        if (!fill) return;
        setExpression(null);
        if (fill.valueCents !== value) onValueChange(fill.valueCents);
    };

    useLayoutEffect(() => {
        if (!focused) return;
        publishCalculator(owner, {
            calculating: expression !== null,
            fill: fill ?? null,
            preview:
                expression === null
                    ? ''
                    : result === null
                      ? '—'
                      : formatCurrency(result),
            onFill: fillValue,
            onKey: pressKey
        });
    });
    useEffect(() => () => releaseCalculator(owner), [owner]);

    const changeAmount = (text: string) => {
        if (expression !== null) {
            updateExpression(applyExpressionEdit(expression, text));

            return;
        }
        const typed = [...text.slice(formatCurrencyInput(value).length)];
        const operatorIndex = typed.findIndex((key) => operatorForKey(key));
        const operator = operatorForKey(typed[operatorIndex] ?? '');

        if (operator) {
            updateExpression(
                typed
                    .slice(operatorIndex + 1)
                    .reduce(
                        appendToExpression,
                        startExpression(value, operator)
                    )
            );

            return;
        }
        const normalized = centsFromDigits(text);

        if (BigInt(normalized) > MAX_ENTRY_CENTS) return;
        onValueChange(normalized);
    };

    return (
        <>
            <input
                {...props}
                ref={inputRef}
                className={`currency-input${className ? ` ${className}` : ''}`}
                inputMode='numeric'
                autoComplete='off'
                size={
                    size === undefined
                        ? undefined
                        : Math.max(size, displayed.length)
                }
                value={displayed}
                onChange={(event) => changeAmount(event.currentTarget.value)}
                onTouchStart={still.onTouchStart}
                onTouchEnd={still.onTouchEnd}
                onBlur={(event) => {
                    setFocused(false);
                    releaseCalculator(owner);
                    setExpression(null);
                    onBlur?.(event);
                }}
                onClick={(event) => {
                    onClick?.(event);
                    if (!event.defaultPrevented)
                        moveCaretToEnd(event.currentTarget);
                }}
                onFocus={(event) => {
                    setFocused(true);
                    still.onFocus?.(event);
                    if (!event.defaultPrevented)
                        moveCaretToEnd(event.currentTarget);
                }}
                onKeyDown={(event) => {
                    onKeyDown?.(event);
                    if (event.defaultPrevented) return;
                    if (event.key === '=') {
                        event.preventDefault();
                        setExpression(null);
                    } else if (
                        event.key === 'ArrowLeft' ||
                        event.key === 'ArrowRight' ||
                        event.key === 'Home' ||
                        event.key === 'End'
                    ) {
                        event.preventDefault();
                        moveCaretToEnd(event.currentTarget);
                    }
                }}
            />
            {fitText ? (
                <span className='currency-input-fit' aria-hidden>
                    {displayed}
                </span>
            ) : null}
        </>
    );
}
