import type { StillField } from './field';

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
 * field itself is hidden.
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
        pointerEvents: 'none'
    });
    field.after(standIn);

    return standIn;
}

/**
 * Hides `field` behind a stand-in, either parked `parkOffset` pixels above the
 * page or made transparent in place, until the returned release runs or the
 * field blurs. Release puts the caret back at the end, so iOS redraws it.
 */
export function holdBehindStandIn(
    field: StillField,
    hide: { park: number } | 'veil'
) {
    const standIn = createStandIn(field);
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
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
    field.addEventListener('blur', release);

    return release;
}
