'use client';

import { useState } from 'react';

/**
 * Holds an in-progress edit of one versioned value and the version it was
 * started from. While not editing, both follow the live snapshot so background
 * refetches show through; while editing, they stay put so a refetch can neither
 * replace what the user typed nor make a stale edit look current to the server.
 * Starting an edit rebases onto the live value, so refocusing after a refused
 * save retries the kept draft against the version the user was just shown.
 */
export function useVersionedDraft(live: string, liveVersion: number) {
    const [value, setValue] = useState(live);
    const [editing, setEditing] = useState(false);
    const [baseline, setBaseline] = useState({
        value: live,
        version: liveVersion
    });

    if (
        !editing &&
        (baseline.value !== live || baseline.version !== liveVersion)
    ) {
        setBaseline({ value: live, version: liveVersion });
        setValue(live);
    }

    return {
        value,
        setValue,
        baseline,
        startEditing: () => {
            setEditing(true);
            setBaseline({ value: live, version: liveVersion });
        },
        stopEditing: () => setEditing(false)
    };
}
