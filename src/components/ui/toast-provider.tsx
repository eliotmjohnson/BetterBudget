'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode
} from 'react';
import { createPortal } from 'react-dom';

interface ToastOptions {
    message: string;
    actionLabel?: string;
    action?: () => void;
}

interface ToastState extends ToastOptions {
    id: number;
}

type ShowToast = (options: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);
const toastDurationMs = 5_000;

export function ToastProvider({ children }: { children: ReactNode }) {
    const nextIdRef = useRef(0);
    const [toast, setToast] = useState<ToastState | null>(null);
    const showToast = useCallback<ShowToast>((options) => {
        nextIdRef.current += 1;
        setToast({ ...options, id: nextIdRef.current });
    }, []);
    const dismiss = useCallback((id: number) => {
        setToast((current) => (current?.id === id ? null : current));
    }, []);
    const runAction = () => {
        if (!toast?.action) return;
        const { action, id } = toast;

        dismiss(id);
        action();
    };

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(
            () => dismiss(toast.id),
            toastDurationMs
        );

        return () => window.clearTimeout(timer);
    }, [dismiss, toast]);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            {toast
                ? createPortal(
                      <div
                          className='toast'
                          role='status'
                          aria-atomic='true'
                          key={toast.id}
                      >
                          <span>{toast.message}</span>
                          {toast.action ? (
                              <button type='button' onClick={runAction}>
                                  {toast.actionLabel}
                              </button>
                          ) : (
                              <button
                                  type='button'
                                  aria-label='Dismiss message'
                                  onClick={() => dismiss(toast.id)}
                              >
                                  ×
                              </button>
                          )}
                      </div>,
                      document.body
                  )
                : null}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const showToast = useContext(ToastContext);

    if (!showToast)
        throw new Error('useToast must be used inside ToastProvider.');

    return showToast;
}
