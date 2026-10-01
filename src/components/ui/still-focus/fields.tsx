'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { useStillField } from './use-still-field';

type StillFieldProps<Tag extends 'input' | 'textarea'> =
    ComponentPropsWithoutRef<Tag> & { conceal?: boolean };

/**
 * An `<input>` that takes focus without iOS sliding the page
 * (`useStillField`). `autoFocus` focuses it still as it mounts, and `conceal`
 * false never hides it behind a stand-in.
 */
export function StillInput({
    autoFocus,
    conceal,
    onFocus,
    onTouchStart,
    onTouchEnd,
    ...props
}: StillFieldProps<'input'>) {
    const still = useStillField<HTMLInputElement>({
        autoFocus,
        conceal,
        onFocus,
        onTouchStart,
        onTouchEnd
    });

    return <input {...props} {...still} />;
}

/**
 * The `<textarea>` counterpart of `StillInput`. `reveal` false never scrolls
 * its container to clear the keyboard, for a field that stays in view by
 * itself, such as the Better Buddy composer stuck to the bottom of its body.
 */
export function StillTextarea({
    autoFocus,
    conceal,
    reveal,
    onFocus,
    onTouchStart,
    onTouchEnd,
    ...props
}: StillFieldProps<'textarea'> & { reveal?: boolean }) {
    const still = useStillField<HTMLTextAreaElement>({
        autoFocus,
        conceal,
        reveal,
        onFocus,
        onTouchStart,
        onTouchEnd
    });

    return <textarea {...props} {...still} />;
}
