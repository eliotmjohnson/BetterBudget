import { closeDatabase, getDatabase } from '../src/db';
import { seedDatabase } from '../src/db/seed';

async function main() {
    const db = await getDatabase();

    await seedDatabase(db);
    await closeDatabase();
    console.log(
        'Deterministic development data is ready for the current and previous month.'
    );
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
