# Repository paths

Read this before working in an unfamiliar area of the codebase. It lists what
each high-impact file and directory owns; `AGENTS.md` holds the directory
overview and the navigation tips. Keep this list current when a file is added,
moved, renamed, or takes on a new responsibility.

- `src/domain/money.ts` — parsing, formatting, exact cent operations.
- `src/domain/money-expression.ts` — exact bigint evaluation of the calculator
  expressions money inputs accept.
- `src/domain/uuid.ts` — `createUuid()` for secure production and plain-HTTP LAN
  development.
- `src/domain/calendar.ts` — `APP_TIME_ZONE`, the default current-month key,
  month-date helpers.
- `src/domain/budget-calculations.ts` — authoritative and optimistic
  totals/carryover.
- `src/domain/types.ts` — snapshot and domain contracts.
- `src/db/schema.ts` — relational structure and database constraints.
- `src/db/index.ts` — PGlite/PostgreSQL selection and initialization.
- `src/db/household.ts` — single-household identity, owner bootstrap membership.
- `src/db/seed.ts` — development data for the current and previous month.
  Merchants, amounts, and structure are fixed; only the calendar months follow
  today's date.
- `src/server/mutation-schema.ts` — validated mutation contracts.
- `src/server/budget-service.ts` — the mutation entry point: idempotency
  receipts, the database transaction, cross-cutting month validation, the typed
  dispatcher, and error mapping.
- `src/server/budget-mutations/` — one module per mutation family, each handler
  taking a `MutationContext`: `plans.ts` (plan amount, carryover),
  `transactions.ts` (add/update/delete/undo, splits, cross-month moves),
  `income.ts` (plans and receipts), `structure.ts` (categories, items,
  archive/delete, reordering), `reassignment.ts` (moving an archived
  definition's activity and plan), `active-items.ts` (the shared
  archived-as-of-month condition), `month-operations.ts` (note, copy, clear,
  reset), `context.ts` (shared `MutationContext`/`ensureMonth`). Read only the
  family you are changing.
- `src/server/backup/` — the Settings JSON backup behind `/api/backup`.
  `schema.ts` validates the file (exact split sums, in-month dates, internal
  references), `export.ts` builds it, `import-replace.ts` clears the household's
  budget rows, and `import-merge.ts` plus `import-activity.ts` add whatever the
  household lacks. Replace is clear-then-merge inside one transaction.
- `src/server/month-snapshot/` — canonical month snapshot read path. `index.ts`
  is orchestration only; `queries.ts` holds every database read, `carryover.ts`
  the chronological carryover chains and balance derivation, `assemble.ts` the
  category, activity, and receipt view assembly.
- `src/server/mutation-failures.ts` — mutation-failure class, not-found/conflict
  helpers.
- `src/server/assistant/` — the budget assistant. `run.ts` is the Claude tool
  loop and model settings, `prompt.ts` the frozen system prompt, `tools.ts` the
  frozen tool definitions, `execute.ts` the tool dispatcher and read tools,
  `history.ts` the multi-month history read tool, `budget-tools.ts` and
  `transaction-tools.ts` the write tools, `commit.ts` the shared mutation,
  money, and month helpers, `resolve.ts` name and transaction-ref resolution,
  `render.ts` the compact text the model reads, `conversation-schema.ts` the
  request contract, `config.ts` the key-presence switch, and `rate-limit.ts` the
  per-household turn guard. `src/app/api/assistant/route.ts` is the endpoint.
- `src/server/definition-usage.ts` — later-month activity and never-used
  (permanently deletable) status per definition, shared by the snapshot and the
  hard-delete handlers.
- `src/components/shell/use-budget-data.ts` — hydration, retry, reconciliation,
  sync state.
- `src/components/shell/optimistic.ts` — optimistic cache patches: clones the
  snapshot and delegates to `optimistic-patches/`, which mirrors
  `budget-mutations/` one file per mutation family.
- `src/components/shell/pull-to-refresh.tsx` — the per-tab pull-to-refresh
  indicator, refresh lifecycle, and status announcement; `pull-gesture.ts`
  observes the native elastic overscroll and holds the pull state machine.
- `src/components/shell/app-client.tsx` — authenticated interactive shell;
  `app-shell.tsx`, `budget-route.tsx`, `month-picker.tsx`, and
  `month-actions-sheet.tsx` are the surrounding chrome.
