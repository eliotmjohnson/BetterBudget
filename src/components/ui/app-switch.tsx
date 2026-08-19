'use client';

import * as Switch from '@radix-ui/react-switch';

export function AppSwitch({
    accessibilityLabel,
    checked,
    onCheckedChange,
    variant
}: {
    accessibilityLabel: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    variant: 'budget-view' | 'carryover';
}) {
    return (
        <Switch.Root
            className={`app-switch app-switch--${variant}`}
            aria-label={accessibilityLabel}
            checked={checked}
            onCheckedChange={onCheckedChange}
        >
            <Switch.Thumb className='app-switch-thumb' />
        </Switch.Root>
    );
}
