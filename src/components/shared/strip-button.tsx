'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSideBar } from '@/components/ui/side-bar';

/**
 * A glass button in the folded iPhone Duo's side strip, above the floating
 * plus. It pops in while `visible` and renders nothing without the side bar.
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
            {children}
        </button>,
        document.querySelector('.app-frame') ?? document.body
    );
}
