'use client';

import {
    useIsMutating,
    useMutation,
    useQuery,
    useQueryClient
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { MonthKey } from '@/domain/money';
import type { MonthSnapshot, MutationResult } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';

const snapshotKey = (monthKey: MonthKey) =>
    ['budget-snapshot', monthKey] as const;

async function fetchSnapshot(
    monthKey: MonthKey,
    signal: AbortSignal
): Promise<MonthSnapshot> {
    const response = await fetch(`/api/snapshot?month=${monthKey}`, { signal });

    if (!response.ok) throw new Error('Could not refresh the budget.');

    return response.json() as Promise<MonthSnapshot>;
}

class MutationRequestError extends Error {
    constructor(
        message: string,
        readonly result?: Extract<MutationResult, { ok: false }>,
        readonly transient = false
    ) {
        super(message);
    }
}

async function postMutation(
    input: BudgetMutation
): Promise<Extract<MutationResult, { ok: true }>> {
    const scenario = window.localStorage.getItem('better-budget-scenario');

    if (scenario === 'offline')
        throw new MutationRequestError(
            'Reconnect before saving financial changes.'
        );
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    let response: Response;

    try {
        response = await fetch('/api/mutations', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(scenario ? { 'x-better-budget-scenario': scenario } : {})
            },
            body: JSON.stringify(input),
            signal: controller.signal
        });
    } catch {
        const statusResponse = await fetch(
            `/api/mutations?id=${encodeURIComponent(input.clientMutationId)}&month=${input.monthKey}`
        ).catch(() => null);

        if (statusResponse?.ok) {
            const status = (await statusResponse.json()) as {
                committed: boolean;
                snapshot?: MonthSnapshot;
            };

            if (status.committed && status.snapshot)
                return {
                    ok: true,
                    snapshot: status.snapshot,
                    clientMutationId: input.clientMutationId
                };
        }

        throw new MutationRequestError(
            'The save is taking longer than expected. Retrying safely…',
            undefined,
            true
        );
    } finally {
        window.clearTimeout(timeout);
    }
    if (response.status >= 500)
        throw new MutationRequestError(
            'The server is taking longer than expected.',
            undefined,
            true
        );
    const result = (await response.json()) as MutationResult;

    if (!result.ok) throw new MutationRequestError(result.message, result);

    return result;
}

export function useBudgetSnapshot(initialSnapshot: MonthSnapshot) {
    return useQuery({
        queryKey: snapshotKey(initialSnapshot.monthKey),
        queryFn: ({ signal }) =>
            fetchSnapshot(initialSnapshot.monthKey, signal),
        initialData: initialSnapshot,
        refetchOnWindowFocus: 'always',
        refetchInterval: 60_000,
        refetchIntervalInBackground: false
    });
}

export function useBudgetMutation(
    monthKey: MonthKey,
    optimisticUpdate: (
        snapshot: MonthSnapshot,
        input: BudgetMutation
    ) => MonthSnapshot,
    onMessage?: (message: string) => void
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ['budget-mutation', monthKey],
        scope: { id: `budget-mutation-${monthKey}` },
        mutationFn: postMutation,
        retry: (failureCount, error) =>
            error instanceof MutationRequestError &&
            error.transient &&
            failureCount < 3,
        retryDelay: (attempt) =>
            Math.min(350 * 2 ** attempt + Math.random() * 180, 2_200),
        onMutate: async (input) => {
            await queryClient.cancelQueries({
                queryKey: snapshotKey(monthKey)
            });
            const previous = queryClient.getQueryData<MonthSnapshot>(
                snapshotKey(monthKey)
            );

            if (previous)
                queryClient.setQueryData(
                    snapshotKey(monthKey),
                    optimisticUpdate(previous, input)
                );

            return { previous };
        },
        onSuccess: (result) =>
            queryClient.setQueryData(snapshotKey(monthKey), result.snapshot),
        onError: (error, _input, context) => {
            if (error instanceof MutationRequestError && error.result?.snapshot)
                queryClient.setQueryData(
                    snapshotKey(monthKey),
                    error.result.snapshot
                );
            else if (context?.previous)
                queryClient.setQueryData(
                    snapshotKey(monthKey),
                    context.previous
                );
            onMessage?.(
                error instanceof Error
                    ? error.message
                    : 'That change could not be saved.'
            );
        }
    });
}

export function useConnectivity() {
    const [online, setOnline] = useState(true);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);

        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);

        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    return online;
}

export function useDelayedSyncIndicator() {
    const mutating = useIsMutating({ mutationKey: ['budget-mutation'] }) > 0;
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(
            () => setVisible(mutating),
            mutating ? 400 : 0
        );

        return () => window.clearTimeout(timer);
    }, [mutating]);

    return mutating && visible;
}
