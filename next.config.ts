import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';
import packageMetadata from './package.json';

const privateLanDevOrigins = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${
        process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
    }`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
].join('; ');
const securityHeaders = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'Referrer-Policy', value: 'same-origin' },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()'
    },
    ...(process.env.NODE_ENV === 'production'
        ? [
              {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000'
              }
          ]
        : []),
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    { key: 'X-Frame-Options', value: 'DENY' }
];
const nextConfig: NextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    poweredByHeader: false,
    env: {
        NEXT_PUBLIC_APP_VERSION: packageMetadata.version,
        NEXT_PUBLIC_APP_DESCRIPTION: packageMetadata.description,
        NEXT_PUBLIC_APP_BUILD_SHA: process.env.APP_BUILD_SHA?.trim() ?? ''
    },
    allowedDevOrigins: ['127.0.0.1', ...privateLanDevOrigins],
    serverExternalPackages: ['@electric-sql/pglite', 'pg'],
    async headers() {
        return [{ source: '/:path*', headers: securityHeaders }];
    }
};

export default nextConfig;
