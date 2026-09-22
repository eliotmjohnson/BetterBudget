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
- Adding, editing, reordering, archiving, and conditionally deleting categories and items. Deleting a category or item that has transactions in the selected month or later opens a delete sheet that requires a destination budget item for that activity and offers to move the planned amount too; a definition with only a plan offers the move as optional. Permanent deletion appears only for definitions that were never used. The Budget page retains creation, direct category name/icon/color editing, and item swipe deletion. The Settings organizer is a focused, collapsible Budget-style list with compact 56 px category headers and 44 px item rows for category appearance and item-name editing, history-preserving deletion, permanent deletion of unused definitions, and reordering; it intentionally does not create structure. A 350 ms long-press on a category header or item row starts reordering on both surfaces, with a lifted pointer-following preview, an in-list placeholder, and animated neighboring rows. There are no visible drag grips.
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
- The Settings Data section exports the whole household budget as one
  `better-budget-backup` JSON file (every month, category and item definition
  including archived ones, plan, carryover setting, income plan and receipt,
  transaction and split, soft-deleted activity included; cents as base-10
  strings; transaction and receipt creation times, which order same-day
  activity, are carried so a Replace keeps the activity feed order; splits reference household item definitions) and imports it in one
  database transaction. **Replace** permanently deletes the household's budget
  rows and mutation receipts, then restores the file. **Merge** never changes
  an existing row and only adds what is missing: categories match by id, then
  by case-insensitive name among live categories; items by id, then by
  resolved category and name; months by month key; income plans by id, then by
  name within the month; receipts and transactions are skipped when their id
  already exists. Existing plans, carryover settings, and notes win. A file from
  another installation therefore duplicates transactions whose ids differ, and a
  merge that would add live spending to an item archived here is refused so the
  allocation cannot silently drop out of Spent. The file is validated before
  anything is written; auth, household, and member rows are never exported.
  Export fetches the file and hands it to the Web Share sheet (Save to Files on
  iOS) whenever `navigator.canShare` accepts files, falling back to a blob
  download elsewhere. Never link directly to `/api/backup`: an installed iOS
  PWA opens it in a full-screen viewer with no way back. If the share call
  loses its user activation while the file downloads, the prepared file is kept
  for 60 seconds and the next tap shares it immediately.
- Pulling down past the top of any tab to refresh the selected month from the
  server. The gesture rides the browser's native elastic overscroll, so it works
  only where the browser rubber-bands a scroll container (iOS and iPadOS);
  elsewhere it is absent. It reveals a progress dial from beneath the header,
  refreshes when released past the threshold, and announces the outcome to
  assistive technology under the tab's own name.
- Better Buddy, an optional budget assistant, present only when
  `ANTHROPIC_API_KEY` is set: a floating robot button on every authenticated
  page opens a chat sheet driven by Claude Haiku 4.5. The Settings Assistant
  section has a per-device **Better Buddy** switch, on by default, that hides
  or shows it. It answers questions about any month (planned, spent,
  available, carry-in, left to budget, income, transactions, notes) and across
  up to 24 months: its `get_history` tool returns exact per-month figures for an
  item, a category, or the whole budget (planned, expenses only, income into the
  item, net spent, carry-in, available, and how far expenses alone went over
  planned) with server-computed totals, averages, and over-planned statistics,
  so the model never does the arithmetic and makes
  basic changes described in plain language: planned amounts, carryover,
  expense and income transaction add/edit/delete with exact splits, income sources and
  received income, adding and renaming categories and items, and the month
  note. It speaks the interface's vocabulary rather than the code's: a `refund`
  transaction is an **income transaction** (money into a budget item, shown as
  Income on the Transactions page), which it keeps distinct from **received
  income** recorded against an income source on the Income page, and it asks
  which one is meant when a request is ambiguous. It refers to budget items by name (`Category / Item` when a name
  repeats), income sources by name (`Name #2` when a name repeats), and
  transactions by the first eight characters of their id. It declines
  unrelated questions and every destructive or structural operation it lacks a
  tool for, and names where the person can do it. A conversation is held only in
  the browser's memory; **New chat** or a reload starts over. Assistant writes
  are server-confirmed and refresh every cached month.
- File-persistent PGlite development, PostgreSQL parity, and Docker packaging.
