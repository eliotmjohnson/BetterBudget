const SHIELD = 'data-keyboard-shield';
const SHIELD_CURVE = 'cubic-bezier(0.2, 1, 0.45, 1)';
const SHIELD_MOTIONS = {
    raise: `height 360ms ${SHIELD_CURVE} -24ms`,
    lower: 'height 230ms cubic-bezier(0.2, 0.05, 0.3, 1) -8ms',
    adjust: `height 100ms ${SHIELD_CURVE}`
};

function shieldOf(sheet: HTMLElement) {
    return sheet.querySelector<HTMLElement>(`:scope > [${SHIELD}]`);
}

/**
 * Moves the white strip at the bottom of `sheet` to `cover`, the height the
 * keyboard covers, on the keyboard's own motion. The iOS keyboard is
 * translucent, and the sheet's inset cannot always keep content out from
 * under it: a sheet that grows eases its inset slower than the keyboard, and
 * one that reaches its `max-height` partway takes the rest from its body only
 * afterwards, so Edit category's Save button and colors showed through the
 * keyboard. The strip covers whatever is there. Rising, it starts 24 ms into
 * its curve, which keeps its top at most about 22 pt ahead of the keyboard's
 * edge and never behind it. Lowering, the body behind it is already back at
 * full length, so it starts 8 ms into its curve: never ahead of the keyboard,
 * which would bare that content, and at most about 15 pt behind it, where a
 * frame late left a white band of up to about 100 pt.
 */
export function moveShield(
    sheet: HTMLElement,
    cover: number,
    kind: keyof typeof SHIELD_MOTIONS
) {
    const shield = shieldOf(sheet);

    if (!shield) return;
    shield.style.transition = SHIELD_MOTIONS[kind];
    shield.style.height = `${cover}px`;
}

export function clearShield(sheet: HTMLElement) {
    const shield = shieldOf(sheet);

    shield?.style.removeProperty('transition');
    shield?.style.removeProperty('height');
}
