'use client';

import { Keyboard } from 'lucide-react';
import { useState } from 'react';
import { AppSwitch } from '@/components/ui/app-switch';
import {
    KEYBOARD_PROBE_EVENT,
    KEYBOARD_PROBE_KEY,
    keyboardProbeEnabled
} from '@/components/ui/keyboard-dip-probe';

/** The development-only switch for the sheet keyboard probe on this device. */
export function SettingsKeyboardProbe() {
    const [enabled, setEnabled] = useState(
        () => typeof window !== 'undefined' && keyboardProbeEnabled()
    );

    return (
        <div className='scenario-panel'>
            <Keyboard size={21} />
            <div>
                <strong>Keyboard probe</strong>
                <p>
                    Logs one second of viewport and sheet geometry when a sheet
                    field is tapped, to the dev server terminal.
                </p>
            </div>
            <AppSwitch
                accessibilityLabel='Keyboard probe'
                checked={enabled}
                onCheckedChange={(checked) => {
                    setEnabled(checked);
                    try {
                        if (checked)
                            window.localStorage.setItem(
                                KEYBOARD_PROBE_KEY,
                                'on'
                            );
                        else window.localStorage.removeItem(KEYBOARD_PROBE_KEY);
                    } catch {}
                    window.dispatchEvent(new Event(KEYBOARD_PROBE_EVENT));
                }}
                variant='setting'
            />
        </div>
    );
}
