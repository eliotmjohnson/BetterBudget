'use client';

import {
    useEffect,
    useId,
    useLayoutEffect,
    useState,
    type ReactNode
} from 'react';
import { attachContinuousCorners, type ContinuousShape } from './attach';

export type { ContinuousShape } from './attach';

export function useContinuousCorners<T extends HTMLElement>() {
    const [element, setElement] = useState<T | null>(null);
    const [shape, setShape] = useState<ContinuousShape | null>(null);

    useLayoutEffect(() => {
        if (!element) return;

        return attachContinuousCorners(element, (next) =>
            setShape((current) =>
                current?.outline === next.outline ? current : next
            )
        );
    }, [element]);

    return [setElement, element ? shape : null] as const;
}

const continuousControls = [
    '.primary-button',
    '.soft-button',
    '.segmented',
    '.segmented-thumb',
    '.filter-tab',
    '.transaction-filter-clear',
    '.bordered-icon',
    '.budget-add-category-bottom',
    '.category-icon-choice',
    '.category-tone-choice',
    '.organizer-permanent-action',
    '.organizer-delete-action',
    '.sheet-header-submit',
    '.month-picker-control',
    '.month-picker-grid button',
    '.toast button'
].join(', ');

export function ContinuousControls() {
    useEffect(() => {
        const detachers = new Map<HTMLElement, () => void>();
        const attachWithin = (root: Element) => {
            const matches = [
                ...(root.matches(continuousControls) ? [root] : []),
                ...root.querySelectorAll(continuousControls)
            ];

            for (const element of matches) {
                if (
                    !(element instanceof HTMLElement) ||
                    detachers.has(element) ||
                    element.hasAttribute('data-continuous-corners')
                )
                    continue;
                detachers.set(element, attachContinuousCorners(element));
            }
        };
        const detachRemoved = () => {
            for (const [element, detach] of detachers) {
                if (element.isConnected) continue;
                detach();
                detachers.delete(element);
            }
        };
        const observer = new MutationObserver((records) => {
            let removed = false;

            for (const record of records) {
                removed ||= record.removedNodes.length > 0;
                for (const node of record.addedNodes)
                    if (node instanceof Element) attachWithin(node);
            }
            if (removed) detachRemoved();
        });

        attachWithin(document.body);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            for (const detach of detachers.values()) detach();
        };
    }, []);

    return null;
}

export function ContinuousStroke({
    shape,
    width,
    gradient
}: {
    shape: ContinuousShape;
    width: number;
    gradient: (id: string) => ReactNode;
}) {
    const id = `stroke${useId().replace(/[^\w-]/g, '')}`;

    return (
        <svg
            className='continuous-stroke'
            width={shape.width}
            height={shape.height}
            aria-hidden='true'
        >
            <defs>
                <clipPath id={`${id}-clip`}>
                    <path d={shape.outline} />
                </clipPath>
                {gradient(`${id}-paint`)}
            </defs>
            <path
                d={shape.outline}
                fill='none'
                stroke={`url(#${id}-paint)`}
                strokeWidth={width * 2}
                clipPath={`url(#${id}-clip)`}
            />
        </svg>
    );
}
