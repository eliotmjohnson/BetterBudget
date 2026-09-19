export type CornerRadii = [number, number, number, number];

type Point = [number, number];
type Curve = { points: Point[]; reachX: number; reachY: number };
type Corner = {
    points: Point[];
    reachX: number;
    reachY: number;
    radius: number;
};

const integrationSteps = 240;
const pointsPerCorner = 24;
const curveCache = new Map<string, Curve>();

function cornerCurve(turnX: number, turnY: number): Curve {
    const key = `${turnX.toFixed(4)}:${turnY.toFixed(4)}`;
    const cached = curveCache.get(key);

    if (cached) return cached;
    const rampX = 2 * turnX;
    const rampY = 2 * turnY;
    const arc = Math.PI / 2 - turnX - turnY;
    const step = (rampX + arc + rampY) / integrationSteps;
    const heading = (distance: number) => {
        if (distance < rampX) return (distance * distance) / (2 * rampX);
        if (distance < rampX + arc) return turnX + distance - rampX;
        const tail = distance - rampX - arc;

        return turnX + arc + tail - (tail * tail) / (2 * rampY);
    };
    const travelled: Point[] = [[0, 0]];
    let x = 0;
    let y = 0;

    for (let index = 1; index <= integrationSteps; index++) {
        const turn = heading((index - 0.5) * step);

        x += Math.cos(turn) * step;
        y += Math.sin(turn) * step;
        if (index % (integrationSteps / pointsPerCorner) === 0)
            travelled.push([x, y]);
    }
    const curve = {
        points: travelled.map(([px, py]): Point => [x - px, py]),
        reachX: x,
        reachY: y
    };

    curveCache.set(key, curve);

    return curve;
}

function scaled(curve: Curve, kx: number, ky: number, radius: number) {
    return {
        points: curve.points.map(([px, py]): Point => [px * kx, py * ky]),
        reachX: curve.reachX * kx,
        reachY: curve.reachY * ky,
        radius
    };
}

function superellipseCurve(k: number): Curve {
    const key = `superellipse:${k}`;
    const cached = curveCache.get(key);

    if (cached) return cached;
    const exponent = 2 / 2 ** k;
    const points = Array.from(
        { length: pointsPerCorner * 2 + 1 },
        (_, step) => {
            const angle = (Math.PI / 2) * (1 - step / (pointsPerCorner * 2));

            return [
                1 - Math.cos(angle) ** exponent,
                1 - Math.sin(angle) ** exponent
            ] as Point;
        }
    );
    const curve = { points, reachX: 1, reachY: 1 };

    curveCache.set(key, curve);

    return curve;
}

const enclosingCache = new Map<number, number>();

function enclosingRatio(k: number) {
    const cached = enclosingCache.get(k);

    if (cached !== undefined) return cached;
    const { points } = superellipseCurve(k);
    const contains = (ratio: number) =>
        points.every(
            ([x, y]) =>
                x >= ratio ||
                y >= ratio ||
                Math.hypot(x - ratio, y - ratio) <= ratio + 1e-6
        );
    let low = 0;
    let high = 1;

    for (let step = 0; step < 30; step++) {
        const middle = (low + high) / 2;

        if (contains(middle)) low = middle;
        else high = middle;
    }
    enclosingCache.set(k, low);

    return low;
}

export type CornerStyle = {
    superellipse: number;
    extent: number;
    capsuleSmoothing: number;
};

function continuousCorner(
    radius: number,
    budgetX: number,
    budgetY: number,
    style: CornerStyle
): Corner {
    const fillsX = radius >= budgetX - 0.05;
    const fillsY = radius >= budgetY - 0.05;

    if (fillsX && fillsY)
        return scaled(cornerCurve(0, 0), radius, radius, radius);
    if (fillsY || fillsX) {
        const turn = (style.capsuleSmoothing * Math.PI) / 2;
        const curve = fillsY ? cornerCurve(turn, 0) : cornerCurve(0, turn);
        const k = radius / (fillsY ? curve.reachY : curve.reachX);
        const squeeze = Math.min(
            1,
            (fillsY ? budgetX : budgetY) /
                ((fillsY ? curve.reachX : curve.reachY) * k)
        );

        return fillsY
            ? scaled(curve, k * squeeze, k, radius)
            : scaled(curve, k, k * squeeze, radius);
    }

    return scaled(
        superellipseCurve(style.superellipse),
        radius,
        radius,
        radius * enclosingRatio(style.superellipse)
    );
}

