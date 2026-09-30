import type { StillField } from './field';

const HEIGHT_TOLERANCE_PX = 0.5;
const FOCUSED_LOOK = [
    'background-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'box-shadow',
    'color',
    'outline-color',
    'outline-style',
    'outline-width'
] as const;
let held: { field: StillField; standIn: StillField } | null = null;

export function isHeld(field: StillField) {
    return held?.field === field;
}

/** What is on screen in `field`'s place: its stand-in while held, else itself. */
export function shownField(field: StillField): HTMLElement {
    return held?.field === field ? held.standIn : field;
}

/**
 * Where `field`'s border box sits inside its offset parent, which is also the
 * stand-in's containing block, to the fraction of a pixel. The `offset*`
 * properties round to whole pixels, so a field at a fractional position, such
 * as the centered Income expected amount under its label, got a stand-in up
 * to half a pixel off, which showed as the value nudging down and back up as
 * the stand-in came and went.
 */
function exactBox(field: StillField) {
    const box = field.getBoundingClientRect();
    const parent = field.offsetParent;

    if (!(parent instanceof HTMLElement))
        return {
            left: field.offsetLeft,
            top: field.offsetTop,
            width: field.offsetWidth,
            height: field.offsetHeight
        };
    const origin = parent.getBoundingClientRect();

    return {
        left: box.left - origin.left - parent.clientLeft + parent.scrollLeft,
        top: box.top - origin.top - parent.clientTop + parent.scrollTop,
        width: box.width,
        height: box.height
    };
}

/**
 * An inert copy of `field`, laid over its spot, that shows its value while the
 * field itself is hidden. It is the first child of the field's parent, so
 * positioned siblings drawn over the field, such as a search icon, are drawn
 * over it too. It takes its height from its stylesheet, as the field does,
 * and only gets the field's height inline when that differs: a fixed-height
 * stand-in drew the Income expected amount, which is sized by `min-height`,
 * two device pixels lower than the field.
 */
function createStandIn(field: StillField) {
    const standIn = field.cloneNode() as StillField;
    const { left, top, width, height } = exactBox(field);

    standIn.value = field.value;
    standIn.removeAttribute('id');
    standIn.removeAttribute('name');
    standIn.tabIndex = -1;
    standIn.readOnly = true;
    standIn.inert = true;
    standIn.setAttribute('aria-hidden', 'true');
    Object.assign(standIn.style, {
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        margin: '0',
        pointerEvents: 'none'
    });
    field.parentElement?.prepend(standIn);
    if (
        Math.abs(standIn.getBoundingClientRect().height - height) >
        HEIGHT_TOLERANCE_PX
    )
        standIn.style.height = `${height}px`;

    return standIn;
}

/**
 * Moves `standIn` to the focused field's border, background, shadow, and
 * outline through the stand-in's own stylesheet transitions, so it fades into
 * focus exactly as the field would. The target is read with the field's
 * transitions switched off, so it is the finished focus style rather than the
 * start of the field's fade, and the stand-in's current look is resolved
 * first, so a stand-in inserted in this same task has a starting style to
 * fade from. Without it the stand-in shows the unfocused look until release,
 * and the field then fades into focus late.
 */
function wearFocusedLook(field: StillField, standIn: StillField) {
    field.style.transition = 'none';
    const look = getComputedStyle(field);
    const targets = FOCUSED_LOOK.map(
        (property) => [property, look.getPropertyValue(property)] as const
    );

    field.style.removeProperty('transition');
    void getComputedStyle(standIn).borderTopColor;
    for (const [property, value] of targets)
        standIn.style.setProperty(property, value);
}

/**
 * Hides `field` behind a stand-in, either parked `parkOffset` pixels above the
 * page or made transparent in place, until the returned release runs or the
 * field blurs. The stand-in takes the focused look as soon as the field has
 * focus. Release puts the caret back at the end, so iOS redraws it.
 */
export function holdBehindStandIn(
    field: StillField,
    hide: { park: number } | 'veil'
) {
    const standIn = createStandIn(field);
    const matchFocus = () => wearFocusedLook(field, standIn);
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        field.removeEventListener('focus', matchFocus);
        field.removeEventListener('blur', release);
        field.style.removeProperty('translate');
        field.style.removeProperty('opacity');
        standIn.remove();
        if (held?.field === field) held = null;
        if (document.activeElement !== field) return;
        const end = field.value.length;

        field.setSelectionRange(end, end);
    };

    if (hide === 'veil') field.style.opacity = '0';
    else field.style.translate = `0 -${hide.park}px`;
    held = { field, standIn };
    if (document.activeElement === field) matchFocus();
    else field.addEventListener('focus', matchFocus, { once: true });
    field.addEventListener('blur', release);

    return release;
}
