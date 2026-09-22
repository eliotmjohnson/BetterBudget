import 'server-only';

const WINDOW_MS = 10 * 60_000;
const MAX_TURNS_PER_WINDOW = 40;
const recentTurns = new Map<string, number[]>();

/**
 * A per-process spending guard: at most 40 assistant turns per household in
 * any ten minutes. Returns false when the turn should be refused.
 */
export function takeAssistantTurn(householdId: string, now = Date.now()) {
    const recent = (recentTurns.get(householdId) ?? []).filter(
        (startedAt) => now - startedAt < WINDOW_MS
    );

    if (recent.length >= MAX_TURNS_PER_WINDOW) {
        recentTurns.set(householdId, recent);

        return false;
    }
    recent.push(now);
    recentTurns.set(householdId, recent);

    return true;
}
