import type { PoolConfig } from 'pg';

export type DatabaseSslMode = 'disable' | 'require' | 'verify-full';

export function databaseSslMode(
    environment?: NodeJS.ProcessEnv
): DatabaseSslMode;

export function isOwnerBootstrap(environment?: NodeJS.ProcessEnv): boolean;

export function assertValidRuntimeEnvironment(
    environment?: NodeJS.ProcessEnv
): void;

export function postgresConnectionConfig(
    environment?: NodeJS.ProcessEnv
): Pick<PoolConfig, 'connectionString' | 'ssl'>;
