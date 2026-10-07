import { keyboardTransition } from './motion';
import { INSET } from './pending';
import { sheetBody } from './scroll-settle';

const HEIGHT_MOTION = {
    raise: 'grow',
    lower: 'lower',
    adjust: 'adjust'
} as const;

/**
 * Holds a sheet that follows the keyboard at the height it shows now, with
 * its own `min-height` and `max-height` lifted until the fit is cleared, before
 * anything that sizes it changes as it is fitted or unfitted, so that change
 * eases with the keyboard instead of applying at once: the Better Buddy chat
 * is both at least and at most its full height while it is fitted, and
 * either limit outranks any height set on the sheet.
 */
export function holdHeight(sheet: HTMLElement) {
    sheet.style.height = `${sheet.getBoundingClientRect().height}px`;
    sheet.style.minHeight = '0px';
    sheet.style.maxHeight = 'none';
}

/**
 * How tall `sheet` sizes itself with an inset of `inset`, read with its
 * transition and any set height or limits out of the way. Its body's scroll position is
 * put back afterwards, since a body measured longer clamps its scroll.
 */
function naturalHeight(sheet: HTMLElement, inset: number) {
    const body = sheetBody(sheet);
    const scrolled = body?.scrollTop ?? 0;
    const { transition, height, minHeight, maxHeight } = sheet.style;
    const current = sheet.style.getPropertyValue(INSET);

    sheet.style.transition = 'none';
    sheet.style.removeProperty('height');
    sheet.style.removeProperty('min-height');
    sheet.style.removeProperty('max-height');
    sheet.style.setProperty(INSET, `${inset}px`);
    const measured = sheet.getBoundingClientRect().height;

    sheet.style.setProperty(INSET, current);
    sheet.style.height = height;
    sheet.style.minHeight = minHeight;
    sheet.style.maxHeight = maxHeight;
    void sheet.offsetHeight;
    sheet.style.transition = transition;
    if (body) body.scrollTop = scrolled;

    return measured;
}

/**
 * Moves a sheet that follows the keyboard to `inset`: its inset on the
 * keyboard's own `kind` motion, so the field riding on the keyboard keeps up
 * with it, and its height, set in pixels, to wherever that inset sizes it, on
 * a motion of its own (the keyboard's `grow` while rising). Left to size
 * itself, the sheet rose as fast as the inset and stopped dead at its
 * `max-height`; easing its height straight to the end settles its top
 * smoothly while its body gives up the rest. Returns how long the motion
 * takes.
 */
export function followKeyboard(
    sheet: HTMLElement,
    inset: number,
    kind: keyof typeof HEIGHT_MOTION
) {
    const from = sheet.getBoundingClientRect().height;
    const to = naturalHeight(sheet, inset);
    const padding = keyboardTransition(['padding-bottom'], kind);
    const height = keyboardTransition(['height'], HEIGHT_MOTION[kind]);

    sheet.style.transition = 'none';
    sheet.style.height = `${from}px`;
    void sheet.offsetHeight;
    sheet.style.transition = `${padding.transition}, ${height.transition}`;
    sheet.style.setProperty(INSET, `${inset}px`);
    sheet.style.height = `${to}px`;

    return Math.max(padding.settle, height.settle);
}
