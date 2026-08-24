'use client';

import {
    ChartColumn,
    Check,
    ChevronRight,
    CircleDollarSign,
    Clock3,
    FlaskConical,
    KeyRound,
    ListTree,
    LogOut,
    MonitorSmartphone,
    ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/ui/sheet';
import {
    APP_BUILD_LABEL,
    APP_DESCRIPTION,
    APP_NAME,
    APP_VERSION
} from '@/domain/app-info';
import type { BudgetAmountView } from '@/domain/budget-preferences';
import { APP_TIME_ZONE } from '@/domain/calendar';
import { APP_CURRENCY, type MonthKey } from '@/domain/money';
import { authClient } from '@/lib/auth-client';

export function SettingsView({
    defaultBudgetAmountView,
    monthKey,
    onDefaultBudgetAmountViewChange,
    onOrganize,
    onMessage
}: {
    defaultBudgetAmountView: BudgetAmountView;
    monthKey: MonthKey;
    onDefaultBudgetAmountViewChange: (view: BudgetAmountView) => void;
    onOrganize: (
        trigger: HTMLAnchorElement,
        restoreFocusVisible: boolean
    ) => void;
    onMessage: (message: string) => void;
}) {
    const router = useRouter();
    const currencyTriggerRef = useRef<HTMLButtonElement>(null);
    const amountViewTriggerRef = useRef<HTMLButtonElement>(null);
    const organizerRestoreFocusVisibleRef = useRef(true);
    const organizerPointerActivationRef = useRef(false);
    const [currencyRestoreFocusVisible, setCurrencyRestoreFocusVisible] =
        useState(true);
    const [amountViewRestoreFocusVisible, setAmountViewRestoreFocusVisible] =
        useState(true);
    const [currencyOpen, setCurrencyOpen] = useState(false);
    const [amountViewOpen, setAmountViewOpen] = useState(false);
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
                <button
                    ref={currencyTriggerRef}
                    className='settings-row'
                    type='button'
                    onClick={(event) => {
                        setCurrencyRestoreFocusVisible(event.detail === 0);
                        setCurrencyOpen(true);
                    }}
                >
                    <MonitorSmartphone size={20} />
                    <span>
                        <strong>Currency and region</strong>
                        <small>
                            {APP_CURRENCY} · {APP_TIME_ZONE}
                        </small>
                    </span>
                    <ChevronRight size={18} />
                </button>
                <button
                    ref={amountViewTriggerRef}
                    className='settings-row'
                    type='button'
                    onClick={(event) => {
                        setAmountViewRestoreFocusVisible(event.detail === 0);
                        setAmountViewOpen(true);
                    }}
                >
                    <ChartColumn size={20} />
                    <span>
                        <strong>Default amount view</strong>
                        <small>
                            {defaultBudgetAmountView === 'available'
                                ? 'Available'
                                : 'Planned'}
                        </small>
                    </span>
                    <ChevronRight size={18} />
                </button>
                <Link
                    className='settings-row'
                    href={`/organize?month=${monthKey}`}
                    aria-haspopup='dialog'
                    onFocus={(event) => {
                        if (event.currentTarget.matches(':focus-visible'))
                            organizerRestoreFocusVisibleRef.current = true;
                    }}
                    onMouseDown={() => {
                        organizerPointerActivationRef.current = true;
                        organizerRestoreFocusVisibleRef.current = false;
                    }}
                    onPointerDown={() => {
                        organizerPointerActivationRef.current = true;
                        organizerRestoreFocusVisibleRef.current = false;
                    }}
                    onTouchStart={() => {
                        organizerPointerActivationRef.current = true;
                        organizerRestoreFocusVisibleRef.current = false;
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        organizerPointerActivationRef.current = false;
                        organizerRestoreFocusVisibleRef.current = true;
                    }}
                    onClick={(event) => {
                        if (
                            event.defaultPrevented ||
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                        )
                            return;
                        event.preventDefault();
                        onOrganize(
                            event.currentTarget,
                            !organizerPointerActivationRef.current &&
                                event.detail === 0 &&
                                organizerRestoreFocusVisibleRef.current
                        );
                        organizerPointerActivationRef.current = false;
                        organizerRestoreFocusVisibleRef.current = true;
                    }}
                >
                    <ListTree size={20} />
                    <span>
                        <strong>Organize budget</strong>
                        <small>
                            Rename, reorder, and delete categories and items
                        </small>
                    </span>
                    <ChevronRight size={18} />
                </Link>
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
                open={currencyOpen}
                onOpenChange={setCurrencyOpen}
                restoreFocusRef={currencyTriggerRef}
                restoreFocusVisible={currencyRestoreFocusVisible}
                title='Currency and region'
            >
                <div className='form-grid'>
                    <div className='settings-list'>
                        <div className='settings-row static-row'>
                            <CircleDollarSign size={20} />
                            <span>
                                <strong>Currency</strong>
                                <small>US dollar ({APP_CURRENCY})</small>
                            </span>
                            <span />
                        </div>
                        <div className='settings-row static-row'>
                            <Clock3 size={20} />
                            <span>
                                <strong>Time zone</strong>
                                <small>{APP_TIME_ZONE}</small>
                            </span>
                            <span />
                        </div>
                    </div>
                    <p className='confirmation-copy'>
                        Better Budget currently uses one fixed currency and time
                        zone. Existing amounts are never converted.
                    </p>
                </div>
            </Sheet>
            <Sheet
                open={amountViewOpen}
                onOpenChange={setAmountViewOpen}
                restoreFocusRef={amountViewTriggerRef}
                restoreFocusVisible={amountViewRestoreFocusVisible}
                title='Default amount view'
                variant='raised-mobile'
            >
                <div
                    className='settings-list'
                    role='group'
                    aria-label='Default amount view'
                >
                    <button
                        className='settings-row'
                        type='button'
                        aria-pressed={defaultBudgetAmountView === 'available'}
                        onClick={() => {
                            onDefaultBudgetAmountViewChange('available');
                            setAmountViewOpen(false);
                        }}
                    >
                        <CircleDollarSign size={20} />
                        <span>
                            <strong>Available</strong>
                            <small>Show what remains after spending</small>
                        </span>
                        <span
                            className='settings-selection-indicator'
                            aria-hidden='true'
                        >
                            {defaultBudgetAmountView === 'available' ? (
                                <Check size={19} strokeWidth={2.4} />
                            ) : null}
                        </span>
                    </button>
                    <button
                        className='settings-row'
                        type='button'
                        aria-pressed={defaultBudgetAmountView === 'planned'}
                        onClick={() => {
                            onDefaultBudgetAmountViewChange('planned');
                            setAmountViewOpen(false);
                        }}
                    >
                        <ChartColumn size={20} />
                        <span>
                            <strong>Planned</strong>
                            <small>Show the amount assigned to each item</small>
                        </span>
                        <span
                            className='settings-selection-indicator'
                            aria-hidden='true'
                        >
                            {defaultBudgetAmountView === 'planned' ? (
                                <Check size={19} strokeWidth={2.4} />
                            ) : null}
                        </span>
                    </button>
                </div>
            </Sheet>
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
