import { ContinuousStroke, type ContinuousShape } from './continuous-corners';

/**
 * The light-catching rim of a glass capsule, stroked along its measured
 * continuous outline: a white gradient brightest at the top-left and
 * bottom-right corners, over a 6 % hairline. The tab bar and the folded iPhone
 * Duo's strip gauge share it.
 */
export function GlassRim({ shape }: { shape: ContinuousShape }) {
    return (
        <>
            <ContinuousStroke
                shape={shape}
                width={1}
                gradient={(id) => (
                    <linearGradient id={id} x1='0' y1='0' x2='1' y2='1'>
                        <stop offset='0' stopColor='#fff' stopOpacity='0.95' />
                        <stop
                            offset='0.38'
                            stopColor='#fff'
                            stopOpacity='0.22'
                        />
                        <stop
                            offset='0.62'
                            stopColor='#fff'
                            stopOpacity='0.08'
                        />
                        <stop offset='1' stopColor='#fff' stopOpacity='0.7' />
                    </linearGradient>
                )}
            />
            <ContinuousStroke
                shape={shape}
                width={0.5}
                gradient={(id) => (
                    <linearGradient id={id}>
                        <stop stopColor='rgb(28 39 58 / 6%)' />
                    </linearGradient>
                )}
            />
        </>
    );
}
