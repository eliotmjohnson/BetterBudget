import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import {
    assertValidRuntimeEnvironment,
    postgresConnectionConfig
} from '../runtime-environment.mjs';

const { Client } = pg;

assertValidRuntimeEnvironment();
const client = new Client(postgresConnectionConfig());

await client.connect();
try {
    await client.query(
        "SELECT pg_advisory_lock(hashtext('better-budget-migrations'))"
    );
    await client.query(
        'CREATE TABLE IF NOT EXISTS __better_budget_migrations (hash text PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    const names = (await readdir('drizzle'))
        .filter((name) => name.endsWith('.sql'))
        .sort();

    for (const name of names) {
        const sql = await readFile(join('drizzle', name), 'utf8');
        const hash = createHash('sha256').update(sql).digest('hex');
        const found = await client.query(
            'SELECT 1 FROM __better_budget_migrations WHERE hash = $1',
            [hash]
        );

        if (found.rowCount) continue;
        await client.query('BEGIN');
        try {
            await client.query(sql.replaceAll('--> statement-breakpoint', ''));
            await client.query(
                'INSERT INTO __better_budget_migrations (hash, name) VALUES ($1, $2)',
                [hash, name]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');

            throw error;
        }
    }
} finally {
    await client
        .query(
            "SELECT pg_advisory_unlock(hashtext('better-budget-migrations'))"
        )
        .catch(() => undefined);
    await client.end();
}
