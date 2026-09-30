'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ContinuousControls } from '@/components/ui/continuous-corners';
import { KeyboardDipProbe } from '@/components/ui/keyboard-dip-probe';
import { CalculatorBar } from '@/components/ui/currency-input/operator-bar';
import { LeftEdgeGestureGuard } from '@/components/ui/left-edge-gesture-guard';
import { ToastProvider } from '@/components/ui/toast-provider';

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 20_000,
                        refetchOnWindowFocus: true,
                        refetchInterval: 30_000,
                        refetchIntervalInBackground: false
                    },
                    mutations: { retry: 0 }
                }
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <LeftEdgeGestureGuard />
                <ContinuousControls />
                <CalculatorBar />
                {process.env.NODE_ENV !== 'production' ? (
                    <KeyboardDipProbe />
                ) : null}
                {children}
            </ToastProvider>
        </QueryClientProvider>
    );
}
