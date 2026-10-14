'use client';

import { Bell, Send } from 'lucide-react';
import { useState } from 'react';
import {
    usePushNotifications,
    type PushState
} from '@/components/shared/use-push-notifications';
import { AppSwitch } from '@/components/ui/app-switch';

const STATE_DETAIL: Record<PushState, string> = {
    loading: 'Get bill alerts on this device',
    unsupported: 'This browser can’t show notifications',
    install: 'Add Better Budget to your Home Screen to turn these on',
    denied: 'Blocked. Allow notifications for Better Budget in Settings',
    off: 'Get bill alerts on this device',
    on: 'On for this device'
};

export function SettingsNotificationsSection({
    onMessage
}: {
    onMessage: (message: string) => void;
}) {
    const { state, enable, disable, sendTest } = usePushNotifications();
    const [busy, setBusy] = useState(false);
    const switchable = state === 'off' || state === 'on';
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try {
            await action();
        } catch {
            onMessage('Notifications could not be changed. Try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <h2 className='settings-section-title'>Notifications</h2>
            <div className='settings-list'>
                <div className='settings-row static-row'>
                    <Bell size={20} />
                    <span>
                        <strong>Bill reminders</strong>
                        <small>{STATE_DETAIL[state]}</small>
                    </span>
                    {switchable ? (
                        <AppSwitch
                            accessibilityLabel='Bill reminders on this device'
                            checked={state === 'on'}
                            onCheckedChange={(checked) =>
                                void run(async () => {
                                    if (!checked) return disable();
                                    if (!(await enable()))
                                        onMessage(
                                            'Notifications were not allowed.'
                                        );
                                })
                            }
                            variant='setting'
                        />
                    ) : null}
                </div>
                {state === 'on' ? (
                    <button
                        className='settings-row'
                        type='button'
                        disabled={busy}
                        aria-busy={busy}
                        onClick={() =>
                            void run(async () =>
                                onMessage(
                                    (await sendTest())
                                        ? 'Test notification sent.'
                                        : 'The test notification did not send.'
                                )
                            )
                        }
                    >
                        <Send size={20} />
                        <span>
                            <strong>Send test notification</strong>
                            <small>Check that alerts reach this device</small>
                        </span>
                    </button>
                ) : null}
            </div>
        </>
    );
}
