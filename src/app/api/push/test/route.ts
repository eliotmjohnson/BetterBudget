import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccess } from '@/server/access';
import { sendPush } from '@/server/push/send';
import {
    findPushSubscription,
    pushEndpointSchema
} from '@/server/push/subscriptions';

export async function POST(request: Request) {
    const access = await getAccess();

    if (!access)
        return NextResponse.json(
            { ok: false, code: 'unauthorized' },
            { status: 401 }
        );
    const parsed = z
        .object({ endpoint: pushEndpointSchema })
        .safeParse(await request.json().catch(() => undefined));

    if (!parsed.success)
        return NextResponse.json(
            { ok: false, code: 'validation' },
            { status: 400 }
        );
    const target = await findPushSubscription(
        access.householdId,
        parsed.data.endpoint
    );

    if (!target)
        return NextResponse.json(
            { ok: false, code: 'not_found' },
            { status: 404 }
        );
    const outcome = await sendPush(target, {
        title: 'Notifications are on',
        body: 'Bill reminders will arrive on this device.',
        url: '/settings',
        tag: 'better-budget-test'
    });

    return NextResponse.json({ ok: outcome === 'sent', outcome });
}
