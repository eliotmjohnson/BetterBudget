'use client';

import { useEffect, useState } from 'react';

export const KEYBOARD_PROBE_KEY = 'better-budget-keyboard-probe';
export const KEYBOARD_PROBE_EVENT = 'better-budget-keyboard-probe-change';

const OPEN_SHEET = '.sheet-content[data-state="open"]';
const SPAN_MS = 1000;
const BADGE_MS = 5000;
const COLUMNS = [
    'tag',
    't',
    'innerH',
    'clientH',
    'vvTop',
    'vvPageTop',
    'vvH',
    'scrollY',
    'envTop',
    'lvh',
    'dvh',
    'sheetTop',
    'sheetBottom',
    'sheetTop+vvTop',
    'fieldTop'
];

type Row = Array<string | number>;
type Run = { frames: number; sent: boolean };

/** Reads whether the dev-only keyboard probe is switched on for this device. */
export function keyboardProbeEnabled() {
    try {
        return window.localStorage.getItem(KEYBOARD_PROBE_KEY) === 'on';
    } catch {
        return false;
    }
}

function measureBox(height: string) {
    const box = document.createElement('div');

    box.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${height};visibility:hidden;pointer-events:none`;
    document.documentElement.append(box);

    return box;
}

function wrapMethod<T extends object>(
    target: T,
    name: keyof T,
    before: () => void
) {
    const original = target[name] as unknown as (...args: unknown[]) => unknown;

    target[name] = function (this: unknown, ...args: unknown[]) {
        before();

        return Reflect.apply(original, this, args);
    } as unknown as T[keyof T];

    return () => {
        target[name] = original as unknown as T[keyof T];
    };
}

function deviceHeader() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;

    return `# ${navigator.userAgent} | standalone=${standalone} | dpr=${window.devicePixelRatio} | screen=${window.screen.width}x${window.screen.height} | innerW=${window.innerWidth}`;
}

async function sendLog(text: string) {
    try {
        const response = await fetch('/api/dev/keyboard-probe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        return response.ok;
    } catch {
        return false;
    }
}

function startProbe(onRun: (run: Run) => void) {
    const boxes = {
        envTop: measureBox('env(safe-area-inset-top)'),
        lvh: measureBox('100lvh'),
        dvh: measureBox('100dvh')
    };
    const px = (box: HTMLElement) => box.getBoundingClientRect().height;
    let startedAt = 0;
    let rows: Row[] = [];
    let running = false;
    const sample = (tag: string) => {
        const viewport = window.visualViewport;

        if (!running || !viewport) return;
        const sheet = document
            .querySelector(OPEN_SHEET)
            ?.getBoundingClientRect();
        const field = document.activeElement?.getBoundingClientRect();

        rows.push([
            tag,
            (performance.now() - startedAt).toFixed(1),
            window.innerHeight,
            document.documentElement.clientHeight,
            viewport.offsetTop.toFixed(1),
            viewport.pageTop.toFixed(1),
            viewport.height.toFixed(1),
            window.scrollY,
            px(boxes.envTop),
            px(boxes.lvh),
            px(boxes.dvh),
            sheet?.top.toFixed(1) ?? '',
            sheet?.bottom.toFixed(1) ?? '',
            sheet ? (sheet.top + viewport.offsetTop).toFixed(1) : '',
            field?.top.toFixed(1) ?? ''
        ]);
    };
    const finish = async () => {
        running = false;
        const text = [
            deviceHeader(),
            COLUMNS.join('\t'),
            ...rows.map((row) => row.join('\t'))
        ].join('\n');

        try {
            window.localStorage.setItem(`${KEYBOARD_PROBE_KEY}-log`, text);
        } catch {}
        onRun({ frames: rows.length, sent: await sendLog(text) });
    };
    const loop = () => {
        sample('raf');
        if (performance.now() - startedAt < SPAN_MS)
            requestAnimationFrame(loop);
        else void finish();
    };
    const begin = (event: Event) => {
        const target = event.target as Element | null;

        if (running || !target?.closest?.(`${OPEN_SHEET} input`)) return;
        startedAt = performance.now();
        rows = [];
        running = true;
        sample(event.type);
        requestAnimationFrame(loop);
    };
    const tagged = (tag: string) => () => sample(tag);
    const listeners: Array<[EventTarget, string, EventListener, boolean]> = [
        [document, 'pointerdown', begin, true],
        [document, 'focusin', tagged('focusin'), true],
        [window, 'scroll', tagged('win-scroll'), false]
    ];

    if (window.visualViewport)
        listeners.push(
            [window.visualViewport, 'resize', tagged('vv-resize'), false],
            [window.visualViewport, 'scroll', tagged('vv-scroll'), false]
        );
    for (const [target, type, listener, capture] of listeners)
        target.addEventListener(type, listener, capture);
    const restores = [
        wrapMethod(window, 'scrollTo', tagged('CALL scrollTo')),
        wrapMethod(window, 'scrollBy', tagged('CALL scrollBy')),
        wrapMethod(
            Element.prototype,
            'scrollIntoView',
            tagged('CALL scrollIntoView')
        )
    ];

    return () => {
        for (const [target, type, listener, capture] of listeners)
            target.removeEventListener(type, listener, capture);
        for (const restore of restores) restore();
        for (const box of Object.values(boxes)) box.remove();
    };
}

/**
 * Development-only probe for the keyboard dip in sheets: while switched on in
 * Settings, a touch on a field in an open sheet records one second of
 * per-frame viewport and sheet geometry and sends it to the dev server, which
 * prints it and saves it under `.data/`.
 */
export function KeyboardDipProbe() {
    const [enabled, setEnabled] = useState(
        () => typeof window !== 'undefined' && keyboardProbeEnabled()
    );
    const [run, setRun] = useState<Run | null>(null);

    useEffect(() => {
        const sync = () => setEnabled(keyboardProbeEnabled());

        window.addEventListener(KEYBOARD_PROBE_EVENT, sync);

        return () => window.removeEventListener(KEYBOARD_PROBE_EVENT, sync);
    }, []);
    useEffect(() => (enabled ? startProbe(setRun) : undefined), [enabled]);
    useEffect(() => {
        if (!run) return;
        const timer = window.setTimeout(() => setRun(null), BADGE_MS);

        return () => window.clearTimeout(timer);
    }, [run]);

    if (!enabled || !run) return null;

    return (
        <div className='keyboard-probe-badge' role='status'>
            Probe: {run.frames} samples{' '}
            {run.sent ? 'sent to dev server' : 'saved on this device only'}
        </div>
    );
}
