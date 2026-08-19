'use client';

import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { authClient } from '@/lib/auth-client';

export function SignInForm() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const result = await authClient.signIn.email({
            email,
            password,
            callbackURL: '/'
        });

        setPending(false);
        if (result.error) {
            setError(result.error.message ?? 'Check your email and password.');

            return;
        }
        router.push('/');
        router.refresh();
    };

    return (
        <main className='sign-in-screen'>
            <section className='sign-in-card'>
                <div className='sign-in-brand'>
                    <BrandMark />
                    <p>
                        Your household budget,
                        <br />
                        in one place.
                    </p>
                </div>
                <div className='sign-in-bars' aria-hidden='true'>
                    <span />
                    <span />
                    <span />
                    <i />
                </div>
                <form className='sign-in-form' onSubmit={submit}>
                    <div className='auth-field'>
                        <Mail size={19} />
                        <input
                            aria-label='Email'
                            type='email'
                            autoComplete='email'
                            placeholder='Email'
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </div>
                    <div className='auth-field'>
                        <LockKeyhole size={19} />
                        <input
                            aria-label='Password'
                            type={showPassword ? 'text' : 'password'}
                            autoComplete='current-password'
                            placeholder='Password'
                            required
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                        />
                        <button
                            type='button'
                            aria-label={
                                showPassword ? 'Hide password' : 'Show password'
                            }
                            onClick={() => setShowPassword((value) => !value)}
                        >
                            {showPassword ? (
                                <EyeOff size={18} />
                            ) : (
                                <Eye size={18} />
                            )}
                        </button>
                    </div>
                    {error ? (
                        <p className='form-error' role='alert'>
                            {error}
                        </p>
                    ) : null}
                    <button
                        className='primary-button primary-button--wide sign-in-button'
                        disabled={pending}
                        type='submit'
                    >
                        {pending ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
                <p className='sign-in-note'>
                    One shared household account for now.
                </p>
            </section>
        </main>
    );
}
