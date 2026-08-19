import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth/sign-in-form';
import { getAccess } from '@/server/access';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
    const access = await getAccess();

    if (access) redirect('/');

    return <SignInForm />;
}
