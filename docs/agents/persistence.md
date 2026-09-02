# Eager and optimistic persistence

Read this before writing or changing any mutation. The financial invariants
these rules protect live in `AGENTS.md`.

The app is designed to feel immediate. Safe changes should update the visible query snapshot within one animation frame, then persist quietly.

Every mutation must include:

- A unique `clientMutationId`.
- The affected entity's `expectedVersion` when the action directly edits versioned state.
- Complete data needed for deterministic optimistic calculation and server validation.

The backend writes completed mutation receipts in the same database transaction as the financial mutation. Retrying the same mutation ID must return its existing result and must never duplicate transactions, income receipts, splits, or month copies.

Safe optimistic operations currently include:

- Planned-amount edits committed on blur, Enter, or the established short debounce.
- Carryover toggles.
- Category and item renaming/reordering.
- Simple category, item, expected-income, receipt, and transaction additions after full client validation.
- Received-income receipt deletion and unused income-source deletion.
- Validated expense/refund edits and splits that remain within the same month.
- Soft transaction deletion with Undo.
- Local collapse, filter, draft, and navigation state.

Server-confirmed operations currently include:

- Copying a month.
- Clearing planned amounts.
- Resetting a budget.
- Archiving definitions that have history.
- Cross-month transaction moves.
- Password changes and session revocation.

Server-confirmed does not mean a global spinner. Show a local pending state for only the affected action and replace relevant caches with the authoritative result.

Mutation lifecycle rules:

1. Validate the complete form locally.
2. Cancel/refocus relevant queries and capture the smallest rollback snapshot.
3. Apply a deterministic pure optimistic patch for eligible operations.
4. Start persistence in the background.
5. Keep routine success silent and replace the optimistic snapshot with the canonical server snapshot.
6. Delay saving feedback for about 400 ms; only unusually slow writes should show `Still saving…`.
7. Retry idempotent transient failures using short exponential backoff with jitter.
8. After an ambiguous timeout, query the mutation receipt before rolling back or retrying.
9. Silently accept harmless canonical differences such as recalculated totals, normalized order, or server timestamps.
10. On a permanent failure, roll back only the affected patch, keep the user's form values, and show a concise inline error or Retry action.
11. On a version conflict, fetch the authoritative entity and explain that it changed elsewhere. Never silently overwrite newer direct edits.
12. When offline, preserve drafts but do not claim a financial write was saved. Revert unsafe inline mutations and maintain the persistent offline banner. Offline write synchronization is outside version 1.

Other devices converge through refetches on window focus, route/month navigation, successful mutations, and a lightweight visible-tab interval. Version checks remain mandatory even without WebSockets.

## Development scenarios

The non-production settings scenario panel can simulate normal operation, latency, a timeout, transient failure, conflict, validation failure, and offline behavior. Use it when changing mutation behavior so error feedback, retries, rollback isolation, retained drafts, and canonical reconciliation remain observable.

Scenario simulation must stay non-production and must not alter real production failure behavior.
