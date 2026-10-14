# Product brief

Read this before adding, removing, or reshaping a user-facing capability. The
always-loaded summary and the Version 1 boundaries live in `AGENTS.md`.

The implemented product supports:

- A separate budget for each calendar month.
- Previous/next month navigation and month notes.
- Copying the immediately preceding month's plan into an empty target month when
  the source contains active budget structure or an expected-income plan that is
  not one-time, with clear feedback when there is nothing to copy. The
  month-actions list omits copy when either side is ineligible.
- Keeping untouched months free of persisted month, category, and item state
  when they are only viewed, with Budget-page actions to copy the previous month
  or start with a new category. The first successful mutation that needs the
  month creates it atomically.
- Clearing a month's planned amounts without deleting activity or structure.
- Resetting a selected month to a fresh empty budget without changing other
  months. Definitions still used elsewhere are preserved, while definitions left
  unused by the reset are removed.
- Household-level category and budget-item definitions with per-month category
  participation and item plans.
- Adding, editing, reordering, archiving, and conditionally deleting categories
  and items. Deleting a category or item that has transactions in the selected
  month or later opens a delete sheet that requires a destination budget item
  for that activity and offers to move the planned amount too; a definition with
  only a plan offers the move as optional. Permanent deletion appears only for
  definitions that were never used. The Budget page retains creation, direct
  category name/icon/color editing, and item swipe deletion. The Settings
  organizer is a focused, collapsible Budget-style list with compact 56 px
  category headers and 44 px item rows for category appearance and item-name
  editing, history-preserving deletion, permanent deletion of unused
  definitions, and reordering; it intentionally does not create structure. A 350
  ms long-press on a category header or item row starts reordering on both
  surfaces, with a lifted pointer-following preview, an in-list placeholder, and
  animated neighboring rows. There are no visible drag grips.
- Moving money between two budget items in the same month from the Move action a
  Budget row's leftward swipe reveals to the left of Delete. **Planned** moves
  part of one item's planned amount to the other (at most what the source has
  planned, leaving Left to budget unchanged); **Remaining** records an expense
  `Transfer to …` on the source and an income transaction `Transfer from …` on
  the destination, which moves available money, including carry-in, without
  touching plans and leaves the month's net Spent unchanged. The two transfer
  transactions are ordinary, independent transactions afterwards. A live preview
  shows both items' remaining amounts before and after the move.
- Planned amount editing and forward-looking per-month carryover settings. A
  month's switch sends its ending balance to the immediately following month; it
  does not change that month's inbound balance. Budget rows whose carryover is
  on cap the right end of their progress bar with the Better Budget dollar coin
  from the logo, with no text; the bar's accessible value adds "carries over".
- Bill reminders. The line-item detail groups **Carry over** and **Bill
  reminder** in one Settings-style card. The Bill reminder row's switch makes
  the item a bill and, when turned on, slides up the Bill reminder sheet;
  tapping the row's label opens the same sheet, and its secondary text
  summarizes the schedule. The sheet sets a due day of the month (1st–31st,
  clamped to short months), a lead time (on the due date, or 1, 3, or 7 days
  before), and an optional due day for the viewed month only. Each subscribed
  device gets one push on the first scheduler check after 9 AM Chicago time
  (usually by 9:30, later after downtime) when the lead day arrives, and one the
  day after the due date if no expense has been recorded on the item that month;
  tapping either opens the item's detail for that month. Budget rows of bills
  show "Due the 15th" after the name. Settings → Notifications turns push on or
  off for the current device and sends a test notification; on iOS it asks for
  the home-screen app first.
- On phones, the month's Left to budget (or Over budget) amount stays in view:
  once the Budget summary card's amount scrolls under the header, a compact
  strip styled like the card slides down from beneath the header, as the
  remaining-this-month strip does in a line-item detail.
