'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
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
                {children}
            </ToastProvider>
        </QueryClientProvider>
    );
}
