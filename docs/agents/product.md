# Product brief

Read this before adding, removing, or reshaping a user-facing capability.
The always-loaded summary and the Version 1 boundaries live in `AGENTS.md`.

The implemented product supports:

- A separate budget for each calendar month.
- Previous/next month navigation and month notes.
- Copying the immediately preceding month's plan into an empty target month
  when the source contains active budget structure or an expected-income plan,
  with clear feedback when there is nothing to copy. The month-actions list
  omits copy when either side is ineligible.
- Keeping untouched months free of persisted month, category, and item state when they are only viewed, with Budget-page actions to copy the previous month or start with a new category. The first successful mutation that needs the month creates it atomically.
- Clearing a month's planned amounts without deleting activity or structure.
- Resetting a selected month to a fresh empty budget without changing other months. Definitions still used elsewhere are preserved, while definitions left unused by the reset are removed.
- Household-level category and budget-item definitions with per-month category participation and item plans.
- Adding, editing, reordering, archiving, and conditionally deleting categories and items. The Budget page retains creation, direct category name/icon/color editing, and item swipe deletion. The Settings organizer is a focused, collapsible Budget-style list with compact 56 px category headers and 44 px item rows for category appearance and item-name editing, history-preserving deletion, permanent deletion of unused definitions, and reordering; it intentionally does not create structure. A 350 ms long-press on a category header or item row starts reordering on both surfaces, with a lifted pointer-following preview, an in-list placeholder, and animated neighboring rows. There are no visible drag grips.
- Planned amount editing and forward-looking per-month carryover settings. A
  month's switch sends its ending balance to the immediately following month;
  it does not change that month's inbound balance.
- Cents-first currency inputs that always display a formatted value such as `$200.57`; typing digits shifts them through the decimal places without requiring a decimal point.
- Expense and refund transactions, including exact splits across budget items.
- Adding transactions globally or from a line-item detail with that item preselected, editing transactions, soft deleting, and undoing transaction deletion.
- Expected-income sources with editable names, icons, colors, and expected amounts plus one or more dated received-income receipts.
  When a month has no income sources, the Income page shows a guided empty
  state with an action that opens the add-source flow.
  Each source exposes its receipt history on the Income page, individual
  receipts can be soft deleted, and a source can be deleted after its active
  receipts are cleared. Income-source details are URL-backed and reuse the
  budget-item navigation-detail pattern: mobile push navigation with Back,
  browser history, and left-edge swipe dismissal plus a desktop modal fallback.
- Searchable and filterable transaction history plus a combined month activity feed. The Transactions page shows only expense and refund records, labels refunds as Income, and leaves received-income/paycheck receipts on the Income page and combined activity surfaces.
- Shared-owner email/password authentication, password change, sign-out, and session revocation.
- Settings app information derives its version and description from
  `package.json`, identifies local development explicitly, and includes the
  short Git commit in production images.
- The Settings Budget section opens read-only currency and time-zone details,
  stores the default Available/Planned Budget amount view per browser or
  installed PWA, and opens the selected month's URL-backed organizer with the
  same mobile push, Back/browser-history, left-edge swipe dismissal, and
  desktop modal pattern used by budget-item and income-source details. The
  organizer reuses the Budget list's hold-to-drag and keyboard ordering,
  category appearance editor, and shared sheet behavior while limiting its
  scope to renaming, reordering, and deletion.
  Switching the amount view directly on the Budget page remains active for the
  current app session and resets from this default only on a fresh load.
- File-persistent PGlite development, PostgreSQL parity, and Docker packaging.
