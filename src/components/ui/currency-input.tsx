'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { formatCurrencyInput } from '@/domain/money';

type CurrencyInputProps = Omit<
    ComponentPropsWithoutRef<'input'>,
    'defaultValue' | 'inputMode' | 'onChange' | 'type' | 'value'
> & {
    value: string;
    onValueChange: (valueCents: string) => void;
};

const moveCaretToEnd = (input: HTMLInputElement) => {
    const end = input.value.length;

    input.setSelectionRange(end, end);
};

export function CurrencyInput({
    className,
    onClick,
    onFocus,
    onKeyDown,
    onValueChange,
    value,
    ...props
}: CurrencyInputProps) {
    return (
        <input
            {...props}
            className={`currency-input${className ? ` ${className}` : ''}`}
            inputMode='numeric'
            value={formatCurrencyInput(value)}
            onChange={(event) => {
                const digits = event.currentTarget.value.replace(/\D/g, '');
                const normalized = digits.replace(/^0+/, '');

                onValueChange(normalized || '0');
            }}
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented)
                    moveCaretToEnd(event.currentTarget);
            }}
            onFocus={(event) => {
                onFocus?.(event);
                if (!event.defaultPrevented)
                    moveCaretToEnd(event.currentTarget);
            }}
            onKeyDown={(event) => {
                onKeyDown?.(event);
                if (event.defaultPrevented) return;
                if (
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
    );
}
