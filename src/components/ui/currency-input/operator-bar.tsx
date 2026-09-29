'use client';

import { Divide, Equal, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MoneyOperator } from '@/domain/money-expression';

export type OperatorBarKey = MoneyOperator | '.' | '=';

const KEYBOARD_MIN_PX = 100;
const KEYS: { key: OperatorBarKey; label: string; glyph: ReactNode }[] = [
    { key: '÷', label: 'Divide', glyph: <Divide aria-hidden /> },
    { key: '×', label: 'Multiply', glyph: <X aria-hidden /> },
    { key: '−', label: 'Minus', glyph: <Minus aria-hidden /> },
    { key: '+', label: 'Plus', glyph: <Plus aria-hidden /> },
    { key: '.', label: 'Decimal point', glyph: '.' },
    { key: '=', label: 'Equals', glyph: <Equal aria-hidden /> }
];

/**
 * An optional one-tap amount offered in the preview slot while no expression
 * is being typed, such as filling a plan with what is left to budget.
 */
export type OperatorBarFill = {
    amount: string;
    caption: string;
    label: string;
};

/**
 * Press handlers for a bar control that must act without taking focus from
 * the input: `pointerdown` is prevented, the touch acts on `touchend` with its
 * default prevented so iOS synthesizes no focus-moving click, and `onClick`
 * covers VoiceOver and mouse activation.
 */
const pressHandlers = (action: () => void) => ({
    onPointerDown: (event: { preventDefault: () => void }) =>
        event.preventDefault(),
    onTouchEnd: (event: { preventDefault: () => void }) => {
        event.preventDefault();
        action();
    },
    onClick: action
});

export const isCalculatorBarTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest('[data-calculator-bar]') !== null;

const fullViewport = { width: 0, height: 0 };

/**
 * The tallest keyboard-free height seen at the current viewport width. iOS
 * shrinks `window.innerHeight` along with the visual viewport while the
 * keyboard is up, so neither can serve as the baseline on its own; the layout
 * viewport's `clientHeight` stays put, and the running maximum covers browsers
 * where it does not. A width change (rotation) starts a new baseline.
 */
function fullViewportHeight(viewport: VisualViewport) {
    if (fullViewport.width !== viewport.width) {
        fullViewport.width = viewport.width;
        fullViewport.height = 0;
    }
    fullViewport.height = Math.max(
        fullViewport.height,
        viewport.height,
        document.documentElement.clientHeight
    );

    return fullViewport.height;
}

/**
 * Tracks the top edge of the on-screen keyboard in layout-viewport pixels,
 * or null while no coarse-pointer keyboard is up or the page is pinch-zoomed.
 */
function useKeyboardTop(active: boolean) {
    const [keyboardTop, setKeyboardTop] = useState<number | null>(null);

    useEffect(() => {
        const viewport = window.visualViewport;

        if (
            !active ||
            !viewport ||
            !window.matchMedia('(pointer: coarse)').matches
        )
            return;
        const update = () => {
            const keyboardUp =
                fullViewportHeight(viewport) - viewport.height >=
                    KEYBOARD_MIN_PX && viewport.scale <= 1.01;

            setKeyboardTop(
                keyboardUp ? viewport.offsetTop + viewport.height : null
            );
        };

        update();
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);

        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
            setKeyboardTop(null);
        };
    }, [active]);

    return keyboardTop;
}

/**
 * The calculator keys docked above the on-screen number pad while a currency
 * input is focused, plus the optional fill amount. Every control presses
 * without moving focus off the input, which would commit a half-typed
 * expression.
 */
export function OperatorBar({
    active,
    calculating,
    fill,
    preview,
    onFill,
    onKey
}: {
    active: boolean;
    calculating: boolean;
    fill?: OperatorBarFill | null;
    preview: string;
    onFill?: () => void;
    onKey: (key: OperatorBarKey) => void;
}) {
    const keyboardTop = useKeyboardTop(active);

    if (keyboardTop === null) return null;

    return createPortal(
        <div
            className='calculator-bar'
            data-calculator-bar=''
            role='toolbar'
            aria-label='Calculator'
            style={{ top: keyboardTop }}
        >
            {fill && onFill && !calculating ? (
                <button
                    className='calculator-bar-fill'
                    type='button'
                    tabIndex={-1}
                    aria-label={fill.label}
                    {...pressHandlers(onFill)}
                >
                    <span className='calculator-bar-fill-caption'>
                        {fill.caption}
                    </span>
                    <strong>{fill.amount}</strong>
                </button>
            ) : (
                <output className='calculator-bar-preview'>{preview}</output>
            )}
            <div className='calculator-bar-keys'>
                {KEYS.map(({ key, label, glyph }) => (
                    <button
                        key={key}
                        className='calculator-bar-key'
                        type='button'
                        tabIndex={-1}
                        aria-label={label}
                        aria-disabled={
                            !calculating && (key === '.' || key === '=')
                                ? true
                                : undefined
                        }
                        data-key={key}
                        {...pressHandlers(() => onKey(key))}
                    >
                        {glyph}
                    </button>
                ))}
            </div>
        </div>,
        document.body
    );
}
