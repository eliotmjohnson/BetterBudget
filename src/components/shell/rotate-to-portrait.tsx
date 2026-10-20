'use client';

import { Smartphone } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * A touch screen on its side that is too narrow for the landscape phone layout
 * (760 px) and too short for the portrait one, such as the folded iPhone Duo
 * or an iPhone SE, or one no taller than the iPhone 18 Pro on its side (402
 * px), which is too short for the landscape layout too. The same query is in
 * `app-shell.css`, which draws the prompt from the first paint; keep the two
 * identical.
 */
const shortLandscapeQuery =
    '(pointer: coarse) and (min-aspect-ratio: 4/3) and (max-width: 759.98px) and (max-height: 500px), (pointer: coarse) and (min-aspect-ratio: 4/3) and (max-height: 402px)';

function subscribeShortLandscape(onChange: () => void) {
    const media = window.matchMedia(shortLandscapeQuery);

    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
}

function isShortLandscape() {
    return window.matchMedia(shortLandscapeQuery).matches;
}

/**
 * Covers the whole app with a prompt to turn the phone upright on a short
 * landscape screen, where the portrait layout is unusable, and makes
 * everything behind it inert so it cannot be used that way at all. iOS
 * ignores orientation locks for Home Screen web apps, so the app cannot keep
 * itself in portrait.
 */
export function RotateToPortrait() {
    const promptRef = useRef<HTMLDivElement>(null);
    const shown = useSyncExternalStore(
        subscribeShortLandscape,
        isShortLandscape,
        () => false
    );

    useEffect(() => {
        const prompt = promptRef.current;

        if (!shown || !prompt) return;
        const covered = [...document.body.children].filter(
            (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                element !== prompt &&
                !element.inert
        );

        covered.forEach((element) => (element.inert = true));

        return () => covered.forEach((element) => (element.inert = false));
    }, [shown]);

    return (
        <div
            ref={promptRef}
            className='rotate-to-portrait'
            role='dialog'
            aria-modal='true'
            aria-labelledby='rotate-to-portrait-title'
            aria-hidden={!shown}
        >
            <span className='rotate-to-portrait-icon' aria-hidden='true'>
                <Smartphone size={34} strokeWidth={1.8} />
            </span>
            <h1 id='rotate-to-portrait-title'>Turn your phone upright</h1>
            <p>
                Better Budget doesn’t fit this screen sideways. Rotate to
                portrait to keep budgeting.
            </p>
        </div>
    );
}
