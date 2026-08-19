import { NextResponse } from 'next/server';
import { monthKeySchema } from '@/domain/money';
import { getAccess } from '@/server/access';
import { getMonthSnapshot } from '@/server/budget-service';

export async function GET(request: Request) {
    const access = await getAccess();

    if (!access)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const parsed = monthKeySchema.safeParse(
        url.searchParams.get('month') ?? '2026-08'
    );

    if (!parsed.success)
        return NextResponse.json({ error: 'Invalid month' }, { status: 400 });

    return NextResponse.json(
        await getMonthSnapshot(parsed.data, access.householdId)
    );
}
