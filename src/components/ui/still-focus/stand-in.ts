import type { StillField } from './field';

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
 * An inert copy of `field`, laid over its spot, that shows its value while the
 * field itself is hidden. It is the first child of the field's parent, so
 * positioned siblings drawn over the field, such as a search icon, are drawn
 * over it too, and it does not transition, so it takes the focused look at
 * once.
 */
function createStandIn(field: StillField) {
    const standIn = field.cloneNode() as StillField;

    standIn.value = field.value;
    standIn.removeAttribute('id');
    standIn.removeAttribute('name');
    standIn.tabIndex = -1;
    standIn.readOnly = true;
    standIn.inert = true;
    standIn.setAttribute('aria-hidden', 'true');
    Object.assign(standIn.style, {
        position: 'absolute',
        left: `${field.offsetLeft}px`,
        top: `${field.offsetTop}px`,
        width: `${field.offsetWidth}px`,
        height: `${field.offsetHeight}px`,
        margin: '0',
        pointerEvents: 'none',
        transition: 'none'
    });
    field.parentElement?.prepend(standIn);

    return standIn;
}

/**
 * Gives `standIn` the focused field's border, background, shadow, and outline,
 * read with the field's own transitions switched off so the result is the
 * finished focus style rather than the start of its fade. Without it the
 * stand-in shows the unfocused look until release, and the field then fades
 * into focus late.
 */
function wearFocusedLook(field: StillField, standIn: StillField) {
    field.style.transition = 'none';
    const look = getComputedStyle(field);

    for (const property of FOCUSED_LOOK)
        standIn.style.setProperty(property, look.getPropertyValue(property));
    field.style.removeProperty('transition');
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
