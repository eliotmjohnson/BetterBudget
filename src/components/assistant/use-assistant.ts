'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { MonthKey } from '@/domain/money';
import { createUuid } from '@/domain/uuid';
import type {
    AssistantMessage,
    AssistantResponse
} from '@/server/assistant/conversation-schema';

export interface TranscriptEntry {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    failed?: boolean;
    retryText?: string;
}

const REQUEST_TIMEOUT_MS = 35_000;
const RETRYABLE_CODES = new Set(['unavailable', 'rate_limited']);

async function requestTurn(
    month: MonthKey,
    history: AssistantMessage[],
    text: string
): Promise<AssistantResponse> {
    const controller = new AbortController();
    const timeout = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
    );

    try {
        const response = await fetch('/api/assistant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ month, history, text }),
            signal: controller.signal
        });

        return (await response.json()) as AssistantResponse;
    } catch {
        return {
            ok: false,
            code: 'unavailable',
            message: navigator.onLine
                ? 'Better Buddy didn’t respond. Try again.'
                : 'You’re offline. Reconnect to use Better Buddy.'
        };
    } finally {
        window.clearTimeout(timeout);
    }
}

/**
 * One in-memory assistant conversation. Nothing persists: a new chat or a
 * reload starts over. Budget changes the assistant commits refresh every
 * cached month snapshot, since carryover can move later months.
 */
export function useAssistant(monthKey: MonthKey) {
    const queryClient = useQueryClient();
    const historyRef = useRef<AssistantMessage[]>([]);
    const conversationRef = useRef(0);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [pending, setPending] = useState(false);
    const request = async (text: string) => {
        const conversation = conversationRef.current;

        setPending(true);
        const result = await requestTurn(monthKey, historyRef.current, text);

        if (result.ok && result.changedMonths.length)
            void queryClient.invalidateQueries({
                queryKey: ['budget-snapshot']
            });
        if (conversation !== conversationRef.current) return;
        if (result.ok)
            historyRef.current = [...historyRef.current, ...result.appended];
        setTranscript((current) => [
            ...current,
            result.ok
                ? { id: createUuid(), role: 'assistant', text: result.reply }
                : {
                      id: createUuid(),
                      role: 'assistant',
                      text: result.message,
                      failed: true,
                      retryText: RETRYABLE_CODES.has(result.code)
                          ? text
                          : undefined
                  }
        ]);
        setPending(false);
    };
    const send = async (text: string) => {
        const trimmed = text.trim();

        if (!trimmed || pending) return;
        setTranscript((current) => [
            ...current,
            { id: createUuid(), role: 'user', text: trimmed }
        ]);
        await request(trimmed);
    };
    const retry = async () => {
        const failed = transcript.at(-1);

        if (!failed?.retryText || pending) return;
        setTranscript((current) =>
            current.filter((entry) => entry.id !== failed.id)
        );
        await request(failed.retryText);
    };
    const reset = () => {
        conversationRef.current += 1;
        historyRef.current = [];
        setTranscript([]);
        setPending(false);
    };

    return { transcript, pending, send, retry, reset };
}
