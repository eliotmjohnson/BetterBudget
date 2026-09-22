import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { APP_TIME_ZONE } from '@/domain/calendar';
import type { MonthKey } from '@/domain/money';
import type { AssistantToolContext } from './commit';
import type { AssistantMessage } from './conversation-schema';
import { executeAssistantTool } from './execute';
import { SYSTEM_PROMPT } from './prompt';
import { ASSISTANT_TOOLS } from './tools';

const MODEL = 'claude-haiku-4-5';
const MAX_OUTPUT_TOKENS = 1_024;
const MAX_MODEL_CALLS = 6;

/** The Claude API could not be reached or refused the request. */
export class AssistantUnavailableError extends Error {
    constructor(readonly rateLimited: boolean) {
        super('The assistant is unavailable.');
    }
}

let client: Anthropic | null = null;
const getClient = () =>
    (client ??= new Anthropic({ maxRetries: 2, timeout: 45_000 }));

function turnContext(viewedMonth: MonthKey, now = new Date()) {
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIME_ZONE,
        weekday: 'long'
    }).format(now);

    return `[Today is ${weekday} ${today}. The person is viewing ${viewedMonth}.]`;
}

const withoutEmphasis = (text: string) =>
    text.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2');

function toHistoryContent(
    content: Anthropic.ContentBlock[],
    toolUses: Anthropic.ToolUseBlock[]
): AssistantMessage['content'] {
    return content.flatMap((block): AssistantMessage['content'] => {
        if (block.type === 'text' && block.text.trim())
            return [{ type: 'text', text: withoutEmphasis(block.text) }];
        if (block.type === 'tool_use' && toolUses.includes(block))
            return [
                {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input as Record<string, unknown>
                }
            ];

        return [];
    });
}

async function callModel(messages: AssistantMessage[]) {
    try {
        const response = await getClient().messages.create({
            model: MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' }
                }
            ],
            tools: ASSISTANT_TOOLS,
            cache_control: { type: 'ephemeral' },
            messages
        });
        const { usage } = response;

        if (
            !usage.cache_read_input_tokens &&
            !usage.cache_creation_input_tokens
        )
            console.warn(
                `[assistant] prompt cache unused (input=${usage.input_tokens}); the cached prefix may be below the model minimum.`
            );

        return response;
    } catch (error) {
        if (error instanceof Anthropic.APIError) {
            console.error(`[assistant] Claude API error ${error.status}`);

            throw new AssistantUnavailableError(error.status === 429);
        }

        throw error;
    }
}

function lastReply(appended: AssistantMessage[]): string {
    const last = appended.at(-1);

    if (last?.role !== 'assistant')
        return 'That took more steps than I can take at once. Check the budget, then ask me to continue.';

    return last.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n\n');
}

/**
 * Runs one person turn: sends the conversation to Claude, executes the tools
 * it calls against this household, and returns the messages to append.
 */
export async function runAssistantTurn({
    householdId,
    viewedMonth,
    history,
    text
}: {
    householdId: string;
    viewedMonth: MonthKey;
    history: AssistantMessage[];
    text: string;
}) {
    const context: AssistantToolContext = {
        householdId,
        viewedMonth,
        changedMonths: new Set()
    };
    const appended: AssistantMessage[] = [
        {
            role: 'user',
            content: [
                { type: 'text', text: turnContext(viewedMonth) },
                { type: 'text', text }
            ]
        }
    ];

    for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
        const response = await callModel([...history, ...appended]);
        const toolUses =
            response.stop_reason === 'tool_use'
                ? response.content.filter(
                      (block): block is Anthropic.ToolUseBlock =>
                          block.type === 'tool_use'
                  )
                : [];
        const content = toHistoryContent(response.content, toolUses);

        if (content.length) appended.push({ role: 'assistant', content });
        if (toolUses.length === 0) break;
        const results: AssistantMessage['content'] = [];

        for (const use of toolUses) {
            const result = await executeAssistantTool(
                use.name,
                use.input,
                context
            );

            results.push({
                type: 'tool_result',
                tool_use_id: use.id,
                content: result.content,
                ...(result.isError ? { is_error: true } : {})
            });
        }
        appended.push({ role: 'user', content: results });
    }

    return {
        appended,
        reply:
            lastReply(appended) ||
            'Sorry, I couldn’t come up with an answer. Try asking another way.',
        changedMonths: [...context.changedMonths].sort()
    };
}