function usedRadii(width: number, height: number, radii: CornerRadii) {
    const [tl, tr, br, bl] = radii;
    const factor = Math.min(
        1,
        ...(
            [
                [width, tl + tr],
                [height, tr + br],
                [width, br + bl],
                [height, bl + tl]
            ] as Point[]
        )
            .filter(([, sum]) => sum > 0)
            .map(([side, sum]) => side / sum)
    );

    return radii.map((radius) => radius * factor) as CornerRadii;
}

function corners(
    width: number,
    height: number,
    radii: CornerRadii,
    style: CornerStyle
): [Corner, Corner, Corner, Corner] {
    const [tl, tr, br, bl] = usedRadii(
        width,
        height,
        radii.map((radius) => radius * style.extent) as CornerRadii
    );
    const share = (side: number, neighbour: number) =>
        neighbour > 0 ? side / 2 : side;

    return [
        continuousCorner(tl, share(width, tr), share(height, bl), style),
        continuousCorner(tr, share(width, tl), share(height, br), style),
        continuousCorner(br, share(width, bl), share(height, tr), style),
        continuousCorner(bl, share(width, br), share(height, tl), style)
    ];
}

type Placement = (width: number, height: number, point: Point) => Point;

const placements: [Placement, Placement, Placement, Placement] = [
    (_width: number, _height: number, [x, y]: Point): Point => [x, y],
    (w: number, _height: number, [x, y]: Point): Point => [w - x, y],
    (w: number, h: number, [x, y]: Point): Point => [w - x, h - y],
    (_width: number, h: number, [x, y]: Point): Point => [x, h - y]
];
const format = ([x, y]: Point) => `${x.toFixed(2)} ${y.toFixed(2)}`;

function outlinePath(width: number, height: number, cornerSet: Corner[]) {
    const [tl, tr, br, bl] = cornerSet as [Corner, Corner, Corner, Corner];
    const [placeTl, placeTr, placeBr, placeBl] = placements;
    const trace = (corner: Corner, place: Placement, reverse: boolean) => {
        const points = corner.points.map((point) =>
            place(width, height, point)
        );

        return reverse ? points.reverse() : points;
    };
    const points = [
        ...trace(tr, placeTr, false),
        ...trace(br, placeBr, true),
        ...trace(bl, placeBl, false),
        ...trace(tl, placeTl, true)
    ];

    return `M ${points.map(format).join(' L ')} Z`;
}

function sliverClip(width: number, height: number, cornerSet: Corner[]) {
    const bleed = 120;
    const outer = [
        [-bleed, -bleed],
        [width + bleed, -bleed],
        [width + bleed, height + bleed],
        [-bleed, height + bleed]
    ] as Point[];
    const slivers = cornerSet.flatMap((corner, index) => {
        const { radius, reachX, reachY } = corner;

        if (
            radius < 0.5 ||
            Math.min(reachX, reachY) < radius - 0.05 ||
            Math.max(reachX, reachY) < radius + 0.05
        )
            return [];
        const place = (point: Point) =>
            (placements[index] ?? placements[0])(width, height, point);
        const arc = Array.from({ length: pointsPerCorner + 1 }, (_, step) => {
            const angle = ((step / pointsPerCorner) * Math.PI) / 2;

            return [
                radius - radius * Math.cos(angle),
                radius - radius * Math.sin(angle)
            ] as Point;
        });

        return [
            `M ${[
                ...corner.points,
                [0, radius] as Point,
                ...arc,
                [reachX, 0] as Point
            ]
                .map((point) => format(place(point)))
                .join(' L ')} Z`
        ];
    });

    return [`M ${outer.map(format).join(' L ')} Z`, ...slivers].join(' ');
}

export function continuousGeometry(
    width: number,
    height: number,
    radii: CornerRadii,
    style: CornerStyle
) {
    const cornerSet = corners(width, height, radii, style);

    return {
        outline: outlinePath(width, height, cornerSet),
        clip: sliverClip(width, height, cornerSet),
        paintedRadii: cornerSet.map(({ radius }) => radius) as CornerRadii
    };
}
