export const FITTED = 'data-keyboard-fit';
export const INSET = '--sheet-keyboard-inset';
const INSET_PROPERTY = 'padding-bottom';
const FIXED_HEIGHT_VARIANTS = new Set(['full-screen-mobile']);

/**
 * Whether `animation` is a sheet's keyboard inset easing in or out, or the
 * height a sheet following the keyboard eases alongside it
 * (`followKeyboard`).
 */
export function isKeyboardFitMotion(animation: Animation) {
    if (!(animation instanceof CSSTransition)) return false;
    if (animation.transitionProperty === INSET_PROPERTY) return true;
    const target =
        animation.effect instanceof KeyframeEffect
            ? animation.effect.target
            : null;

    return (
        animation.transitionProperty === 'height' &&
        target instanceof HTMLElement &&
        target.style.getPropertyValue(INSET) !== ''
    );
}

/**
 * Settles once every keyboard inset easing on `element` or an ancestor has
 * finished, straight away when none is.
 */
export function keyboardFitSettled(element: HTMLElement) {
    const moving: Promise<unknown>[] = [];

    for (
        let node: HTMLElement | null = element;
        node;
        node = node.parentElement
    )
        for (const animation of node.getAnimations())
            if (isKeyboardFitMotion(animation)) moving.push(animation.finished);

    return Promise.allSettled(moving);
}

/**
 * Whether `element` sits in a sheet whose height is set rather than taken
 * from its content, a `full-screen-mobile` sheet or one following the
 * keyboard, whose height is set in pixels while it does (`followKeyboard`),
 * so padding its body's end gives the body room to scroll instead of making
 * it taller.
 */
export function inSetHeightSheet(element: HTMLElement) {
    const sheet = element.closest<HTMLElement>('.sheet-content');

    return (
        sheet !== null &&
        (FIXED_HEIGHT_VARIANTS.has(sheet.dataset.variant ?? '') ||
            sheet.style.height !== '')
    );
}

function insetSheet(body: HTMLElement) {
    for (
        let node = body.parentElement;
        node && node !== document.body;
        node = node.parentElement
    )
        if (node.style.getPropertyValue(INSET)) return node;

    return null;
}

/**
 * Where the sheet around `body`, its scrolling body, is headed while its
 * keyboard inset eases in or out: how much taller it will still get, and how
 * much taller its body will. A content-sized sheet ends as tall as its header
 * and footer, the body's full content, and the target inset, up to its own
 * `max-height`, so it changes height by the inset and keeps its body's. A
 * sheet at its cap, or a `full-screen-mobile` sheet, whose
 * height is set rather than taken from its content, keeps its own height and
 * its body gives or takes the inset instead. Zero for a container outside
 * such a sheet.
 */
function pendingSheetChange(body: HTMLElement) {
    const sheet = insetSheet(body);

    if (!sheet) return { sheet: 0, body: 0 };
    const style = getComputedStyle(sheet);
    const inset =
        Number.parseFloat(sheet.style.getPropertyValue(INSET)) -
        Number.parseFloat(style.paddingBottom);

    if (FIXED_HEIGHT_VARIANTS.has(sheet.dataset.variant ?? ''))
        return { sheet: 0, body: -inset };
    const height = sheet.getBoundingClientRect().height;
    const cap = Number.parseFloat(style.maxHeight);
    const settled = height - body.clientHeight + body.scrollHeight + inset;
    const growth =
        Math.min(Number.isNaN(cap) ? settled : cap, settled) - height;

    return { sheet: growth, body: growth - inset };
}

/**
 * How much taller `sheet` will grow when its inset changes to `inset`, rather
 * than keep its height and shrink its body: up to the change itself for a
 * content-sized sheet, no further than its `max-height`, and nothing for a
 * sheet of a set height.
 */
export function sheetGrowth(sheet: HTMLElement, inset: number) {
    if (FIXED_HEIGHT_VARIANTS.has(sheet.dataset.variant ?? '')) return 0;
    const style = getComputedStyle(sheet);
    const height = sheet.getBoundingClientRect().height;
    const cap = Number.parseFloat(style.maxHeight);
    const change = inset - Number.parseFloat(style.paddingBottom);

    return Math.max(
        0,
        Number.isNaN(cap) ? change : Math.min(cap - height, change)
    );
}

/**
 * How much of `sheet`'s current inset is making it taller, and so will lower
 * its top edge as the inset eases out; the rest only shortens its body. Zero
 * for a sheet of a set height, or one whose content alone reaches its
 * `max-height`.
 */
export function insetInHeight(sheet: HTMLElement) {
    const body = sheet.querySelector<HTMLElement>(
        ':scope > [data-still-scroller]'
    );

    if (!body || FIXED_HEIGHT_VARIANTS.has(sheet.dataset.variant ?? ''))
        return 0;
    const style = getComputedStyle(sheet);
    const height = sheet.getBoundingClientRect().height;
    const cap = Number.parseFloat(style.maxHeight);
    const padding = Number.parseFloat(style.paddingBottom);
    const content = height - body.clientHeight + body.scrollHeight - padding;
    const settled = Number.isNaN(cap) ? content : Math.min(cap, content);

    return Math.min(padding, Math.max(0, height - settled));
}

/**
 * How much further the top edge of the keyboard-fitted sheet around `body`
 * will still rise while its inset finishes easing in, in layout pixels. Lets
 * a field be revealed from where it will end up, alongside the keyboard,
 * instead of after the inset finishes.
 */
export function pendingSheetRise(body: HTMLElement) {
    return Math.max(0, pendingSheetChange(body).sheet);
}

/**
 * The height `body` will have once the sheet around it has finished easing
 * its keyboard inset in or out, so scroll room lent or reclaimed during that
 * motion is measured for the body's final size rather than its current one.
 */
export function settledClientHeight(body: HTMLElement) {
    return body.clientHeight + pendingSheetChange(body).body;
}
