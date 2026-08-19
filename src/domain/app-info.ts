export const APP_NAME = 'Better Budget';
export const APP_VERSION =
    process.env.NEXT_PUBLIC_APP_VERSION ?? 'Unknown version';
export const APP_DESCRIPTION =
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    'A calm, shared household budget that keeps every dollar clear.';

const buildSha = process.env.NEXT_PUBLIC_APP_BUILD_SHA?.trim() ?? '';
const buildRevision = /^[a-f\d]{7,40}$/i.test(buildSha)
    ? buildSha.slice(0, 7)
    : null;

export const APP_BUILD_LABEL =
    process.env.NODE_ENV === 'production'
        ? buildRevision
            ? `Production build · ${buildRevision}`
            : 'Production build'
        : 'Local development build';
