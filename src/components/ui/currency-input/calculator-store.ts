'use client';

import type { OperatorBarFill, OperatorBarKey } from './operator-bar';

export type CalculatorState = {
    calculating: boolean;
    fill: OperatorBarFill | null;
    preview: string;
    onFill: () => void;
    onKey: (key: OperatorBarKey) => void;
};

let current: CalculatorState | null = null;
let currentOwner: object | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function subscribeCalculator(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export const currentCalculator = () => current;

/**
 * Hands the one shared calculator bar to the focused input, replacing any
 * earlier owner, and cancels a pending release so moving focus between money
 * inputs never empties the bar in between.
 */
export function publishCalculator(owner: object, state: CalculatorState) {
    clearTimeout(releaseTimer);
    currentOwner = owner;
    current = state;
    emit();
}

/**
 * Lets the bar go once this turn of the event loop ends, unless another input
 * has claimed it by then: blur and the next input's focus arrive in the same
 * task, so a switch keeps the bar mounted and still.
 */
export function releaseCalculator(owner: object) {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
        if (currentOwner !== owner) return;
        currentOwner = null;
        current = null;
        emit();
    }, 0);
}
