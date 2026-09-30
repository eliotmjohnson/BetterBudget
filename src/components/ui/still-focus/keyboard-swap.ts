import { isStillField, type StillField } from './field';
import { isKeyboardUp } from '@/components/ui/on-screen-keyboard';
import { FOCUSED_LOOK, isHeld } from './stand-in';

const SWAP_LIMIT_MS = 400;

function keyboardKind(field: StillField) {
    return field.inputMode || 'text';
}

function readLook(field: StillField) {
    const look = getComputedStyle(field);

    return FOCUSED_LOOK.map(
        (property) => [property, look.getPropertyValue(property)] as const
    );
}

function wearLook(field: StillField, look: ReturnType<typeof readLook>) {
    for (const [property, value] of look)
        field.style.setProperty(property, value);
}

function dropLook(field: StillField) {
    field.style.removeProperty('transition');
    for (const property of FOCUSED_LOOK) field.style.removeProperty(property);
}

/**
 * Call from a field's focus handler. When focus moves, with the keyboard up,
 * from a field on one keyboard to a field on another, such as from a name to
 * a money field's number pad, iOS holds the page's drawing while it swaps the
 * keyboard, and the 0.2 s border fade ran out during that hold: both borders
 * appeared to snap. So both fields keep the look they had before the move,
 * the new field its unfocused one and the old field its focused one, taken
 * from each other since both have just traded them, until the frame after the
 * keyboard reports its new size, or `SWAP_LIMIT_MS`, and only then fade to
 * their own. A veiled field is left to its stand-in.
 */
export function fadeAcrossKeyboardSwap(
    field: StillField,
    previous: EventTarget | null
) {
    const viewport = window.visualViewport;

    if (
        !viewport ||
        !isKeyboardUp(viewport) ||
        !(previous instanceof Element) ||
        !isStillField(previous) ||
        isHeld(field) ||
        keyboardKind(previous) === keyboardKind(field)
    )
        return;
    field.style.transition = 'none';
    previous.style.transition = 'none';
    const unfocused = readLook(previous);

    wearLook(previous, readLook(field));
    wearLook(field, unfocused);
    let frame = 0;
    const release = () => {
        window.clearTimeout(limit);
        cancelAnimationFrame(frame);
        viewport.removeEventListener('resize', schedule);
        dropLook(field);
        dropLook(previous);
    };
    const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(release);
    };
    const limit = window.setTimeout(release, SWAP_LIMIT_MS);

    viewport.addEventListener('resize', schedule);
}
