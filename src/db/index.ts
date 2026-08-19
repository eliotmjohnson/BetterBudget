import 'server-only';
import { mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
    drizzle as drizzlePglite,
    type PgliteDatabase
} from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import {
    assertValidRuntimeEnvironment,
    postgresConnectionConfig
} from '../../runtime-environment.mjs';
import * as tables from './schema';
import { seedDatabase } from './seed';

export type AppDb = PgliteDatabase<typeof tables>;

interface DbContext {
    db: AppDb;
    close: () => Promise<void>;
}

const globalDatabase = globalThis as typeof globalThis & {
    betterBudgetDb?: Promise<DbContext>;
};

async function createDatabase(): Promise<DbContext> {
    assertValidRuntimeEnvironment();
    if (process.env.DATABASE_KIND === 'postgres') {
        const pool = new Pool({
            ...postgresConnectionConfig(),
            max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
            idleTimeoutMillis: 20_000,
            connectionTimeoutMillis: 5_000
        });
        const nodeDb = drizzleNodePg(pool, { schema: tables });

        if (process.env.MIGRATIONS_PRESTART !== 'true')
            await migrateNodePg(nodeDb, { migrationsFolder: 'drizzle' });
        const db = nodeDb as unknown as AppDb;

        if (process.env.NODE_ENV !== 'production') await seedDatabase(db);

        return { db, close: () => pool.end() };
    }

    const dataDir = process.env.PGLITE_DATA_DIR ?? '.data/pglite';

    if (!dataDir.startsWith('memory://'))
        await mkdir(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    const db = drizzlePglite(client, { schema: tables });

    await migratePglite(db, { migrationsFolder: 'drizzle' });
    if (process.env.NODE_ENV !== 'production') await seedDatabase(db);

    return { db, close: () => client.close() };
}

export async function getDatabase(): Promise<AppDb> {
    globalDatabase.betterBudgetDb ??= createDatabase();

    return (await globalDatabase.betterBudgetDb).db;
}

export async function closeDatabase(): Promise<void> {
    if (!globalDatabase.betterBudgetDb) return;
    await (await globalDatabase.betterBudgetDb).close();
    globalDatabase.betterBudgetDb = undefined;
}
