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

- Planned-amount edits committed on blur, Enter, or the established short debounce. A failed save on the line-item detail keeps the typed amount and shows an inline Not saved message with the saved amount until the next edit or retry.
- Carryover toggles.
- Category and item renaming/reordering.
- Simple category, item, expected-income, receipt, and transaction additions after full client validation.
- Received-income receipt deletion and unused income-source deletion.
- Validated expense/refund edits and splits that remain within the same month.
- Soft transaction deletion with Undo.
- Local collapse, filter, draft, and navigation state.

Server-confirmed operations currently include:

- Every budget-assistant write. The assistant has no optimistic path: each tool
  reads a fresh snapshot, builds a `BudgetMutation` with a new
  `clientMutationId` and the `expectedVersion` it just read, and commits it
  through `applyBudgetMutation`. A conflict or validation failure goes back to
  the model as a tool error it can retry or explain. After a turn that changed
  anything, the client invalidates every cached month snapshot.

- Copying a month.
- Clearing planned amounts.
- Resetting a budget.
- Archiving categories and items, including moving their activity and plan to a destination item.
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

Other devices converge through refetches on window focus, route/month navigation, successful mutations, an explicit pull-to-refresh on any tab, and a 10-second visible-tab interval (paused while the tab is hidden). Version checks remain mandatory even without WebSockets.

Because those refetches land while the user may be mid-edit, every editor pins the `expectedVersion` it sends to the moment editing started: a sheet or rename captures it when it opens, and an inline amount field captures it on focus through `useVersionedDraft` (`src/components/shared/use-versioned-draft.ts`). Reading the version from the live snapshot at save time would let a refetch make a stale draft look current and silently overwrite the other device's change, violating rule 11. Inline amount fields are keyed by entity id only, never by amount, and follow the live snapshot only while unfocused, so a refetch cannot remount the field or replace a half-typed value. Refocusing after a refused save rebases the kept draft onto the version the conflict message just showed. Pushed detail views follow refreshed data for the entity they show, but close their child sheets (add transaction, appearance, delete confirmation) only when the selected entity id changes, never merely because a refetch replaced its object.

## Development scenarios

The non-production settings scenario panel can simulate normal operation, latency, a timeout, transient failure, conflict, validation failure, and offline behavior. Use it when changing mutation behavior so error feedback, retries, rollback isolation, retained drafts, and canonical reconciliation remain observable.

Scenario simulation must stay non-production and must not alter real production failure behavior.