- Cents-first currency inputs that always display a formatted value such as
  `$200.57`; typing digits shifts them through the decimal places without
  requiring a decimal point. Every money input also works as a calculator:
  typing an operator, or tapping one on the bar docked above the iOS number pad,
  extends the current amount into an expression such as `$120.00 + 5` whose
  result is what gets saved. While a planned amount is being edited on a phone,
  on a Budget row or in the line-item detail, a Left to budget chip on that bar
  fills the item with whatever the month still has unbudgeted, on top of what
  the field already holds, leaving Left to budget at $0. When the month is over
  budget, the chip turns red, is captioned Over budget, and takes the overage
  back out of the item instead, as long as the item's plan can absorb it.
- Expense and refund transactions, including exact splits across budget items.
  One tap fills a split with whatever of the total is still unassigned, from a
  Remaining chip on the phone's operator bar or the Remaining total under the
  splits. Once saved, a split's parts, its item names, and its color (taken from
  the first part's category) follow budget order, category then item, because
  the database keeps no entry order for them; only the instant optimistic row
  shows them in the order they were entered. The item picker for a split has a
  search field fixed under its title that narrows the list by item or category
  name, ignoring case, accents, punctuation, and spaces (`kids` finds "Kid's");
  each change to it returns the list to its top, and checking items or clearing
  it keeps the keyboard up; checked items stay selected while hidden, and each
  category's remaining total still covers all of its items. Done sits at the top
  right of the picker's header with the selected count as a badge.
- Adding transactions globally or from a line-item detail with that item
  preselected (Add transaction opens with Amount focused and the number pad up),
  editing transactions, duplicating them into the same date and allocations,
  soft deleting, and undoing transaction deletion. A deleted transaction can be
  restored later from **Recently deleted**: a trash tile right-aligned in the
  Transactions type-pill row, under the filters button, carrying a count badge
  while the viewed month has deleted expenses or refunds. Tapping it switches
  the page's own list to the month's deleted transactions, titled Recently
  deleted and grouped by date like the normal list, with search, the type pills,
  and the filter sheet still applying; tapping it again returns to the
  transactions. Each row has a checkbox; the heading's Add button becomes
  **Restore**, which puts every checked transaction back in its budget items in
  one step, the trash tile's badge turns blue and counts the checked rows, and
  **Select all** checks every visible restorable row; once the heading scrolls
  away, the floating plus becomes a floating Restore while anything is checked,
  and leaving the view clears the selection. Restoring the last one returns to
  the normal list. A transaction whose budget item was later deleted for its
  month is listed by title alone with no checkbox, and its **Choose item**
  button opens a **Restore to** sheet of the month's live budget items with
  their available amounts; tapping one restores the transaction there. For a
  split, only the part that was on the deleted item moves, merging into the
  chosen item's part if it already has one, and the sheet says how much moves.
  The toast names the destination. Transactions are never permanently purged
  from the list. Transaction rows on the Transactions page and in a line-item
  detail open a hold menu (Edit, Duplicate, Delete) on a touch hold,
  right-click, or the keyboard context-menu key; a plain tap still opens the
  edit sheet. The merchant is optional: a blank one saves as `Expense` or
  `Income`, matching the sheet's type toggle, so the stored merchant is never
  empty.
