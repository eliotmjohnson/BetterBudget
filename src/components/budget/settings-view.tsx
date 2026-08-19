'use client';

import {
    ChevronRight,
    FlaskConical,
    KeyRound,
    LogOut,
    MonitorSmartphone,
    ShieldCheck
} from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/ui/sheet';
import {
    APP_BUILD_LABEL,
    APP_DESCRIPTION,
    APP_NAME,
    APP_VERSION
} from '@/domain/app-info';
import { authClient } from '@/lib/auth-client';

export function SettingsView({
    onMessage
}: {
    onMessage: (message: string) => void;
}) {
    const router = useRouter();
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [scenario, setScenario] = useState(() =>
        typeof window === 'undefined'
            ? 'none'
            : (window.localStorage.getItem('better-budget-scenario') ?? 'none')
    );
    const changePassword = async () => {
        const result = await authClient.changePassword({
            currentPassword,
            newPassword,
            revokeOtherSessions: true
        });

        if (result.error) {
            onMessage(result.error.message ?? 'Password could not be changed.');

            return;
        }
        setPasswordOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        onMessage('Password changed. Other sessions were signed out.');
    };

    return (
        <section className='screen standard-screen'>
            <div>
                <p className='eyebrow'>Our Household</p>
                <h1 className='screen-heading'>Settings</h1>
            </div>
            <h2 className='settings-section-title'>Budget</h2>
            <div className='settings-list'>
                <div className='settings-row static-row'>
                    <MonitorSmartphone size={20} />
                    <span>
                        <strong>Currency and region</strong>
                        <small>USD · America/Chicago</small>
                    </span>
                    <span />
                </div>
            </div>
            <h2 className='settings-section-title'>Security</h2>
            <div className='settings-list'>
                <button
                    className='settings-row'
                    type='button'
                    onClick={() => setPasswordOpen(true)}
                >
                    <KeyRound size={20} />
                    <span>
                        <strong>Change password</strong>
                        <small>Revoke other sessions after changing</small>
                    </span>
                    <ChevronRight size={18} />
                </button>
                <button
                    className='settings-row'
                    type='button'
                    onClick={async () => {
                        await authClient.revokeOtherSessions();
                        onMessage('Other sessions have been signed out.');
                    }}
                >
                    <ShieldCheck size={20} />
                    <span>
                        <strong>Sign out other devices</strong>
                        <small>Keep this session active</small>
                    </span>
                    <ChevronRight size={18} />
                </button>
                <button
                    className='settings-row danger-text'
                    type='button'
                    onClick={async () => {
                        await authClient.signOut();
                        router.push('/sign-in');
                        router.refresh();
                    }}
                >
                    <LogOut size={20} />
                    <span>
                        <strong>Sign out</strong>
                        <small>Return to the shared household sign-in</small>
                    </span>
                    <ChevronRight size={18} />
                </button>
            </div>
            {process.env.NODE_ENV !== 'production' ? (
                <>
                    <h2 className='settings-section-title'>Development</h2>
                    <div className='scenario-panel'>
                        <FlaskConical size={21} />
                        <div>
                            <strong>Persistence scenarios</strong>
                            <p>
                                Exercise slow saves, safe retries, conflicts,
                                validation, and offline drafts.
                            </p>
                        </div>
                        <select
                            aria-label='Persistence scenario'
                            value={scenario}
                            onChange={(event) => {
                                const value = event.target.value;

                                setScenario(value);
                                if (value === 'none')
                                    window.localStorage.removeItem(
                                        'better-budget-scenario'
                                    );
                                else
                                    window.localStorage.setItem(
                                        'better-budget-scenario',
                                        value
                                    );
                            }}
                        >
                            <option value='none'>Normal</option>
                            <option value='latency'>1.8s latency</option>
                            <option value='timeout'>Ambiguous timeout</option>
                            <option value='transient'>Transient failure</option>
                            <option value='conflict'>Version conflict</option>
                            <option value='validation'>
                                Validation failure
                            </option>
                            <option value='offline'>Offline write</option>
                        </select>
                    </div>
                </>
            ) : null}
            <footer
                className='app-version'
                aria-label='Application information'
            >
                <strong>
                    {APP_NAME} v{APP_VERSION}
                </strong>
                <span>{APP_DESCRIPTION}</span>
                <small>{APP_BUILD_LABEL}</small>
            </footer>
            <Sheet
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
                title='Change password'
            >
                <div className='form-grid'>
                    <div className='field'>
                        <label htmlFor='current-password'>
                            Current password
                        </label>
                        <input
                            id='current-password'
                            type='password'
                            value={currentPassword}
                            onChange={(event) =>
                                setCurrentPassword(event.target.value)
                            }
                        />
                    </div>
                    <div className='field'>
                        <label htmlFor='new-password'>New password</label>
                        <input
                            id='new-password'
                            type='password'
                            minLength={10}
                            value={newPassword}
                            onChange={(event) =>
                                setNewPassword(event.target.value)
                            }
                        />
                    </div>
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={!currentPassword || newPassword.length < 10}
                        onClick={changePassword}
                    >
                        Change password
                    </button>
                </div>
            </Sheet>
        </section>
    );
}
