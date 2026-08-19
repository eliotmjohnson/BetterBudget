const insecureSecretMarkers = [
    'change-me',
    'local-development',
    'local-docker',
    'replace-with'
];

function parseUrl(value) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isLoopbackHostname(hostname) {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
    );
}

function isLocalContainerDeployment(environment) {
    const authUrl = parseUrl(environment.BETTER_AUTH_URL ?? '');

    return (
        environment.ALLOW_INSECURE_LOCAL_AUTH === 'true' &&
        environment.AUTH_BYPASS !== 'false' &&
        authUrl?.protocol === 'http:' &&
        isLoopbackHostname(authUrl.hostname)
    );
}

function databaseUrlIsValid(value) {
    const databaseUrl = parseUrl(value ?? '');

    return (
        databaseUrl?.protocol === 'postgres:' ||
        databaseUrl?.protocol === 'postgresql:'
    );
}

function authUrlIsOrigin(value, requireHttps) {
    const authUrl = parseUrl(value ?? '');

    if (!authUrl) return false;
    if (requireHttps && authUrl.protocol !== 'https:') return false;
    if (authUrl.username || authUrl.password) return false;

    return (
        (authUrl.protocol === 'http:' || authUrl.protocol === 'https:') &&
        authUrl.pathname === '/' &&
        !authUrl.search &&
        !authUrl.hash
    );
}

function secretIsSecure(value) {
    if (!value || value.length < 32) return false;
    const normalized = value.toLowerCase();

    return !insecureSecretMarkers.some((marker) => normalized.includes(marker));
}

function poolSizeIsValid(value) {
    if (value === undefined) return true;
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20;
}

export function databaseSslMode(environment = process.env) {
    const configured = environment.DATABASE_SSL?.trim().toLowerCase();

    if (!configured)
        return environment.NODE_ENV === 'production'
            ? 'verify-full'
            : 'disable';
    if (configured === 'false' || configured === 'disable') return 'disable';
    if (configured === 'true' || configured === 'require') return 'require';
    if (configured === 'verify-full') return 'verify-full';

    throw new Error('DATABASE_SSL must be disable, require, or verify-full.');
}

export function isOwnerBootstrap(environment = process.env) {
    return (
        environment.BETTER_BUDGET_BOOTSTRAP === 'true' &&
        environment.npm_lifecycle_event === 'db:owner'
    );
}

export function assertValidRuntimeEnvironment(environment = process.env) {
    if (environment.NODE_ENV !== 'production') return;
    const errors = [];
    const localContainer = isLocalContainerDeployment(environment);

    if (environment.DATABASE_KIND !== 'postgres')
        errors.push('DATABASE_KIND must be postgres.');
    if (!databaseUrlIsValid(environment.DATABASE_URL))
        errors.push('DATABASE_URL must be a PostgreSQL connection URL.');
    if (!poolSizeIsValid(environment.DATABASE_POOL_SIZE))
        errors.push('DATABASE_POOL_SIZE must be an integer from 1 through 20.');
    if (environment.MIGRATIONS_PRESTART !== 'true')
        errors.push('MIGRATIONS_PRESTART must be true.');
    if (!secretIsSecure(environment.BETTER_AUTH_SECRET))
        errors.push(
            'BETTER_AUTH_SECRET must be a non-placeholder secret of at least 32 characters.'
        );
    if (!authUrlIsOrigin(environment.BETTER_AUTH_URL, !localContainer))
        errors.push(
            'BETTER_AUTH_URL must be an HTTPS origin without a path, query, or fragment.'
        );
    if (!localContainer && environment.AUTH_BYPASS !== 'false')
        errors.push('AUTH_BYPASS must be false.');
    if (!localContainer && environment.ALLOW_INSECURE_LOCAL_AUTH !== 'false')
        errors.push('ALLOW_INSECURE_LOCAL_AUTH must be false.');
    if (
        environment.BETTER_BUDGET_BOOTSTRAP === 'true' &&
        !isOwnerBootstrap(environment)
    )
        errors.push(
            'BETTER_BUDGET_BOOTSTRAP is only valid during npm run db:owner.'
        );

    let sslMode;

    try {
        sslMode = databaseSslMode(environment);
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }
    if (!localContainer && sslMode !== 'verify-full')
        errors.push('DATABASE_SSL must be verify-full.');
    if (
        !localContainer &&
        !environment.DATABASE_SSL_CA?.includes('BEGIN CERTIFICATE')
    )
        errors.push(
            'DATABASE_SSL_CA must contain the trusted PostgreSQL CA bundle.'
        );

    if (errors.length > 0)
        throw new Error(
            `Invalid production environment:\n${errors
                .map((message) => `- ${message}`)
                .join('\n')}`
        );
}

function connectionString(environment) {
    const configured = environment.DATABASE_URL;

    if (configured) {
        const parsed = parseUrl(configured);

        if (!parsed || !databaseUrlIsValid(configured))
            throw new Error(
                'DATABASE_URL must be a PostgreSQL connection URL.'
            );
        for (const key of [
            'ssl',
            'sslmode',
            'sslcert',
            'sslkey',
            'sslrootcert'
        ])
            parsed.searchParams.delete(key);

        return parsed.toString();
    }

    return `postgres://${encodeURIComponent(environment.DATABASE_USER ?? 'better_budget')}:${encodeURIComponent(environment.DATABASE_PASSWORD ?? 'better_budget')}@${environment.DATABASE_HOST ?? 'localhost'}:${environment.DATABASE_PORT ?? '5432'}/${environment.DATABASE_NAME ?? 'better_budget'}`;
}

export function postgresConnectionConfig(environment = process.env) {
    assertValidRuntimeEnvironment(environment);
    const mode = databaseSslMode(environment);
    const config = { connectionString: connectionString(environment) };

    if (mode === 'disable') return { ...config, ssl: false };
    if (mode === 'require')
        return { ...config, ssl: { rejectUnauthorized: false } };
    const ca = environment.DATABASE_SSL_CA?.replaceAll('\\n', '\n');

    if (!ca)
        throw new Error(
            'DATABASE_SSL_CA is required when DATABASE_SSL is verify-full.'
        );

    return { ...config, ssl: { ca, rejectUnauthorized: true } };
}
