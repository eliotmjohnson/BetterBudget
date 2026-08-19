import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
    if (
        process.env.NODE_ENV === 'production' ||
        process.env.DATABASE_KIND === 'postgres'
    )
        throw new Error(
            'Local reset is disabled for production and PostgreSQL.'
        );
    const target = resolve(
        process.cwd(),
        process.env.PGLITE_DATA_DIR ?? '.data/pglite'
    );
    const allowedRoot = resolve(process.cwd(), '.data');

    if (!target.startsWith(`${allowedRoot}/`))
        throw new Error('PGLite reset target must stay inside .data.');
    await rm(target, { recursive: true, force: true });
    console.log(
        `Removed ${target}. The next command will migrate and reseed it.`
    );
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
