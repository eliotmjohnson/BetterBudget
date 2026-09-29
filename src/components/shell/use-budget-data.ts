'use client';

import {
    useIsMutating,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { shiftMonth, type MonthKey } from '@/domain/money';
import type { MonthSnapshot, MutationResult } from '@/domain/types';
import type { BudgetMutation } from '@/server/mutation-schema';

const snapshotKey = (monthKey: MonthKey) =>
    ['budget-snapshot', monthKey] as const;
const budgetMutationKey = ['budget-mutation'] as const;

export type MutationFailure = { message: string; retryable: boolean };

function carryoverInvalidationStart(input: BudgetMutation): MonthKey | null {
    switch (input.type) {
        case 'updatePlan':
        case 'toggleCarryover':
        case 'addTransaction':
        case 'deleteTransaction':
        case 'undoDeleteTransaction':
        case 'archiveCategory':
        case 'archiveItem':
        case 'copyPreviousMonth':
        case 'clearPlannedAmounts':
        case 'resetBudget':
            return shiftMonth(input.monthKey, 1);
        case 'updateTransaction': {
            const destinationMonth = input.occurredOn.slice(0, 7) as MonthKey;

            return destinationMonth < input.monthKey
                ? destinationMonth
                : shiftMonth(input.monthKey, 1);
        }
        case 'addIncomePlan':
        case 'updateIncomePlan':
        case 'addIncomeReceipt':
        case 'deleteIncomeReceipt':
        case 'deleteIncomePlan':
        case 'addCategory':
        case 'addItem':
        case 'renameCategory':
        case 'renameItem':
        case 'deleteCategory':
        case 'deleteItem':
        case 'reorderCategories':
        case 'reorderItems':
        case 'updateMonthNote':
            return null;
    }
}

function budgetMutationsSettled(
    queryClient: QueryClient,
    signal: AbortSignal
): Promise<void> {
    const pending = () =>
        queryClient.isMutating({ mutationKey: budgetMutationKey }) > 0;

    if (!pending()) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const stop = () => {
            unsubscribe();
            signal.removeEventListener('abort', abort);
        };
        const abort = () => {
            stop();
            reject(signal.reason);
        };
        const unsubscribe = queryClient.getMutationCache().subscribe(() => {
            if (pending()) return;
            stop();
            resolve();
        });

        signal.addEventListener('abort', abort, { once: true });
    });
}

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
            'Reconnect before saving financial changes.',
            undefined,
            true
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
            controller.signal.aborted
                ? 'Couldn’t confirm that change was saved.'
                : 'Couldn’t reach the server. That change wasn’t saved.',
            undefined,
            true
        );
    } finally {
        window.clearTimeout(timeout);
    }
    if (response.status >= 500)
        throw new MutationRequestError(
            'The server couldn’t save that change.',
            undefined,
            true
        );
    const result = (await response.json()) as MutationResult;

    if (!result.ok) throw new MutationRequestError(result.message, result);

    return result;
}

export function useBudgetSnapshot(initialSnapshot: MonthSnapshot) {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: snapshotKey(initialSnapshot.monthKey),
        queryFn: async ({ signal }) => {
            await budgetMutationsSettled(queryClient, signal);

            return fetchSnapshot(initialSnapshot.monthKey, signal);
        },
        initialData: initialSnapshot,
        refetchOnWindowFocus: 'always',
        refetchInterval: 10_000,
        refetchIntervalInBackground: false
    });
}

export function useBudgetMutation(
    monthKey: MonthKey,
    optimisticUpdate: (
        snapshot: MonthSnapshot,
        input: BudgetMutation
    ) => MonthSnapshot,
    onFailure?: (failure: MutationFailure, input: BudgetMutation) => void,
    onMutationSuccess?: (input: BudgetMutation) => void
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: [...budgetMutationKey, monthKey],
        scope: { id: `budget-mutation-${monthKey}` },
        mutationFn: postMutation,
        retry: (failureCount, error) =>
            error instanceof MutationRequestError &&
            error.transient &&
            failureCount < 3,
        retryDelay: (attempt) =>
            Math.min(350 * 2 ** attempt + Math.random() * 180, 2_200),
        onMutate: async (input) => {
            const queryKey = snapshotKey(input.monthKey);

            await queryClient.cancelQueries({
                queryKey
            });
            const previous = queryClient.getQueryData<MonthSnapshot>(queryKey);

            if (previous)
                queryClient.setQueryData(
                    queryKey,
                    optimisticUpdate(previous, input)
                );

            return { previous, queryKey };
        },
        onSuccess: (result, input) => {
            queryClient.setQueryData(
                snapshotKey(input.monthKey),
                result.snapshot
            );
            onMutationSuccess?.(input);
            const invalidationStart = carryoverInvalidationStart(input);

            if (invalidationStart)
                void queryClient.invalidateQueries({
                    predicate: (query) =>
                        query.queryKey[0] === 'budget-snapshot' &&
                        typeof query.queryKey[1] === 'string' &&
                        query.queryKey[1] >= invalidationStart
                });
        },
        onError: (error, input, context) => {
            if (
                error instanceof MutationRequestError &&
                error.result?.snapshot
            ) {
                queryClient.setQueryData(
                    snapshotKey(input.monthKey),
                    error.result.snapshot
                );
                const invalidationStart = carryoverInvalidationStart(input);

                if (invalidationStart)
                    void queryClient.invalidateQueries({
                        predicate: (query) =>
                            query.queryKey[0] === 'budget-snapshot' &&
                            typeof query.queryKey[1] === 'string' &&
                            query.queryKey[1] >= invalidationStart
                    });
            } else if (context?.previous)
                queryClient.setQueryData(context.queryKey, context.previous);
            onFailure?.(
                {
                    message:
                        error instanceof Error
                            ? error.message
                            : 'That change could not be saved.',
                    retryable:
                        error instanceof MutationRequestError && error.transient
                },
                input
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
    const mutating = useIsMutating({ mutationKey: budgetMutationKey }) > 0;
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
