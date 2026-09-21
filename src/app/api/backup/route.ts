import { NextResponse } from 'next/server';
import { defaultDateForMonth, currentMonthKey } from '@/domain/calendar';
import { getAccess } from '@/server/access';
import { backupSchema, exportHousehold, importBackup } from '@/server/backup';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export async function GET() {
    const access = await getAccess();

    if (!access)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const backup = await exportHousehold(access.householdId);
    const today = defaultDateForMonth(currentMonthKey());

    return new NextResponse(JSON.stringify(backup, null, 2), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="better-budget-${today}.json"`,
            'Cache-Control': 'no-store'
        }
    });
}

function failure(message: string, status: number) {
    return NextResponse.json(
        { ok: false, code: 'validation', message },
        { status }
    );
}

export async function POST(request: Request) {
    const access = await getAccess();

    if (!access)
        return NextResponse.json(
            {
                ok: false,
                code: 'unauthorized',
                message: 'Sign in again to import a backup.'
            },
            { status: 401 }
        );
    const mode = new URL(request.url).searchParams.get('mode');

    if (mode !== 'merge' && mode !== 'replace')
        return failure('Choose whether to merge or replace.', 400);
    const text = await request.text();

    if (text.length > MAX_BACKUP_BYTES)
        return failure('That backup is larger than 10 MB.', 413);
    let body: unknown;

    try {
        body = JSON.parse(text);
    } catch {
        return failure('That file is not a Better Budget backup.', 400);
    }
    const parsed = backupSchema.safeParse(body);

    if (!parsed.success) {
        const [first] = parsed.error.issues;
        const specific = parsed.error.issues.every(
            (issue) => issue.code === 'custom'
        );

        return failure(
            specific && first
                ? first.message
                : 'That file is not a Better Budget backup.',
            400
        );
    }
    const result = await importBackup(parsed.data, mode, access.householdId);

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