- `src/components/budget/budget-view.tsx` — Budget page layout, URL-backed
  line-item details, item-scoped add-transaction flow.
  `budget-category-section.tsx` renders a category and its items,
  `budget-summary-card.tsx` the arc and balance, `budget-rail.tsx` the desktop
  summary rail (Add transaction, month totals, and recent transactions that open
  the edit sheet), `budget-structure-editor.ts` owns the category/item sheet
  state that `budget-structure-sheets.tsx` renders, and
  `budget-balance-strip.tsx` the mobile Left-to-budget strip that docks under
  the header once the card's amount scrolls away and, once the toolbar toggle
  scrolls away too, a P/R Planned/Available switch, and `carryover-coin.tsx`
  draws the logo's dollar coin (paths exported from
  `src/components/brand-mark.tsx`) that caps the progress bar of an item whose
  carryover is on.
- `src/components/budget/move-money-sheet.tsx` — the Move money sheet the Budget
  row's swipe Move action opens: a planned-amount move (`movePlannedAmount`, in
  `budget-mutations/plans.ts`) or a paired expense/income transfer
  (`transferBetweenItems`, in `budget-mutations/transactions.ts`). Both resolve
  their two items through `activeMovePair` in `active-items.ts`.
- `src/components/budget/budget-item-editors.tsx` — plan input, item edit/detail
  components; `left-to-budget-fill.ts` the planned amount's Left to budget and
  Over budget fill chip; `item-remaining-summary.tsx` the remaining-this-month
  card and the compact strip that docks under the detail header.
- `src/components/income/income-view.tsx` — Income page: expected-income plans
  and received-income receipts. `income-source-details.tsx` is the pushed
  detail, `income-forms.tsx` the add-source and record-income sheets,
  `income-fields.tsx` the shared title, plan-amount, and appearance inputs.
- `src/components/organize/organizer-view.tsx` — category and item structure
  editing, drag reordering, archive/delete; `organizer-category-section.tsx`
  renders one category and its items.
- `src/components/transactions/transactions-view.tsx` — activity scoping,
  search, inline filters, filter-sheet drafts, applied-filter clearing;
  `transaction-sheet.tsx` and `transaction-allocation-picker.tsx` are the
  add/edit flow.
- `src/components/shared/detail-history.ts` — the shared URL-plus-history-state
  contract behind every pushed detail view; Budget and Income both build one
  with `createDetailHistory`. `delete-definition-sheet.tsx` is the Budget-page
  and organizer delete flow that moves a definition's activity and plan to
  another item. `floating-add-button.tsx` is the mobile floating plus the Budget
  and Transactions pages spring in once their own add button scrolls away.
  `use-versioned-draft.ts` keeps inline amount edits and their `expectedVersion`
  stable across background refetches. `category-icon.tsx`,
  `category-details-fields.tsx`, `transaction-icon.tsx`, and
  `budget-view-helpers.ts` are the other cross-view primitives.
- `src/components/assistant/` — `assistant-launcher.tsx` is the draggable
  floating button, rendered through `AppShell`'s `floating` slot so it sits
  outside the animated page content, `launcher-throw.ts` its release-velocity
  projection and settle spring, `buddy-protest.tsx` the fall and speech bubble
  after a hard throw, `buddy-ship.tsx` the spaceship that beams him away (art in
  `better-buddy-ship.png` and `better-buddy-ship-beam.png`, styles in
  `src/app/styles/assistant-ship.css`), `better-buddy.png` the transparent 256
  px robot icon cut from the approved artwork, `better-buddy-figure.tsx` the
  floating robot with its gradient halo and floor shadow, `assistant-sheet.tsx`
  the chat sheet, `message-glide.tsx` its message list, which slides the
  messages into place as new ones arrive, `stick-to-end.ts` the thread's hold on
  its latest message as the keyboard shortens the body (the chat otherwise makes
  room for the keyboard through the shared `useKeyboardFit`, and its composer is
  a `StillTextarea` with `reveal={false}` stuck to the bottom of the sheet body,
  never in the footer), and `use-assistant.ts` the in-memory conversation and
  snapshot invalidation. Styles live in `src/app/styles/assistant.css`.
  `src/components/settings/settings-assistant-section.tsx` is the Settings
  switch.
- `src/components/ui/navigation-detail/` — mobile push navigation, fixed detail
  chrome, modal fallback. `index.tsx` is the component, `edge-drag.ts` the
  edge-swipe dismissal gesture, `title-motion.ts` the collapsing-title
  machinery, `title-edit.ts` the rename tween that eases the header open and
  shut around a title edit, `summary-motion.ts` the scroll-scrubbed summary
  strip docked under the collapsed header, `header-cover.ts` the scrolled flag
  that lets the drawn header bar take pointers.
  `src/components/ui/docked-summary.ts` is the scroll tracking both docked
  strips share.
- `src/components/ui/left-edge-gesture-guard.tsx` — global Safari left-edge
  history-gesture suppression.
