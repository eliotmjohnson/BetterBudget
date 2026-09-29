'use client';

import { Divide, Equal, Minus, Plus, X } from 'lucide-react';
import {
    useEffect,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import type { MoneyOperator } from '@/domain/money-expression';
import {
    currentCalculator,
    subscribeCalculator,
    type CalculatorState
} from './calculator-store';

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

type KeyboardFrame = { top: number; height: number };

/**
 * Tracks the on-screen keyboard's top edge in layout-viewport pixels and its
 * height, or null while no coarse-pointer keyboard is up or the page is
 * pinch-zoomed.
 */
function useKeyboardFrame(active: boolean) {
    const [frame, setFrame] = useState<KeyboardFrame | null>(null);

    useEffect(() => {
        const viewport = window.visualViewport;

        if (
            !active ||
            !viewport ||
            !window.matchMedia('(pointer: coarse)').matches
        )
            return;
        const update = () => {
            const height = fullViewportHeight(viewport) - viewport.height;

            setFrame(
                height >= KEYBOARD_MIN_PX && viewport.scale <= 1.01
                    ? { top: viewport.offsetTop + viewport.height, height }
                    : null
            );
        };

        update();
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);

        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
            setFrame(null);
        };
    }, [active]);

    return frame;
}

type ShownBar = { state: CalculatorState; frame: KeyboardFrame };

/**
 * The one calculator bar, mounted once in the providers and docked above the
 * on-screen number pad for whichever money input currently owns it. It slides
 * up from below the keyboard when it opens and back down when the input lets
 * go or the keyboard closes; switching between inputs only swaps its contents,
 * so it never remounts or flashes. Every control presses without moving focus
 * off the input, which would commit a half-typed expression.
 */
export function CalculatorBar() {
    const state = useSyncExternalStore(
        subscribeCalculator,
        currentCalculator,
        () => null
    );
    const frame = useKeyboardFrame(state !== null);
    const [last, setLast] = useState<ShownBar | null>(null);
    const open = state !== null && frame !== null;

    if (open && (last?.state !== state || last?.frame !== frame))
        setLast({ state, frame });

    const shown = open ? { state, frame } : last;

    if (!shown) return null;
    const { calculating, fill, preview, onFill, onKey } = shown.state;

    return createPortal(
        <div
            className='calculator-bar'
            data-calculator-bar=''
            data-state={open ? 'open' : 'closing'}
            role='toolbar'
            aria-label='Calculator'
            style={
                {
                    top: shown.frame.top,
                    '--calculator-keyboard-height': `${shown.frame.height}px`
                } as CSSProperties
            }
            onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && !open)
                    setLast(null);
            }}
        >
            {fill && !calculating ? (
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
                    <strong
                        style={
                            {
                                '--amount-chars': fill.amount.length
                            } as CSSProperties
                        }
                    >
                        {fill.amount}
                    </strong>
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
