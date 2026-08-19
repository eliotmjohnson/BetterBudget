import { readyResponse } from '@/server/health';

export const dynamic = 'force-dynamic';

export async function GET() {
    return readyResponse();
}
