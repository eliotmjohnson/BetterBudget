const KEYBOARD_MIN_PX = 100;

/**
 * How much shorter the visual viewport is than the layout viewport, which is
 * the on-screen keyboard's height while one is up.
 */
function keyboardHeight(viewport: VisualViewport) {
    return document.documentElement.clientHeight - viewport.height;
}

/**
 * Whether an on-screen keyboard is up: the visual viewport is at least
 * `KEYBOARD_MIN_PX` shorter than the layout viewport, more than any browser
 * toolbar change.
 */
export function isKeyboardUp(viewport: VisualViewport) {
    return keyboardHeight(viewport) >= KEYBOARD_MIN_PX;
}
