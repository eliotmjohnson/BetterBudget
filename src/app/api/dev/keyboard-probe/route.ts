import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccess } from '@/server/access';

export const dynamic = 'force-dynamic';

const probeLogSchema = z.object({ text: z.string().min(1).max(200_000) });

export async function POST(request: Request) {
    if (process.env.NODE_ENV === 'production')
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await getAccess()))
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = probeLogSchema.safeParse(
        await request.json().catch(() => null)
    );

    if (!parsed.success)
        return NextResponse.json({ error: 'Invalid log' }, { status: 400 });
    const directory = join(process.cwd(), '.data');
    const file = join(directory, `keyboard-probe-${Date.now()}.tsv`);

    await mkdir(directory, { recursive: true });
    await writeFile(file, parsed.data.text);
    console.warn(
        `\nKeyboard probe log saved to ${file}\n${parsed.data.text}\n`
    );

    return NextResponse.json({ ok: true, file });
}
