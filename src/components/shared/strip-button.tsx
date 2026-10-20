'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    continuousMask,
    useContinuousCorners
} from '@/components/ui/continuous-corners';
import { GlassRim } from '@/components/ui/glass-rim';
import { useSideBar } from '@/components/ui/side-bar';

/**
 * The tab bar's glass, layered the same way: a separate shadow, and a surface
 * masked to its measured continuous outline with the rim stroked along it, so
 * a tall strip button's ends are smoothed like the tab bar's.
 */
function CapsuleGlass() {
    const [surfaceRef, surfaceShape] = useContinuousCorners<HTMLSpanElement>({
        outline: true
    });

    return (
        <>
            <span className='bottom-nav-shadow' aria-hidden='true' />
            <span
                ref={surfaceRef}
                className='bottom-nav-surface'
                aria-hidden='true'
                style={surfaceShape ? continuousMask(surfaceShape) : undefined}
            >
                {surfaceShape ? <GlassRim shape={surfaceShape} /> : null}
            </span>
        </>
    );
}

/**
 * A glass button in the folded iPhone Duo's side strip, above the floating
 * plus. It pops in while `visible` and renders nothing without the side bar.
 * The tall shape is a capsule with the tab bar's continuous ends.
 */
export function StripButton({
    visible,
    label,
    pressed,
    shape = 'round',
    onPress,
    children
}: {
    visible: boolean;
    label: string;
    pressed?: boolean;
    shape?: 'round' | 'tall';
    onPress: () => void;
    children: ReactNode;
}) {
    const sideBar = useSideBar();
    const [arrived, setArrived] = useState(false);

    if (sideBar && visible && !arrived) setArrived(true);
    if (!sideBar || !arrived) return null;

    return createPortal(
        <button
            className='side-strip-button'
            type='button'
            aria-label={label}
            aria-pressed={pressed}
            data-shape={shape}
            data-visible={visible ? 'true' : 'false'}
            inert={!visible}
            onClick={onPress}
        >
            {shape === 'tall' ? <CapsuleGlass /> : null}
            {children}
        </button>,
        document.querySelector('.app-frame') ?? document.body
    );
}
