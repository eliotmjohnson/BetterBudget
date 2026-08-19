import { closeDatabase, getDatabase } from '../src/db';

async function main() {
    await getDatabase();
    await closeDatabase();
    console.log('Database migrations are current.');
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
