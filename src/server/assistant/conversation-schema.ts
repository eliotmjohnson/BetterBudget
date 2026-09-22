import { z } from 'zod';
import { monthKeySchema } from '@/domain/money';

/** User turns one conversation may hold before the person starts a new one. */
export const MAX_USER_TURNS = 20;

const textBlock = z.object({
    type: z.literal('text'),
    text: z.string().max(8_000)
});
const toolUseBlock = z.object({
    type: z.literal('tool_use'),
    id: z.string().max(100),
    name: z.string().max(64),
    input: z.record(z.string(), z.unknown())
});
const toolResultBlock = z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string().max(100),
    content: z.string().max(20_000),
    is_error: z.boolean().optional()
});

export const assistantMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z
        .array(
            z.discriminatedUnion('type', [
                textBlock,
                toolUseBlock,
                toolResultBlock
            ])
        )
        .min(1)
        .max(30)
});

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const assistantRequestSchema = z.object({
    month: monthKeySchema,
    history: z.array(assistantMessageSchema).max(200),
    text: z.string().trim().min(1).max(2_000)
});

export type AssistantResponse =
    | {
          ok: true;
          appended: AssistantMessage[];
          reply: string;
          changedMonths: string[];
      }
    | {
          ok: false;
          code:
              | 'unauthorized'
              | 'validation'
              | 'unavailable'
              | 'rate_limited'
              | 'too_long';
          message: string;
      };