- Expected-income sources with editable names, icons, colors, and expected
  amounts plus one or more dated received-income receipts. Each source has a
  **One-time** switch, off by default, in the Add income source sheet and its
  detail; its caption says the source stays in its month only, or names the
  month a copy would carry it into. A one-time source's Income-page row shows a
  small **One-time** tag inline after its name, styled like the transaction
  **Split** tag and sized so the row keeps the same height; a long name
  truncates with an ellipsis while the tag stays visible. Copying a month leaves
  one-time sources behind, so a source such as a bonus stays in its own month.
  When a month has no income sources, the Income page shows a guided empty state
  with an action that opens the add-source flow. Each source exposes its receipt
  history on the Income page. Tapping a receipt opens an edit sheet for its
  amount, date, and note; a touch hold, right-click, or the keyboard
  context-menu key opens the same hold menu as transaction rows (Edit,
  Duplicate, Delete), and Delete asks for confirmation before soft deleting the
  receipt. Receipt rows carry no trash button. While a receipt's amount is being
  typed on a phone, in the record or edit sheet, a Remaining chip on the
  operator bar shows what of the source's expected amount is still unreceived
  after the draft and tops the receipt up to it. The record and edit sheets
  limit the date picker to the viewed month and disable saving, with an inline
  message, while the date falls outside it; the server rejects such a date too.
  Deleting a source also permanently deletes its received transactions for that
  month in the same database transaction; the confirmation sheet names how many
  and their total. Income-source details are URL-backed and reuse the
  budget-item navigation-detail pattern: mobile push navigation with Back,
  browser history, and left-edge swipe dismissal plus a desktop modal fallback.
- Searchable and filterable transaction history plus a combined month activity
  feed. The Transactions page shows only expense and refund records, labels
  refunds as Income, and leaves received-income/paycheck receipts on the Income
  page and combined activity surfaces.
- Shared-owner email/password authentication, password change, sign-out, and
  session revocation.
- Settings app information derives its version and description from
  `package.json`, identifies local development explicitly, and includes the
  short Git commit in production images.
- The Settings Budget section opens read-only currency and time-zone details,
  stores the default Available/Planned Budget amount view per browser or
  installed PWA, and opens the selected month's URL-backed organizer with the
  same mobile push, Back/browser-history, left-edge swipe dismissal, and desktop
  modal pattern used by budget-item and income-source details. The organizer
  reuses the Budget list's hold-to-drag and keyboard ordering, category
  appearance editor, and shared sheet behavior while limiting its scope to
  renaming, reordering, and deletion. On phones, once the Planned/Available
  toggle scrolls away, the balance strip docked under the header slides in its
  own P/R switch, and a floating blue plus button springs in at the bottom right
  once the Add transaction button has scrolled away; the Transactions page shows
  the same button once its Add button scrolls away. Switching the amount view
  directly on the Budget page remains active for the current app session and
  resets from this default only on a fresh load. At 1100 px and wider the Budget
  page shows Planned, Spent, and Available together, so the switch and this
  preference apply only to narrower layouts. Spent is net of refunds and income
  entries, so a month or item they outweigh never shows a negative Spent: the
  amount reads as money added, `+$X` in green, and the summary card, rail, and
  desktop bar label it Added instead of Spent (`spentView` in
  `src/components/shared/budget-view-helpers.ts`).
- The Settings Data section exports the whole household budget as one
  `better-budget-backup` JSON file (every month, category and item definition
  including archived ones, plan, carryover setting, income plan and receipt,
  transaction and split, soft-deleted activity included; each income plan's
  one-time setting, read as not one-time when an older file lacks it; cents as
  base-10 strings; transaction and receipt creation times, which order same-day
  activity, are carried so a Replace keeps the activity feed order; splits
  reference household item definitions) and imports it in one database
  transaction. The export is compact JSON with no indentation, which roughly
  halves its size, because import refuses files over 10 MB and the whole file is
  parsed in the 256 MiB production Node heap. **Replace** permanently deletes
  the household's budget rows and mutation receipts, then restores the file.
  **Merge** never changes an existing row and only adds what is missing:
  categories match by id, then by case-insensitive name among live categories;
  items by id, then by resolved category and name; months by month key; income
  plans by id, then by name within the month; receipts and transactions are
  skipped when their id already exists. Existing plans, carryover settings, and
  notes win. A file from another installation therefore duplicates transactions
  whose ids differ, and a merge that would add live spending to an item archived
  here is refused so the allocation cannot silently drop out of Spent. The file
  is validated before anything is written; auth, household, and member rows are
  never exported. Export fetches the file and hands it to the Web Share sheet
  (Save to Files on iOS) whenever `navigator.canShare` accepts files, falling
  back to a blob download elsewhere. Never link directly to `/api/backup`: an
  installed iOS PWA opens it in a full-screen viewer with no way back. If the
  share call loses its user activation while the file downloads, the prepared
  file is kept for 60 seconds and the next tap shares it immediately.
