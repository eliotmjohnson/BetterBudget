'use client';

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject
} from 'react';
import { restartIdle, resyncFloorShadow } from './better-buddy-figure';
import type { Velocity } from './launcher-throw';

const HARD_THROW_SPEED = 3;
const PROTEST_MS = 2200;
const FIRST_PROTEST = 'Ow, stop that!';
const PROTESTS = [
    FIRST_PROTEST,
    'Hey! Easy!',
    'Whoa, I’m dizzy!',
    'Not the antenna!',
    'I bruise easily!'
];
const TUMBLE: [offset: number, lift: number, turn: number, easing: string][] = [
    [0, 0, 0, 'cubic-bezier(0.5, 0, 0.9, 0.6)'],
    [0.16, 0, 104, 'ease-out'],
    [0.24, 0, 84, 'ease-in-out'],
    [0.3, 0, 93, 'ease-in-out'],
    [0.35, 0, 90, 'linear'],
    [0.6, 0, 90, 'ease-in-out'],
    [0.64, 0, 84, 'ease-in-out'],
    [0.68, 0, 92, 'ease-in-out'],
    [0.72, 0, 90, 'cubic-bezier(0.3, 0, 0.2, 1)'],
    [0.84, -8, -10, 'ease-in-out'],
    [0.92, 0, 4, 'ease-in-out'],
    [1, 0, 0, 'linear']
];
const SHADOW_FADE: [offset: number, visibility: number][] = [
    [0, 1],
    [0.14, 0],
    [0.74, 0],
    [0.9, 1],
    [1, 1]
];

type Side = 'left' | 'right';

function tumbleAnimations(launcher: Element | null | undefined) {
    return (launcher?.getAnimations({ subtree: true }) ?? []).filter(
        (animation) => animation.id === 'buddy-tumble'
    );
}

function cancelTumble(launcher: Element | null | undefined) {
    for (const running of tumbleAnimations(launcher)) running.cancel();
}

/**
 * Knocks Better Buddy onto his side toward his screen edge, lets him
 * bounce and wriggle on the floor, then hops him back upright, fading his
 * floor shadow out as he falls and back in as he stands.
 */
function tumble(launcher: HTMLElement, side: Side) {
    const body = launcher.querySelector<HTMLElement>('.buddy-figure-body');
    const figure = launcher.querySelector<HTMLElement>('.buddy-figure');

    if (!body || !figure) return;
    const direction = side === 'right' ? 1 : -1;
    const timing = { id: 'buddy-tumble', duration: PROTEST_MS };

    cancelTumble(launcher);
    restartIdle(launcher);
    launcher.dataset.tumbling = 'true';
    const fall = body.animate(
        TUMBLE.map(([offset, lift, turn, easing]) => ({
            offset,
            easing,
            transform: `translateY(${lift}px) rotate(${direction * turn}deg)`
        })),
        timing
    );
    const fade = figure.animate(
        SHADOW_FADE.map(([offset, visibility]) => ({
            offset,
            easing: 'ease-in-out',
            filter: `opacity(${visibility})`
        })),
        { ...timing, pseudoElement: '::after' }
    );

    if (!(fade.effect instanceof KeyframeEffect) || !fade.effect.pseudoElement)
        fade.cancel();
    fall.onfinish = fall.oncancel = () => {
        if (tumbleAnimations(launcher).length > 0) return;
        delete launcher.dataset.tumbling;
        resyncFloorShadow(launcher);
    };
}

interface Protest {
    key: number;
    text: string;
}

function nextProtest(previous: string | undefined) {
    const choices = PROTESTS.filter((text) => text !== previous);

    return choices[Math.floor(Math.random() * choices.length)] ?? FIRST_PROTEST;
}

/**
 * Makes Better Buddy fall over and complain for a moment after a throw at or
 * above 3 px/ms.
 */
export function useBuddyProtest(launcherRef: RefObject<HTMLElement | null>) {
    const [protest, setProtest] = useState<Protest | null>(null);
    const timerRef = useRef(0);
    const lastTextRef = useRef<string | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(timerRef.current), []);
    const clearProtest = useCallback(() => {
        window.clearTimeout(timerRef.current);
        cancelTumble(launcherRef.current);
        setProtest(null);
    }, [launcherRef]);
    const protestThrow = useCallback(
        (velocity: Velocity, side: Side) => {
            if (Math.hypot(velocity.x, velocity.y) < HARD_THROW_SPEED) return;
            const launcher = launcherRef.current;

            if (launcher) tumble(launcher, side);
            window.clearTimeout(timerRef.current);
            const text = nextProtest(lastTextRef.current);

            lastTextRef.current = text;
            setProtest((current) => ({
                key: (current?.key ?? 0) + 1,
                text
            }));
            timerRef.current = window.setTimeout(
                () => setProtest(null),
                PROTEST_MS
            );
        },
        [launcherRef]
    );

    return { protest, protestThrow, clearProtest };
}

export function BuddyProtestBubble({ protest }: { protest: Protest | null }) {
    if (!protest) return null;

    return (
        <span key={protest.key} className='buddy-protest' aria-hidden='true'>
            {protest.text}
        </span>
    );
}
