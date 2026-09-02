import { NextResponse } from 'next/server';
import { getAccess } from '@/server/access';
import {
    applyBudgetMutation,
    getMutationStatus
} from '@/server/budget-service';
import { getMonthSnapshot } from '@/server/month-snapshot';
import { mutationSchema } from '@/server/mutation-schema';
import { monthKeySchema } from '@/domain/money';

export async function GET(request: Request) {
    const access = await getAccess();

    if (!access)
        return NextResponse.json({ committed: false }, { status: 401 });
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const month = monthKeySchema.safeParse(url.searchParams.get('month'));

    if (!id || id.length < 8 || !month.success)
        return NextResponse.json({ committed: false }, { status: 400 });

    return NextResponse.json(
        await getMutationStatus(id, month.data, access.householdId)
    );
}

export async function POST(request: Request) {
    const access = await getAccess();

    if (!access)
        return NextResponse.json(
            {
                ok: false,
                code: 'unauthorized',
                message: 'Sign in again to save changes.'
            },
            { status: 401 }
        );
    const scenario =
        process.env.NODE_ENV === 'production'
            ? null
            : request.headers.get('x-better-budget-scenario');

    if (scenario === 'latency')
        await new Promise((resolve) => setTimeout(resolve, 1_800));
    if (scenario === 'timeout')
        await new Promise((resolve) => setTimeout(resolve, 9_000));
    if (scenario === 'transient')
        return NextResponse.json(
            { ok: false, message: 'Simulated temporary failure' },
            { status: 503 }
        );
    const body: unknown = await request.json();
    const parsed = mutationSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            {
                ok: false,
                code: 'validation',
                message:
                    parsed.error.issues[0]?.message ??
                    'Check the highlighted fields.'
            },
            { status: 400 }
        );
    }
    if (scenario === 'conflict')
        return NextResponse.json(
            {
                ok: false,
                code: 'conflict',
                message: 'Simulated version conflict',
                snapshot: await getMonthSnapshot(
                    parsed.data.monthKey,
                    access.householdId
                )
            },
            { status: 409 }
        );
    if (scenario === 'validation')
        return NextResponse.json(
            {
                ok: false,
                code: 'validation',
                message: 'Simulated validation failure',
                snapshot: await getMonthSnapshot(
                    parsed.data.monthKey,
                    access.householdId
                )
            },
            { status: 400 }
        );
    const result = await applyBudgetMutation(parsed.data, access.householdId);

    return NextResponse.json(result, {
        status: result.ok ? 200 : result.code === 'conflict' ? 409 : 400
    });
}
