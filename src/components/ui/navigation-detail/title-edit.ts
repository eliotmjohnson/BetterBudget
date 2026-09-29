'use client';

import type { RefObject } from 'react';

const titleEditMotionDuration = 360;

/**
 * Title-edit motion state that must outlive one `setupTitleMotion` run:
 * accepting a rename changes the detail's title, which re-runs the setup
 * effect mid-edit, and a fresh runtime would otherwise forget the edit and
 * snap the header shut instead of easing it back.
 */
export interface TitleEditState {
    displayedProgress: number;
    rendered: boolean;
    transitionNeeded: boolean;
    tween: { from: number; startedAt: number | null } | null;
}

export const createTitleEditState = (): TitleEditState => ({
    displayedProgress: 0,
    rendered: false,
    transitionNeeded: false,
    tween: null
});

interface TitleEditHost {
    content: HTMLElement;
    ctx: { titleEditingRef: RefObject<boolean> };
    edit: TitleEditState;
    reducedMotionQuery: MediaQueryList;
    schedule: () => void;
    titleElement: HTMLElement;
}

const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

function endTitleEditTween(rt: TitleEditHost) {
    rt.edit.tween = null;
    delete rt.content.dataset.navigationDetailTitleEditTransition;
}

/**
 * Starts easing the drawn collapse progress from `from` toward the live
 * target (fully expanded while editing, the scroll position afterwards).
 * The tween is driven frame by frame because iOS Safari does not transition
 * a transform or clip-path whose change arrives through an unregistered
 * custom property, so a CSS transition snapped the header open.
 */
export function startTitleEditTween(rt: TitleEditHost, from: number) {
    if (rt.reducedMotionQuery.matches) return;
    rt.edit.tween = { from, startedAt: null };
    rt.content.dataset.navigationDetailTitleEditTransition = 'true';
    rt.schedule();
}

/**
 * Makes iOS draw the title input's caret once the expand tween, which hides
 * it with a transparent `caret-color`, has finished: iOS repaints the caret
 * only when the selection changes, so the selection is briefly widened and
 * then restored on the frame after the caret color returns.
 */
function revealTitleCaret(titleElement: HTMLElement) {
    const input = titleElement.querySelector<HTMLInputElement>(
        '.navigation-detail-title-input'
    );

    window.requestAnimationFrame(() => {
        if (!input || document.activeElement !== input) return;
        const { selectionEnd, selectionStart } = input;

        if (selectionStart === null || selectionEnd === null) return;
        input.setSelectionRange(0, input.value.length);
        input.setSelectionRange(selectionStart, selectionEnd);
    });
}

export function titleEditTweenProgress(
    rt: TitleEditHost,
    target: number,
    now: number | null
) {
    const tween = rt.edit.tween;

    if (!tween) return target;
    if (now === null) {
        rt.schedule();

        return tween.startedAt === null
            ? tween.from
            : rt.edit.displayedProgress;
    }
    tween.startedAt ??= now;
    const elapsed = Math.max(
        0,
        (now - tween.startedAt) / titleEditMotionDuration
    );

    if (elapsed >= 1) {
        endTitleEditTween(rt);
        if (rt.ctx.titleEditingRef.current) revealTitleCaret(rt.titleElement);

        return target;
    }
    rt.schedule();

    return tween.from + (target - tween.from) * easeInOutCubic(elapsed);
}
