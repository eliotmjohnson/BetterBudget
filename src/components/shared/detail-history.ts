'use client';

export interface DetailHistory {
    url: (id?: string) => string;
    state: (id?: string) => Record<string, unknown>;
    idFromLocation: () => string | null;
    idFromState: (state: unknown) => unknown;
    subscribe: (onStoreChange: () => void) => () => void;
    notifyChange: () => void;
}

/**
 * URL-backed detail navigation: the open record lives in a search param so it
 * survives reload and share, and in history state so back/forward can restore
 * it without a re-render race. The custom event exists because same-document
 * pushState/replaceState never fires popstate.
 */
export function createDetailHistory(
    searchParam: string,
    stateKey: string,
    eventName: string
): DetailHistory {
    const url = (id?: string) => {
        const target = new URL(window.location.href);

        if (id) target.searchParams.set(searchParam, id);
        else target.searchParams.delete(searchParam);

        return `${target.pathname}${target.search}${target.hash}`;
    };
    const state = (id?: string) => {
        const current = window.history.state;
        const next =
            current && typeof current === 'object'
                ? { ...(current as Record<string, unknown>) }
                : {};

        if (id) next[stateKey] = id;
        else delete next[stateKey];

        return next;
    };
    const idFromLocation = () =>
        new URL(window.location.href).searchParams.get(searchParam);
    const idFromState = (current: unknown) =>
        current && typeof current === 'object'
            ? (current as Record<string, unknown>)[stateKey]
            : undefined;
    const subscribe = (onStoreChange: () => void) => {
        window.addEventListener('popstate', onStoreChange);
        window.addEventListener(eventName, onStoreChange);

        return () => {
            window.removeEventListener('popstate', onStoreChange);
            window.removeEventListener(eventName, onStoreChange);
        };
    };
    const notifyChange = () => {
        window.dispatchEvent(new Event(eventName));
    };

    return { url, state, idFromLocation, idFromState, subscribe, notifyChange };
}
