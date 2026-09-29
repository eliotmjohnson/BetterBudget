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
const KEYBOARD_JITTER_PX = 8;
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

type ViewportFrame = { offsetTop: number; height: number; keyboard: number };

const keyboardUp = (frame: ViewportFrame | null): frame is ViewportFrame =>
    frame !== null && frame.keyboard >= KEYBOARD_MIN_PX;

/**
 * Tracks the visual viewport (its offset into the layout viewport, its
 * height, and the keyboard height it leaves) while `active`, read in the
 * animation frame after each `resize` or `scroll` so a scroll another handler
 * undoes in the same frame is never seen. A pinch-zoomed page counts as having
 * no keyboard. While the keyboard stays up, moves of
 * its top edge or height smaller than `KEYBOARD_JITTER_PX` keep the previous
 * frame, so the few-pixel nudges iOS makes as focus moves between inputs do
 * not shift the bar.
 */
function useViewportFrame(active: boolean) {
    const [frame, setFrame] = useState<ViewportFrame | null>(null);

    useEffect(() => {
        const viewport = window.visualViewport;

        if (
            !active ||
            !viewport ||
            !window.matchMedia('(pointer: coarse)').matches
        )
            return;
        const update = () => {
            const next = {
                offsetTop: viewport.offsetTop,
                height: viewport.height,
                keyboard:
                    viewport.scale > 1.01
                        ? 0
                        : fullViewportHeight(viewport) - viewport.height
            };

            setFrame((current) =>
                keyboardUp(current) &&
                keyboardUp(next) &&
                Math.abs(
                    current.offsetTop +
                        current.height -
                        next.offsetTop -
                        next.height
                ) < KEYBOARD_JITTER_PX &&
                Math.abs(current.keyboard - next.keyboard) < KEYBOARD_JITTER_PX
                    ? current
                    : next
            );
        };
        let frameRequest = 0;
        const scheduleUpdate = () => {
            cancelAnimationFrame(frameRequest);
            frameRequest = requestAnimationFrame(update);
        };

        update();
        viewport.addEventListener('resize', scheduleUpdate);
        viewport.addEventListener('scroll', scheduleUpdate);

        return () => {
            cancelAnimationFrame(frameRequest);
            viewport.removeEventListener('resize', scheduleUpdate);
            viewport.removeEventListener('scroll', scheduleUpdate);
            setFrame(null);
        };
    }, [active]);

    return frame;
}

type ShownBar = { state: CalculatorState; screenTop: number; keyboard: number };

/**
 * The one calculator bar, mounted once in the providers and docked above the
 * on-screen number pad for whichever money input currently owns it. Once the
 * keyboard is up it slides in from the right, and it slides down with the
 * keyboard when the input lets go or the keyboard closes; switching between
 * inputs only swaps its contents, so it never remounts or flashes. While
 * closing it holds the keyboard's last on-screen top edge against the live
 * viewport offset, so the jump iOS makes when it drops the keyboard's page
 * scroll does not carry the bar off with it. Every control presses without
 * moving focus off the input, which would commit a half-typed expression. A
 * tapped fill chip stays in place and fades out rather than leaving the page
 * under the finger that pressed it.
 */
export function CalculatorBar() {
    const state = useSyncExternalStore(
        subscribeCalculator,
        currentCalculator,
        () => null
    );
    const [last, setLast] = useState<ShownBar | null>(null);
    const [spentFill, setSpentFill] = useState<OperatorBarFill | null>(null);
    const viewport = useViewportFrame(state !== null || last !== null);
    const open = state !== null && keyboardUp(viewport);

    if (
        open &&
        (last?.state !== state ||
            last?.screenTop !== viewport.height ||
            last?.keyboard !== viewport.keyboard)
    )
        setLast({
            state,
            screenTop: viewport.height,
            keyboard: viewport.keyboard
        });

    const shown = open
        ? { state, screenTop: viewport.height, keyboard: viewport.keyboard }
        : last;

    if (!shown) return null;
    const { calculating, fill, preview, onFill, onKey } = shown.state;
    const liveFill = calculating ? null : fill;

    if (liveFill && spentFill && liveFill !== spentFill) setSpentFill(null);
    const chip = liveFill ?? (calculating ? null : spentFill);

    return createPortal(
        <div className='calculator-dock'>
            <div
                className='calculator-bar'
                data-calculator-bar=''
                data-state={open ? 'open' : 'closing'}
                role='toolbar'
                aria-label='Calculator'
                style={
                    {
                        top: (viewport?.offsetTop ?? 0) + shown.screenTop,
                        '--calculator-keyboard-height': `${shown.keyboard}px`
                    } as CSSProperties
                }
                onAnimationEnd={(event) => {
                    if (event.target !== event.currentTarget || open) return;
                    setLast(null);
                    setSpentFill(null);
                }}
            >
                {chip ? (
                    <button
                        className='calculator-bar-fill'
                        type='button'
                        tabIndex={-1}
                        aria-label={chip.label}
                        aria-hidden={chip === liveFill ? undefined : true}
                        data-state={chip === liveFill ? 'live' : 'spent'}
                        onAnimationEnd={() => setSpentFill(null)}
                        {...pressHandlers(() => {
                            setSpentFill(chip);
                            onFill();
                        })}
                    >
                        <span className='calculator-bar-fill-caption'>
                            {chip.caption}
                        </span>
                        <strong
                            style={
                                {
                                    '--amount-chars': chip.amount.length
                                } as CSSProperties
                            }
                        >
                            {chip.amount}
                        </strong>
                    </button>
                ) : (
                    <output className='calculator-bar-preview'>
                        {preview}
                    </output>
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
            </div>
        </div>,
        document.body
    );
}
