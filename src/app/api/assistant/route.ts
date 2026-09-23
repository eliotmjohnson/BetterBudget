import { NextResponse } from 'next/server';
import { getAccess } from '@/server/access';
import {
    assistantRequestSchema,
    MAX_USER_TURNS,
    type AssistantResponse
} from '@/server/assistant/conversation-schema';
import { takeAssistantTurn } from '@/server/assistant/rate-limit';
import { assistantConfigured } from '@/server/assistant/config';
import {
    AssistantUnavailableError,
    runAssistantTurn
} from '@/server/assistant/run';

const MAX_BODY_BYTES = 400_000;
const failure = (
    status: number,
    code: Extract<AssistantResponse, { ok: false }>['code'],
    message: string
) =>
    NextResponse.json<AssistantResponse>(
        { ok: false, code, message },
        { status }
    );

export async function POST(request: Request) {
    const access = await getAccess();

    if (!access)
        return failure(
            401,
            'unauthorized',
            'Sign in again to use Better Buddy.'
        );
    if (!assistantConfigured())
        return failure(503, 'unavailable', 'Better Buddy isn’t set up yet.');
    const raw = await request.text().catch(() => '');

    if (raw.length > MAX_BODY_BYTES)
        return failure(
            413,
            'too_long',
            'This conversation is getting long. Start a new chat to keep going.'
        );
    let body: unknown;

    try {
        body = JSON.parse(raw);
    } catch {
        return failure(400, 'validation', 'That message could not be read.');
    }
    const parsed = assistantRequestSchema.safeParse(body);

    if (!parsed.success)
        return failure(400, 'validation', 'That message could not be read.');
    const { history, month, text } = parsed.data;
    const userTurns = history.filter(
        (message) =>
            message.role === 'user' &&
            message.content.some((block) => block.type === 'text')
    ).length;

    if (userTurns >= MAX_USER_TURNS)
        return failure(
            413,
            'too_long',
            'This conversation is getting long. Start a new chat to keep going.'
        );
    if (!takeAssistantTurn(access.householdId))
        return failure(
            429,
            'rate_limited',
            'That’s a lot of questions at once. Try again in a few minutes.'
        );
    try {
        const result = await runAssistantTurn({
            householdId: access.householdId,
            viewedMonth: month,
            history,
            text
        });

        return NextResponse.json<AssistantResponse>({ ok: true, ...result });
    } catch (error) {
        if (!(error instanceof AssistantUnavailableError)) console.error(error);

        const reason =
            error instanceof AssistantUnavailableError
                ? error.reason
                : 'unreachable';

        switch (reason) {
            case 'rate_limited':
                return failure(
                    429,
                    'rate_limited',
                    'Better Buddy is busy right now. Try again in a minute.'
                );
            case 'account':
                return failure(
                    503,
                    'unavailable',
                    'Better Buddy’s Claude account needs attention. Check the Anthropic API key and credit balance.'
                );
            case 'unreachable':
                return failure(
                    503,
                    'unavailable',
                    'Better Buddy couldn’t be reached. Try again shortly.'
                );
        }
    }
}
