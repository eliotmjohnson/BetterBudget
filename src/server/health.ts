import 'server-only';
import { NextResponse } from 'next/server';
import { getDatabase } from '@/db';
import { households } from '@/db/schema';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function readyResponse() {
    try {
        const db = await getDatabase();

        await db.select({ id: households.id }).from(households).limit(1);

        return NextResponse.json(
            { status: 'ok', database: 'connected' },
            { headers: noStoreHeaders }
        );
    } catch {
        return NextResponse.json(
            { status: 'degraded', database: 'unavailable' },
            { status: 503, headers: noStoreHeaders }
        );
    }
}