- Pulling down past the top of any tab to refresh the selected month from the
  server. The gesture rides the browser's native elastic overscroll, so it works
  only where the browser rubber-bands a scroll container (iOS and iPadOS);
  elsewhere it is absent. It reveals a progress dial from beneath the header,
  refreshes as soon as the pull reaches the threshold, before the finger lifts,
  and announces the outcome to assistive technology under the tab's own name.
- Tapping the header on any tab, or a pushed detail's header, outside its
  controls scrolls back to the top, as does tapping the tab that is already
  selected, which on Transactions first leaves Recently deleted, standing in for
  iOS's status-bar and Dynamic Island tap, which iOS ignores while the app
  scrolls inside its own containers.
- Better Buddy, an optional budget assistant, present only when
  `ANTHROPIC_API_KEY` is set: a floating robot button on every authenticated
  page opens a chat sheet driven by Claude Haiku 5.5. The Settings Assistant
  section has a per-device **Better Buddy** switch, on by default, that hides or
  shows it. Dragging him into the beam of the spaceship that drops in during any
  drag beams him aboard and flies him away, which turns that same switch off,
  with an **Undo** toast. It answers questions about any month (planned, spent,
  available, carry-in, left to budget, income, transactions, notes) and across
  up to 24 months: its `get_history` tool returns exact per-month figures for an
  item, a category, or the whole budget (planned, expenses only, income into the
  item, net spent, carry-in, available, and how far expenses alone went over
  planned) with server-computed totals, averages, and over-planned statistics,
  so the model never does the arithmetic and makes basic changes described in
  plain language: planned amounts, carryover, expense and income transaction
  add/edit/delete with exact splits, adding, editing, and deleting income
  sources, recording received income, correcting a receipt's amount, date, or
  note within its month, deleting a receipt, adding and renaming categories and
  items, and the month note. It speaks the interface's vocabulary rather than
  the code's: a `refund` transaction is an **income transaction** (money into a
  budget item, shown as Income on the Transactions page), which it keeps
  distinct from **received income** recorded against an income source on the
  Income page, and it asks which one is meant when a request is ambiguous. It
  refers to budget items by name (`Category / Item` when a name repeats), income
  sources by name (`Name #2` when a name repeats), and transactions and
  received-income receipts by the first eight characters of their id;
  `get_month_overview` lists each source's receipts with that ref. A receipt
  edit that would move its date into another month is refused without changing
  anything, because receipts belong to their source's month; Better Buddy offers
  to record the amount in the other month and delete the original instead.
  Deleting a source deletes its receipts with it in one mutation; when the
  source has received income, Better Buddy confirms the amount first and the
  tool refuses if that amount has changed since, and none of these deletions has
  an Undo. It declines unrelated questions and every destructive or structural
  operation it lacks a tool for, and names where the person can do it, including
  restoring a deleted transaction from Recently deleted, which it has no tool
  for; after deleting a transaction it says it can be restored there. It reads
  each bill's due day, this-month override, and reminder timing from the
  overview (`render.ts` adds "bill reminder on, due the 1st, reminder 3 days
  before"), and points to the Bill reminder row and Settings → Notifications
  when asked to set a reminder, which it has no tool for. A conversation is held
  only in the browser's memory; **New chat** or a reload starts over. Assistant
  writes are server-confirmed and refresh every cached month. Its error replies
  name Better Buddy, never "the assistant", and when the latest reply is an
  outage or rate-limit failure it offers **Try again**, which resends the same
  message.
- File-persistent PGlite development, PostgreSQL parity, and Docker packaging.
