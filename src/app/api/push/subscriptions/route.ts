import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccess } from '@/server/access';
import { getVapidDetails } from '@/server/push/vapid';
import {
    deletePushSubscription,
    pushEndpointSchema,
    pushSubscriptionSchema,
    savePushSubscription
} from '@/server/push/subscriptions';

const unauthorized = () =>
    NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 });
const invalid = () =>
    NextResponse.json({ ok: false, code: 'validation' }, { status: 400 });

export async function GET() {
    if (!(await getAccess())) return unauthorized();

    return NextResponse.json({
        publicKey: (await getVapidDetails()).publicKey
    });
}

export async function POST(request: Request) {
    const access = await getAccess();

    if (!access) return unauthorized();
    const parsed = pushSubscriptionSchema.safeParse(
        await request.json().catch(() => undefined)
    );

    if (!parsed.success) return invalid();
    await savePushSubscription(
        access.householdId,
        parsed.data,
        request.headers.get('user-agent')
    );

    return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
    const access = await getAccess();

    if (!access) return unauthorized();
    const parsed = z
        .object({ endpoint: pushEndpointSchema })
        .safeParse(await request.json().catch(() => undefined));

    if (!parsed.success) return invalid();
    await deletePushSubscription(access.householdId, parsed.data.endpoint);

    return NextResponse.json({ ok: true });
}
