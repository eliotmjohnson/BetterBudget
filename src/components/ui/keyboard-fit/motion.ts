/**
 * The keyboard's motions, fitted frame by frame to a recording of the iOS
 * keyboard, for anything that moves with it: `raise` as it rises, `grow` for
 * a sheet that grows taller to make room, slightly behind the keyboard,
 * `lower` as it closes, `adjust` for a change while it stays up, and `snap`
 * for no motion at all.
 */
const KEYBOARD_MOTIONS = {
    raise: { ms: 360, delay: 0, curve: 'cubic-bezier(0.2, 1, 0.45, 1)' },
    grow: { ms: 440, delay: 0, curve: 'cubic-bezier(0.2, 1, 0.45, 1)' },
    lower: { ms: 230, delay: -16, curve: 'cubic-bezier(0.2, 0.05, 0.3, 1)' },
    adjust: { ms: 100, delay: 0, curve: 'cubic-bezier(0.2, 1, 0.45, 1)' },
    snap: { ms: 0, delay: 0, curve: 'linear' }
};

export type KeyboardMotion = keyof typeof KEYBOARD_MOTIONS;

/**
 * A transition moving `properties` on the keyboard's `kind` motion, and how
 * long after it is set the motion has finished.
 */
export function keyboardTransition(properties: string[], kind: KeyboardMotion) {
    const { ms, delay, curve } = KEYBOARD_MOTIONS[kind];

    return {
        transition: properties
            .map((property) => `${property} ${ms}ms ${curve} ${delay}ms`)
            .join(', '),
        settle: Math.max(0, ms + delay)
    };
}

/**
 * How far `sheet`'s `transform` currently moves it down, such as its entrance
 * sliding it up from below the screen.
 */
function transformOffsetY(sheet: HTMLElement) {
    const transform = getComputedStyle(sheet).transform;

    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
}

/**
 * How far the keyboard covers `sheet`, from the sheet's bottom edge to the
 * keyboard's top edge in layout-viewport pixels. It is measured rather than
 * taken as the keyboard's height, so a layout viewport that iOS has already
 * moved to meet the keyboard covers less, or nothing. The bottom edge is
 * where the sheet rests, without its `transform`, so a field focused as the
 * sheet opens, while its entrance still has it partway below the screen,
 * does not count the stretch the sheet has yet to rise as covered.
 */
export function keyboardCover(sheet: HTMLElement, viewport: VisualViewport) {
    return Math.max(
        0,
        sheet.getBoundingClientRect().bottom -
            transformOffsetY(sheet) -
            (viewport.offsetTop + viewport.height)
    );
}
