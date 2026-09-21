import 'server-only';
import { getDatabase, type AppDb } from '@/db';
import { MutationFailure } from '@/server/mutation-failures';
import { clearHousehold } from './import-replace';
import { mergeBackup } from './import-merge';
import type { BackupFile, BackupSummary } from './schema';

export { exportHousehold } from './export';
export { backupSchema } from './schema';

export type BackupImportMode = 'merge' | 'replace';

export type BackupImportResult =
    | { ok: true; summary: BackupSummary }
    | { ok: false; code: 'validation'; message: string };

/** Applies a validated backup in one database transaction, either merged into or replacing the household's budget. */
export async function importBackup(
    file: BackupFile,
    mode: BackupImportMode,
    householdId: string
): Promise<BackupImportResult> {
    const db = await getDatabase();

    try {
        const summary = await db.transaction(async (tx) => {
            if (mode === 'replace')
                await clearHousehold(tx as AppDb, householdId);

            return mergeBackup(tx as AppDb, householdId, file);
        });

        return { ok: true, summary };
    } catch (error) {
        if (error instanceof MutationFailure)
            return { ok: false, code: 'validation', message: error.message };
        console.error(error);

        return {
            ok: false,
            code: 'validation',
            message: 'That backup could not be imported. Nothing was changed.'
        };
    }
}