- `src/components/ui/still-focus/` — focus without the iOS page slide, for every
  text field, textarea, and money field. `fields.tsx` holds `StillInput` and
  `StillTextarea`, and `CurrencyInput` turns it on by default; both use
  `use-still-field.ts` (`useStillField`), which composes `tap.ts` (a tap becomes
  a no-scroll focus), `park.ts` (`focusStill`, parking the field off-screen
  behind a stand-in while the keyboard opens), `veil.ts` (a transparent field
  for focus iOS moves itself, such as the keyboard arrows), `pin.ts` (undoes the
  page scroll the browser makes to reveal the caret after an edit),
  `hold-viewport.ts` (stops a drag outside any scroll container from panning the
  screen while the keyboard is up), `keyboard-swap.ts` (holds the border fade
  until iOS has swapped to another keyboard), and `reveal.ts` with
  `scroll-room.ts` (the smooth scroll of the field's `data-still-scroller`
  container that clears the keyboard, after any transition moving it has
  finished). `stand-in.ts` holds the shared stand-in state, and `press.ts`
  (`focusKeepingPress`) the press handlers for a button that acts without taking
  focus from the field, used by the operator bar and the chat's send button.
  `src/components/ui/on-screen-keyboard.ts` is the keyboard-up test it shares
  with `keyboard-fit/`. `docs/agents/design/budget-and-inputs.md` holds the
  contract.
- `src/components/ui/currency-input/` — the shared money field: `index.tsx`
  holds ATM-style cents entry and the calculator expression state,
  `expression-edit.ts` the end-of-text expression edits, `operator-bar.tsx` the
  one shared `CalculatorBar` docked above the on-screen number pad (mounted in
  `providers.tsx`), and `calculator-store.ts` the store through which the
  focused input hands it its state. `docs/agents/design/budget-and-inputs.md`
  holds its contract.
- `src/components/ui/sheet.tsx` — animated, scroll-contained sheets dismissed by
  drag, tapping outside, or Escape, with no visible close control.
  `src/components/ui/keyboard-fit/` (`useKeyboardFit`) pads a mobile sheet's
  bottom by however far the on-screen keyboard covers it while one of its fields
  has focus, measured as the keyboard comes up and held until it goes down, so
  the sheet stays put, grows if it is short, and its body ends above the
  keyboard; `motion.ts` holds the keyboard's fitted motions
  (`keyboardTransition`) and `keyboardCover`, `shield.ts` moves a white strip, a
  fixed layer at the bottom of the screen in front of the sheet, with the
  keyboard, so nothing shows through its translucent glass, and `pending.ts`
  tells still focus how much further a growing sheet will rise and how tall its
  body will settle, so a field is revealed alongside the keyboard and lent
  scroll room glides back to the right end.
  `docs/agents/design/sheets-and-menus.md` holds both contracts.
- `src/components/ui/hold-menu/` — the iOS-style touch-and-hold context menu.
  `index.tsx` is the `useHoldMenu` hook (open state, trigger props, held-finger
  selection, focus restore), `surface.tsx` the Radix Dialog layer with the
  lifted row clone and action panel, `press.ts` the hold timer and held-pointer
  tracking, and `layout.ts` the placement math.
  `src/components/shared/transaction-hold-menu.tsx` builds the Edit, Duplicate,
  and Delete actions shared by the Transactions page and the line-item detail,
  whose rows both render `transaction-row.tsx`.
- `src/components/ui/continuous-corners/` — iOS-style continuous corners:
  `attach.ts` is the shared per-element core, `index.tsx` exports the
  `useContinuousCorners` hook and `ContinuousControls` (mounted once in
  `providers.tsx`, owns the button selector list), and `geometry.ts` holds the
  superellipse corner, capsule-end, and sliver-clip math. The global
  `corner-shape` rule and its circle/pill opt-out list live in
  `src/app/styles/tokens.css`.
- `src/components/ui/sortable-list/` — `index.tsx` holds long-press activation,
  keyboard reordering, and the hook surface; `drag.ts` the pointer drag, list
  reflow, and edge auto-scroll; `preview.ts` the lifted drag copy.
- `src/app/safe-area-launch.ts` — the inline head scripts in `layout.tsx`: the
  launch backup for a late `env(safe-area-inset-top)` (saved height, or a
  first-launch hold) and the landscape Dynamic Island side (`data-island`).
  `docs/agents/design/shell-and-platform.md` holds the contract.
- `src/app/globals.css` — the Tailwind import and the ordered `@import` list
  only.
- `src/app/styles/` — the rules, split by area (`tokens`, `app-shell`, `budget`,
  `navigation-detail`, `sheets-and-forms`, `transactions`, `income`, `organize`,
  `settings`, `sign-in`, `assistant`, `assistant-ship`, `hold-menu`,
  `currency-calculator`, `responsive-motion`). **The import order in
  `globals.css` is the cascade order.** Later files intentionally override
  earlier ones, so never reorder the imports, and add a new area file at the
  position its specificity requires — `responsive-motion.css` must stay last.
