import { continuousGeometry, type CornerRadii } from './geometry';

export type ContinuousShape = {
    outline: string;
    width: number;
    height: number;
};

const stateAttributes = [
    'class',
    'disabled',
    'aria-pressed',
    'aria-selected',
    'aria-current',
    'data-state',
    'data-filtered'
];

function radiusPixels(value: string, width: number) {
    const [first = '0'] = value.split(' ');
    const amount = Number.parseFloat(first) || 0;

    return first.endsWith('%') ? (amount / 100) * width : amount;
}

function visibleBorder(style: CSSStyleDeclaration) {
    const width = Number.parseFloat(style.borderTopWidth) || 0;
    const color = style.borderTopColor;
    const invisible =
        style.borderTopStyle === 'none' ||
        color === 'transparent' ||
        /rgba\(.*,\s*0\)$/.test(color);

    return width > 0 && !invisible ? { width, color } : null;
}

function borderImage(
    { outline, width, height }: ContinuousShape,
    border: { width: number; color: string }
) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><clipPath id="c"><path d="${outline}"/></clipPath><path d="${outline}" fill="none" stroke="${border.color}" stroke-width="${border.width * 2}" clip-path="url(#c)"/></svg>`;

    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* Gives an element continuous corners on every browser, derived from its own
   CSS border-radius: the --corner-superellipse curve that corner-shape draws
   natively, scaled by --corner-extent, or a --capsule-smoothing end when the
   radius fills a side. The element paints a tighter circular radius that
   contains the curve, and the clip trims only the slivers between them, so
   shadows, focus rings, and contents stay as CSS paints them.

   A CSS border cannot bend to the curve, so it is also stroked along the curve
   as a background layer, which survives overflow clipping. The CSS border
   stays: its parts outside the curve fall in the clipped slivers and the rest
   lies under the stroke, so an opaque border color shows no seam, and the
   live color can be re-read whenever a state attribute, hover, or border
   transition changes it.

   Sizes come from the observer's border-box size, which is fractional and
   ignores transforms: offsetWidth rounds, and half a pixel shows at the tab
   bar's narrow gaps. */
export function attachContinuousCorners(
    element: HTMLElement,
    onShape?: (shape: ContinuousShape) => void
) {
    let size: [number, number] | null = null;
    const paint = () => {
        if (!size) return;
        const [width, height] = size;

        if (!width || !height) return;
        element.style.removeProperty('border-radius');
        const style = getComputedStyle(element);
        const radii = [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius
        ].map((value) => radiusPixels(value, width)) as CornerRadii;
        const { outline, clip, paintedRadii } = continuousGeometry(
            width,
            height,
            radii,
            {
                superellipse:
                    Number(style.getPropertyValue('--corner-superellipse')) ||
                    1,
                extent: Number(style.getPropertyValue('--corner-extent')) || 1,
                capsuleSmoothing:
                    Number(style.getPropertyValue('--capsule-smoothing')) || 0
            }
        );
        const shape = { outline, width, height };
        const border = visibleBorder(style);

        element.style.setProperty(
            'border-radius',
            paintedRadii.map((radius) => `${radius.toFixed(2)}px`).join(' ')
        );
        element.style.setProperty('clip-path', `path(evenodd, '${clip}')`);
        if (border) {
            element.style.setProperty(
                '--continuous-border-image',
                borderImage(shape, border)
            );
            element.setAttribute('data-continuous-border', '');
        } else {
            element.style.removeProperty('--continuous-border-image');
            element.removeAttribute('data-continuous-border');
        }
        onShape?.(shape);
    };
    const resizes = new ResizeObserver(([entry]) => {
        const [box] = entry?.borderBoxSize ?? [];

        if (!box) return;
        size = [box.inlineSize, box.blockSize];
        paint();
    });
    const states = new MutationObserver(paint);
    const repaintBorder = (event: TransitionEvent) => {
        if (event.target === element && event.propertyName.startsWith('border'))
            paint();
    };

    element.setAttribute('data-continuous-corners', '');
    resizes.observe(element);
    states.observe(element, { attributeFilter: stateAttributes });
    element.addEventListener('pointerenter', paint);
    element.addEventListener('pointerleave', paint);
    element.addEventListener('transitionend', repaintBorder);

    return () => {
        resizes.disconnect();
        states.disconnect();
        element.removeEventListener('pointerenter', paint);
        element.removeEventListener('pointerleave', paint);
        element.removeEventListener('transitionend', repaintBorder);
        element.removeAttribute('data-continuous-corners');
        element.removeAttribute('data-continuous-border');
        element.style.removeProperty('clip-path');
        element.style.removeProperty('border-radius');
        element.style.removeProperty('--continuous-border-image');
    };
}
