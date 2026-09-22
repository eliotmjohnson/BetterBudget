'use client';

import Image from 'next/image';
import betterBuddy from '@/components/assistant/better-buddy.png';
import { AppSwitch } from '@/components/ui/app-switch';

export function SettingsAssistantSection({
    available,
    enabled,
    onEnabledChange
}: {
    available: boolean;
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
}) {
    return (
        <>
            <h2 className='settings-section-title'>Assistant</h2>
            <div className='settings-list'>
                <div className='settings-row static-row'>
                    <Image
                        className='settings-buddy-icon'
                        src={betterBuddy}
                        alt=''
                        width={30}
                        height={30}
                        unoptimized
                    />
                    <span>
                        <strong>Better Buddy</strong>
                        <small>
                            {available
                                ? 'Show the floating budget assistant'
                                : 'Not set up: add an Anthropic API key'}
                        </small>
                    </span>
                    {available ? (
                        <AppSwitch
                            accessibilityLabel='Show Better Buddy'
                            checked={enabled}
                            onCheckedChange={onEnabledChange}
                            variant='setting'
                        />
                    ) : null}
                </div>
            </div>
        </>
    );
}
