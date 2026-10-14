import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccess } from '@/server/access';
import { runBillReminders } from '@/server/bill-reminders';

const runSchema = z.object({
    now: z.string().datetime({ offset: true }).optional(),
    dryRun: z.boolean().default(false)
});

export async function POST(request: Request) {
    if (process.env.NODE_ENV === 'production')
        return NextResponse.json({ ok: false }, { status: 404 });
    if (!(await getAccess()))
        return NextResponse.json({ ok: false }, { status: 401 });
    const parsed = runSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success)
        return NextResponse.json({ ok: false }, { status: 400 });

    return NextResponse.json(
        await runBillReminders({
            now: parsed.data.now ? new Date(parsed.data.now) : undefined,
            dryRun: parsed.data.dryRun
        })
    );
}
