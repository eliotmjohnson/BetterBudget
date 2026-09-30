const KEYBOARD_MIN_PX = 100;

export function keyboardHeight(viewport: VisualViewport) {
    return document.documentElement.clientHeight - viewport.height;
}

export function isKeyboardUp(viewport: VisualViewport) {
    return keyboardHeight(viewport) >= KEYBOARD_MIN_PX;
}
