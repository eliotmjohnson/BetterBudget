import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { APP_DESCRIPTION, APP_NAME } from '@/domain/app-info';
import { iosStartupImages } from './ios-startup-images';
import './globals.css';

export const metadata: Metadata = {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: APP_DESCRIPTION,
    applicationName: APP_NAME,
    manifest: '/manifest.webmanifest',
    icons: {
        icon: [
            {
                url: '/better-budget-icon-192-v3.png',
                sizes: '192x192',
                type: 'image/png'
            },
            {
                url: '/better-budget-icon-512-v3.png',
                sizes: '512x512',
                type: 'image/png'
            }
        ],
        apple: [
            {
                url: '/better-budget-apple-touch-icon-v3.png',
                sizes: '180x180',
                type: 'image/png'
            }
        ]
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: APP_NAME,
        startupImage: iosStartupImages
    },
    other: {
        'apple-mobile-web-app-capable': 'yes'
    }
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
    themeColor: '#ffffff',
    colorScheme: 'light'
};

export default function RootLayout({
    children
}: Readonly<{ children: ReactNode }>) {
    return (
        <html lang='en'>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
