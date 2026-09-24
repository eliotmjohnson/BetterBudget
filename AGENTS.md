<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Better Budget Agent Guide

This file is the durable engineering handoff for Better Budget. Read it before changing application code, database behavior, deployment configuration, or product copy. Preserve the generated Next.js block above exactly; `next dev` may regenerate it.

## How to use this guide

This file is loaded into every session. It holds the durable guardrails,
invariants, conventions, and verification contract. Longer reference material
lives alongside it and should be read when the work touches it:

| Read before                                                     | File                                   |
| --------------------------------------------------------------- | -------------------------------------- |
| Adding or reshaping a user-facing capability                    | `docs/agents/product.md`               |
| Changing layout, motion, gestures, sheets, or navigation detail | `docs/agents/design.md`                |
| Writing or changing any mutation                                | `docs/agents/persistence.md`           |
| Changing deployment, infrastructure, or the production runtime  | `docs/agents/deployment.md`            |
| Formatter/linter config, size budgets, comments, or releasing   | `docs/agents/conventions.md`           |
| Operating, rolling back, or replacing the production host       | `docs/aws/ec2-cloudfront-migration.md` |
| Setup, environment variables, and troubleshooting               | `README.md`                            |

`README.md` is the human-facing setup and operations manual. This file is the
engineering contract. When behavior changes, update whichever of the two
actually documents it rather than restating it in both.

## Product brief

Better Budget is a mobile-first, installable household budgeting PWA inspired by envelope and zero-based budgeting. Version 1 intentionally serves one household through one shared owner login. It prioritizes instant-feeling interactions, exact financial calculations, clear month-to-month planning, and provider-neutral container deployment.

Each calendar month holds its own budget built from household-scoped category and budget-item definitions with per-month participation, plans, and carryover settings. Months that are only viewed persist nothing; the first mutation that needs a month creates it atomically. Transactions are expenses and refunds with exact splits, while expected-income plans and received-income receipts stay separate from them.

Read `docs/agents/product.md` for the complete implemented-capability inventory before adding, removing, or reshaping a user-facing capability.

## Version 5 assistant release

Version `5.0.0` adds Better Buddy, an optional budget assistant: a draggable floating robot button on every authenticated page that opens a chat driven by Claude Haiku 4.5. It answers questions about the household's budget and commits basic changes. The Version 1 financial model, database schema, authentication model, and every Version 2–4 deployment rule are unchanged.

These rules are load-bearing:

- **Assistant writes go through `applyBudgetMutation`.** Every tool builds a `BudgetMutation`, parses it with `mutationSchema`, and commits it with a fresh `clientMutationId` and the `expectedVersion` from a snapshot read immediately before. Never give the assistant a write path around the mutation service, and never add a tool for archiving, deleting definitions, copying, clearing, resetting, reordering, or deleting income without explicit user direction.
- **Assistant writes are server-confirmed.** The client applies no optimistic patch; it invalidates every cached `budget-snapshot` query after a turn that reports changed months, because carryover can move later months.
- **The cached prefix is frozen.** `SYSTEM_PROMPT` and `ASSISTANT_TOOLS` must contain no per-request value and must keep a deterministic order, and together they must stay above Haiku 4.5's 4,096-token minimum cacheable prefix, or every request pays full input price. Today's date and the viewed month travel in a text block at the start of each person turn instead. The server warns `prompt cache unused` when a response reads and writes no cache.
- **The conversation is client-held and stateless on the server.** The browser sends the whole message history each turn; the route validates its shape and size, and the household always comes from the session. Tool results the client sends back only affect the model's context, never authorization.
- **The assistant is off without `ANTHROPIC_API_KEY`.** The button is not rendered and the route answers `unavailable`. Production validation rejects a placeholder key and accepts an absent one. With a key, the Settings **Better Buddy** switch hides or shows it per device through the `better-budget-assistant-v1` cookie (`parseAssistantPreference` in `src/domain/budget-preferences.ts`); that switch is a display preference, not an access control. Beaming Better Buddy up to his spaceship writes the same preference through the same `changeAssistantEnabled` handler in `app-client.tsx`, so the two can never disagree.
- **Replies are plain text.** The chat renders no Markdown, so the prompt forbids it and `run.ts` strips `**`/`__` emphasis from model text before it is shown or stored in the history.
- **Production egress is IPv6 NAT on the Docker network.** The host has no IPv4 egress, so `bootstrap-ec2.sh` gives the `better-budget` network IPv6 with Docker's `ip6tables` NAT. Enabling IPv6 forwarding stops `systemd-networkd` accepting the router advertisements that keep the host's own IPv6 address and route alive, so the `IPv6AcceptRA=yes` drop-in must be installed first; without it the host loses IPv6, and with it Systems Manager and ECR, within minutes. `docs/agents/deployment.md` records the order.

Keep the model on the cheapest current Claude model with thinking omitted unless the user directs otherwise, and keep the per-turn call cap, the conversation cap, and the per-household rate limit.

## Version 4 deployment release

Version `4.0.0` moved the production host from an x86_64 `t3a.micro` to an arm64 `t4g.nano`. There is no application-source change. The Version 1 product, financial model, authentication model, database schema, and provider-neutral runtime image are unchanged, as is every Version 3 database, TLS, IPv6, and backup rule.

GitHub Actions builds `linux/arm64` only, natively on a GitHub-hosted `ubuntu-24.04-arm` runner. Do not reintroduce `linux/amd64` or QEMU emulation: nothing in the fleet can run an amd64 image, and the emulated build was slow enough to be abandoned during the migration. If an x86 host ever becomes a real rollback target again, add a second native job rather than emulating.

`scripts/aws/bootstrap-ec2.sh` is sized for 512 MiB. PostgreSQL runs with `shared_buffers=32MB`, `max_connections=10`, and a 192 MiB container limit; the application container has a 320 MiB limit and a 256 MiB V8 old-space limit. If the application restarts under memory pressure, lower `shared_buffers` further or resize the instance to `t4g.micro` — a stop, change-type, and start, since the architecture is unchanged. Do not remove the container limits.

Four host facts are load-bearing and easy to violate:

- A fresh host pulls the seed image tag in `bootstrap_host()` before any deployment runs. That tag must name a commit whose ECR image includes an arm64 manifest, or the host fails its first pull with no matching manifest.
- Deployment requires exactly one _running_ instance carrying both production tags. Two running hosts fail every deployment; a stopped host is invisible and is the rollback.
- Data Lifecycle Manager selects volumes by the `Backup=daily` tag. A replacement root volume without that tag is never snapshotted and nothing reports it.
- The deployment helper refuses an image whose architecture does not match the host. A wrong-architecture image pulls successfully and only fails at exec time, so without that check it overwrites the working tag and crashloops with no usable rollback target. This took production down once during the Version 4 migration.

The instance uses Unlimited CPU credits. Standard credits throttle a `t4g.nano` partway through a deployment and roll back a working image; the surplus charge is cents a month at this traffic. Do not switch it back to Standard as a cost measure.

Read `docs/agents/deployment.md` before changing deployment, infrastructure, or the production runtime. `docs/aws/ec2-cloudfront-migration.md` remains the authoritative live-resource, operations, rollback, and replacement-host runbook.

## Version 3 deployment release

Version `3.0.0` replaced the managed RDS database with a PostgreSQL 17 container on the existing EC2 host. The Version 1 product, financial model, authentication model, database schema, and provider-neutral runtime image are unchanged. The only application-source change is a guard in `src/db/index.ts` that skips development seeding during owner bootstrap.

The verified-TLS contract is unchanged and must stay that way: production still requires `DATABASE_SSL=verify-full` and a trusted CA bundle. The CA is now a private authority generated for this deployment instead of an Amazon bundle, which is precisely why `runtime-environment.mjs` needed no change. Do not weaken it to `require` or `disable` for a host-local database.

The database is reachable from outside AWS over IPv6 only, gated by a security-group rule scoped to one personal `/64`. This one inbound port is deliberate and user-directed — it replaced a billed public IPv4 endpoint with an unbilled one — and is not drift to be corrected. No Better Budget resource has a public IPv4 address.

Backups are daily crash-consistent EBS snapshots of the root volume, retained seven days. There is no logical dump on a schedule and no point-in-time recovery, so take a manual `pg_dump` before anything destructive.

Do not reintroduce ECS, an ALB, NAT, SSH, RDS, or a public IPv4 address without explicit user direction, and do not treat the infrastructure change as authorization to relax any Version 1 boundary below.

Read `docs/agents/deployment.md` before changing deployment, infrastructure, or the production runtime. `docs/aws/ec2-cloudfront-migration.md` remains the authoritative live-resource, operations, rollback, and replacement-host runbook.

## Version 2 deployment release

Version `2.0.0` changed the AWS production deployment only, moving from ECS Express to a private EC2 host behind a CloudFront VPC origin. The Version 1 product, financial model, authentication model, database schema, and provider-neutral runtime image were unchanged. Version 3 superseded its RDS database.

## Version 1 boundaries

Do not silently expand the product into any of the following without explicit user direction:

- Bank syncing or account reconciliation.
- Recurring-transaction automation.
- Imports or exports beyond the Settings JSON backup (no CSV, bank, or third-party formats).
- Multi-currency storage or conversion.
- Notifications.
- WebSocket or realtime server push.
- Queued offline financial writes.
- Multiple households, invitations, or role-based household access.
- Native iOS or Android clients.

USD and `America/Chicago` are the version 1 defaults.

## Approved product design

Approved visual references live in `docs/design/`: `budget-responsive.png`, `brand-system.png`, `transactions.png`, and `auth-income-organizer.png`.

The visual system is deliberately iOS-like and restrained, built on cornflower blue `#1769E0` with pastel semantic accents, rounded cards, tactile sheets, a mobile bottom navigation, and a desktop left-nav/budget/rail layout. Interactive targets are at least 44 px, with safe-area padding, keyboard focus management, accessible status announcements, and reduced-motion support. Do not replace the established brand or visual language with a generic dashboard theme. Extend existing primitives and tokens first.

Read `docs/agents/design.md` for the palette, reference viewports, and the full layout, motion, gesture, sheet, swipe, reordering, and navigation-detail interaction contracts before changing any of them.

## Technology and runtime

The repository currently uses:

- Node.js 24 or newer.
- npm 11.
- Next.js 16 App Router and React 19.
- Strict TypeScript.
- Tailwind CSS 4.
- Radix UI primitives.
- TanStack Query for the hydrated client snapshot and mutation lifecycle.
- Drizzle ORM and SQL migrations.
- PGlite for the default local database.
- PostgreSQL 17 for integration/production parity.
- Zod for boundary validation.
- The Anthropic TypeScript SDK for the optional budget assistant (Claude Haiku 4.5).
- Better Auth for email/password sessions.
- Prettier 3.9.6 for repository-wide source and documentation formatting.
- ESLint Stylistic 5.10.0 for autofixable structural whitespace rules that do not overlap the Prettier style contract.

Dependency versions are pinned by `package-lock.json`. Use npm consistently and do not introduce another package-manager lockfile. Before introducing or changing a dependency, determine whether an existing dependency or platform primitive already solves the problem.

## Important repository paths

Source lives under `src/`: `app/` routes and route handlers, `domain/` exact money and calculations, `db/` Drizzle schema and seeding, `lib/` Better Auth wiring, `server/` authoritative services. Components are grouped by view — `components/budget/`, `income/`, `organize/`, `transactions/`, `settings/`, `assistant/` — alongside `components/shell/` (the authenticated shell, query lifecycle, and optimistic patches), `components/shared/` (primitives more than one view needs), and `components/ui/` (view-agnostic primitives). Supporting directories are `scripts/`, `drizzle/`, `public/`, `docs/agents/`, `docs/design/`, `docs/aws/`, and `.github/workflows/`, plus `Dockerfile`, `compose.yaml`, and `runtime-environment.mjs`.

High-impact files:

- `src/domain/money.ts` — parsing, formatting, exact cent operations.
- `src/domain/uuid.ts` — `createUuid()` for secure production and plain-HTTP LAN development.
- `src/domain/calendar.ts` — `APP_TIME_ZONE`, the default current-month key, month-date helpers.
- `src/domain/budget-calculations.ts` — authoritative and optimistic totals/carryover.
- `src/domain/types.ts` — snapshot and domain contracts.
- `src/db/schema.ts` — relational structure and database constraints.
- `src/db/index.ts` — PGlite/PostgreSQL selection and initialization.
- `src/db/household.ts` — single-household identity, owner bootstrap membership.
- `src/db/seed.ts` — development data for the current and previous month. Merchants, amounts, and structure are fixed; only the calendar months follow today's date.
- `src/server/mutation-schema.ts` — validated mutation contracts.
- `src/server/budget-service.ts` — the mutation entry point: idempotency receipts, the database transaction, cross-cutting month validation, the typed dispatcher, and error mapping.
- `src/server/budget-mutations/` — one module per mutation family, each handler taking a `MutationContext`: `plans.ts` (plan amount, carryover), `transactions.ts` (add/update/delete/undo, splits, cross-month moves), `income.ts` (plans and receipts), `structure.ts` (categories, items, archive/delete, reordering), `reassignment.ts` (moving an archived definition's activity and plan), `active-items.ts` (the shared archived-as-of-month condition), `month-operations.ts` (note, copy, clear, reset), `context.ts` (shared `MutationContext`/`ensureMonth`). Read only the family you are changing.
- `src/server/backup/` — the Settings JSON backup behind `/api/backup`. `schema.ts` validates the file (exact split sums, in-month dates, internal references), `export.ts` builds it, `import-replace.ts` clears the household's budget rows, and `import-merge.ts` plus `import-activity.ts` add whatever the household lacks. Replace is clear-then-merge inside one transaction.
- `src/server/month-snapshot/` — canonical month snapshot read path. `index.ts` is orchestration only; `queries.ts` holds every database read, `carryover.ts` the chronological carryover chains and balance derivation, `assemble.ts` the category, activity, and receipt view assembly.
- `src/server/mutation-failures.ts` — mutation-failure class, not-found/conflict helpers.
- `src/server/assistant/` — the budget assistant. `run.ts` is the Claude tool loop and model settings, `prompt.ts` the frozen system prompt, `tools.ts` the frozen tool definitions, `execute.ts` the tool dispatcher and read tools, `history.ts` the multi-month history read tool, `budget-tools.ts` and `transaction-tools.ts` the write tools, `commit.ts` the shared mutation, money, and month helpers, `resolve.ts` name and transaction-ref resolution, `render.ts` the compact text the model reads, `conversation-schema.ts` the request contract, `config.ts` the key-presence switch, and `rate-limit.ts` the per-household turn guard. `src/app/api/assistant/route.ts` is the endpoint.
- `src/server/definition-usage.ts` — later-month activity and never-used (permanently deletable) status per definition, shared by the snapshot and the hard-delete handlers.
- `src/components/shell/use-budget-data.ts` — hydration, retry, reconciliation, sync state.
- `src/components/shell/optimistic.ts` — optimistic cache patches: clones the snapshot and delegates to `optimistic-patches/`, which mirrors `budget-mutations/` one file per mutation family.
- `src/components/shell/pull-to-refresh.tsx` — the per-tab pull-to-refresh indicator, refresh lifecycle, and status announcement; `pull-gesture.ts` observes the native elastic overscroll and holds the pull state machine.
- `src/components/shell/app-client.tsx` — authenticated interactive shell; `app-shell.tsx`, `budget-route.tsx`, `month-picker.tsx`, and `month-actions-sheet.tsx` are the surrounding chrome.
- `src/components/budget/budget-view.tsx` — Budget page layout, URL-backed line-item details, item-scoped add-transaction flow. `budget-category-section.tsx` renders a category and its items, `budget-summary-card.tsx` the arc and balance, `budget-structure-editor.ts` owns the category/item sheet state that `budget-structure-sheets.tsx` renders, and `carryover-coin.tsx` draws the logo's dollar coin (paths exported from `src/components/brand-mark.tsx`) that caps the progress bar of an item whose carryover is on.
- `src/components/budget/budget-item-editors.tsx` — plan input, item edit/detail components; `item-remaining-summary.tsx` the remaining-this-month card and the compact strip that docks under the detail header.
- `src/components/income/income-view.tsx` — Income page: expected-income plans and received-income receipts. `income-source-details.tsx` is the pushed detail, `income-forms.tsx` the add-source and record-income sheets, `income-fields.tsx` the shared title, plan-amount, and appearance inputs.
- `src/components/organize/organizer-view.tsx` — category and item structure editing, drag reordering, archive/delete; `organizer-category-section.tsx` renders one category and its items.
- `src/components/transactions/transactions-view.tsx` — activity scoping, search, inline filters, filter-sheet drafts, applied-filter clearing; `transaction-sheet.tsx` and `transaction-allocation-picker.tsx` are the add/edit flow.
- `src/components/shared/detail-history.ts` — the shared URL-plus-history-state contract behind every pushed detail view; Budget and Income both build one with `createDetailHistory`. `delete-definition-sheet.tsx` is the Budget-page and organizer delete flow that moves a definition's activity and plan to another item. `use-versioned-draft.ts` keeps inline amount edits and their `expectedVersion` stable across background refetches. `category-icon.tsx`, `category-details-fields.tsx`, `transaction-icon.tsx`, and `budget-view-helpers.ts` are the other cross-view primitives.
- `src/components/assistant/` — `assistant-launcher.tsx` is the draggable floating button, rendered through `AppShell`'s `floating` slot so it sits outside the animated page content, `launcher-throw.ts` its release-velocity projection and settle spring, `buddy-protest.tsx` the fall and speech bubble after a hard throw, `buddy-ship.tsx` the spaceship that beams him away (art in `better-buddy-ship.png` and `better-buddy-ship-beam.png`, styles in `src/app/styles/assistant-ship.css`), `better-buddy.png` the transparent 256 px robot icon cut from the approved artwork, `better-buddy-figure.tsx` the floating robot with its gradient halo and floor shadow, `assistant-sheet.tsx` the chat sheet, `keyboard-layout.ts` the chat's on-screen-keyboard fit and motion, and `use-assistant.ts` the in-memory conversation and snapshot invalidation. Styles live in `src/app/styles/assistant.css`. `src/components/settings/settings-assistant-section.tsx` is the Settings switch.
- `src/components/ui/navigation-detail/` — mobile push navigation, fixed detail chrome, modal fallback. `index.tsx` is the component, `edge-drag.ts` the edge-swipe dismissal gesture, `title-motion.ts` the collapsing-title machinery, `summary-motion.ts` the scroll-scrubbed summary strip docked under the collapsed header.
- `src/components/ui/left-edge-gesture-guard.tsx` — global Safari left-edge history-gesture suppression.
- `src/components/ui/sheet.tsx` — animated, scroll-contained, drag-dismissible sheets.
- `src/components/ui/hold-menu/` — the iOS-style touch-and-hold context menu. `index.tsx` is the `useHoldMenu` hook (open state, trigger props, held-finger selection, focus restore), `surface.tsx` the Radix Dialog layer with the lifted row clone and action panel, `press.ts` the hold timer and held-pointer tracking, and `layout.ts` the placement math. `src/components/shared/transaction-hold-menu.tsx` builds the Edit, Duplicate, and Delete actions shared by the Transactions page and the line-item detail, whose rows both render `transaction-row.tsx`.
- `src/components/ui/continuous-corners/` — iOS-style continuous corners: `attach.ts` is the shared per-element core, `index.tsx` exports the `useContinuousCorners` hook and `ContinuousControls` (mounted once in `providers.tsx`, owns the button selector list), and `geometry.ts` holds the superellipse corner, capsule-end, and sliver-clip math. The global `corner-shape` rule and its circle/pill opt-out list live in `src/app/styles/tokens.css`.
- `src/components/ui/sortable-list/` — `index.tsx` holds long-press activation, keyboard reordering, and the hook surface; `drag.ts` the pointer drag, list reflow, and edge auto-scroll.
- `src/app/safe-area-launch.ts` — the inline head scripts in `layout.tsx`: the launch backup for a late `env(safe-area-inset-top)` (saved height, or a first-launch hold) and the landscape Dynamic Island side (`data-island`). `docs/agents/design.md` holds the contract.
- `src/app/globals.css` — the Tailwind import and the ordered `@import` list only.
- `src/app/styles/` — the rules, split by area (`tokens`, `app-shell`, `budget`, `navigation-detail`, `sheets-and-forms`, `transactions`, `income`, `organize`, `settings`, `sign-in`, `assistant`, `assistant-ship`, `hold-menu`, `responsive-motion`). **The import order in `globals.css` is the cascade order.** Later files intentionally override earlier ones, so never reorder the imports, and add a new area file at the position its specificity requires — `responsive-motion.css` must stay last.

### Navigating without reading whole files

No source file exceeds the 500-line budget, so a full read is affordable — but
most tasks still need one region. Locate it first, then read that range with an
offset:

```bash
grep -n '^function \|^export function ' src/components/budget/budget-view.tsx
grep -rn '\.class-name' src/app/styles/                # which stylesheet owns it
```

Two surfaces are split by family rather than by size, so read only the file you
are changing: `budget-service.ts` dispatches into `src/server/budget-mutations/`,
and `optimistic.ts` into `src/components/shell/optimistic-patches/`. The two
directories mirror each other — a mutation's server handler and its optimistic
patch live in the same-named file on both sides, and a change to one usually
needs the other.

Line numbers move, so derive them per session rather than trusting a stored map.

## Architecture

Authenticated initial reads are Server Components. The server builds a canonical month snapshot, dehydrates it into TanStack Query, and focused Client Components use that snapshot as the interactive source for the current budget, income, and activity.

Internal route handlers expose Zod-validated request/response contracts. Mutations return discriminated success responses or stable error kinds such as `validation`, `conflict`, `target_not_empty`, `split_mismatch`, `offline`, and `not_found`. Keep errors stable and actionable; do not leak raw database messages to the UI.

Pure financial helpers are shared by optimistic client code and authoritative server services. Never duplicate budget arithmetic inside components or route handlers.

The database adapter is selected through `DATABASE_KIND`:

- `pglite` is the default and persists under `.data/pglite`.
- `postgres` uses `DATABASE_URL` and the production-compatible Drizzle/PostgreSQL path.

The default PGlite path is automatically migrated and deterministically seeded.
Production initialization never invokes the development seed. Production startup requires PostgreSQL, migration prestart, verified TLS with a trusted CA bundle, an HTTPS Better Auth origin, a non-placeholder auth secret, and disabled auth-bypass guards. `runtime-environment.mjs` is the shared validation and PostgreSQL connection source for the application, migrations, and owner bootstrap; do not duplicate or weaken those rules.

Pushes to `main` deploy the regular runtime target through GitHub Actions and
Systems Manager. The EC2 host, its application service, and its PostgreSQL
service are all initialized by `scripts/aws/bootstrap-ec2.sh`, which GitHub
Actions never deploys: host-script changes must be installed over Systems
Manager separately. Never add long-lived AWS credentials or
production application secrets to GitHub, persist secret values on the host,
add SSH access, or bypass the host deployment helper. `docs/agents/deployment.md`
holds the pipeline, OIDC trust, and host contracts; read it before changing any
of them.

## Financial invariants

These are product correctness requirements, not implementation preferences:

1. Store money as signed `bigint` cents. Serialize cents over application boundaries as base-10 strings. Never store or calculate financial values using JavaScript floating-point numbers.
2. Use the branded `MonthKey` form `YYYY-MM` for month identity. Validate it at boundaries.
3. `Left to budget = expected income - planned amounts`.
4. Received income is an actual-cash total and remains separate from expected income and left-to-budget math.
5. `Available = planned - net spending + carry in`. Carry in is the immediately previous month's ending available balance only when that previous month's carryover setting is enabled and the item exists in both adjacent months.
6. Net spending treats refunds/credits as reductions in spending.
7. Carry both positive and negative balances. Derive carryover through chronological history so editing an older plan or transaction changes every affected later month.
8. Carryover is configured per budget item per month as an outbound setting. Changing a month's setting controls only whether its ending balance flows into the next month; it does not change its inbound balance or overwrite future-month settings. Category and item definitions persist at household scope, while category participation and item plans remain month-specific.
9. Every expense/refund owns at least one allocation. An unsplit transaction still has exactly one allocation. Allocation cents must sum exactly to the transaction total.
10. Transaction direction, total, date, allocations, and relevant month changes must be validated and committed atomically.
11. Moving an entry to another month is server-confirmed and requires valid destination allocations. Destination items are resolved by the shared household definitions, not by trusting stale client plan identifiers.
12. Copy only the immediately preceding calendar month, only when its source has active category/item structure or an expected-income plan, and only into a target that has no active plan or activity. Archived category/item definitions and soft-deleted transactions do not make an otherwise empty target ineligible.
13. A month copy includes category/item structure, ordering, planned amounts, expected-income plans, and carryover settings. It never copies expense/refund transactions or received-income receipts.
14. Clearing a month resets planned amounts while preserving activity, structure, received-income receipts, and carryover settings. Resetting a budget permanently removes only the selected month's structure, plans, transactions, income activity, and note while preserving every other month and its definitions. Category and item definitions left unused across all months by the reset are permanently deleted. Deleting a received-income receipt soft deletes it and updates actual-cash totals; deleting an income source requires its active receipts to be deleted first.
15. Archiving retains history. Deleting a category or item archives it from the selected month onward, so its active transactions in that month and every later month must first move to a live destination item, resolved per month by household definition; the server refuses the archive with `target_not_empty` otherwise, because hidden allocations would silently drop out of Spent. Moved allocations merge into an existing split on the destination, and the plan moves too when requested. Undo cannot restore a soft-deleted transaction whose item was archived for its month. Hard deletion is only valid for definitions that have never been used: budgeted in no month other than the selected one and never allocated to any transaction, including soft-deleted ones.
16. Financial multi-row writes, reorder operations, month copying, and archival must run in database transactions.

When changing any of these rules, update the shared domain functions, server services, API validation, optimistic patches, README, and this guide together.

## Eager and optimistic persistence

The app is designed to feel immediate. Safe changes should update the visible query snapshot within one animation frame, then persist quietly.

Every mutation must include a unique `clientMutationId`, the affected entity's `expectedVersion` when the action directly edits versioned state, and the complete data needed for deterministic optimistic calculation and server validation. The backend writes completed mutation receipts in the same database transaction as the financial mutation, so retrying the same mutation ID returns its existing result and never duplicates transactions, income receipts, splits, or month copies.

Read `docs/agents/persistence.md` before writing or changing any mutation. It holds the safe-versus-server-confirmed operation lists, the mutation lifecycle rules, cross-device convergence behavior, and the non-production failure-scenario panel.

## Data model expectations

The schema includes Better Auth tables plus indexed application tables for:

- Households and members.
- Budget months.
- Category definitions.
- Monthly budget-category structure associations.
- Budget-item definitions.
- Monthly budget-item plans.
- Expected-income plans.
- Received-income receipts.
- Expense/refund transactions.
- Transaction allocations/splits.
- Idempotent mutation receipts.

Use UUID identifiers, indexed foreign keys, household/month uniqueness, exact constraints, PostgreSQL `date` values for financial dates, `timestamptz` audit fields, archive/delete timestamps, integer sort positions, and monotonically incremented integer versions.

Do not edit an existing applied SQL migration to change production behavior. Change `src/db/schema.ts`, generate a new migration, inspect the SQL, and verify it against an empty PGlite database and PostgreSQL. Production migration prestart is advisory-lock protected.

## Authentication and access

Better Auth email/password sessions protect application and internal API routes. Public sign-up is disabled. Only the `db:owner` npm lifecycle may activate the bootstrap sign-up path. `npm run db:owner` idempotently creates or reuses the one shared owner from `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD`, creates the empty default household when needed, and ensures its `household_members` owner record. It must refuse a different owner after the household is claimed. The dedicated `owner-bootstrap` Docker target makes this command runnable as a one-time container without adding source or development tooling to the regular runtime image.

Development defaults to `AUTH_BYPASS=true`. This is for local development only. Production deliberately rejects insecure bypass unless the explicit local-only guard is also enabled. Never weaken that guard or deploy with either bypass flag enabled.

All authenticated reads and writes must resolve the current user's owner membership for the fixed version 1 household on the server. Development bypass may resolve that same fixed household directly. Client-provided household IDs are not authorization.

## Commands and local workflows

```bash
npm run verify          # format:check + typecheck + lint, the usual gate
npm run verify:fix      # lint:fix + format, then the gate
npm run build           # only for application, dependency, or build changes
npm run db:inspect      # months, planned/spent totals, transaction counts
npm run db:reset && npm run db:migrate && npm run db:seed
```

`README.md` holds the full command catalogue, environment variables, and
database workflows. The details that are easy to get wrong:

- `npm run dev` uses file-persistent PGlite unless environment variables override it. `npm run dev:mobile` binds all interfaces; `next.config.ts` discovers active IPv4 hosts at startup, so restart it after network changes.
- Client code must use `createUuid()` from `src/domain/uuid.ts` instead of `crypto.randomUUID()`. Mobile browsers withhold secure-context crypto over plain-HTTP LAN addresses.
- `npm run db:generate` writes a migration from `src/db/schema.ts`. Inspect the SQL before applying it.
- `npm run db:reset` only resets the local `.data` PGlite target; it refuses production and PostgreSQL.
- `NODE_OPTIONS=--conditions=react-server` in the database scripts is intentional: server-only modules are imported outside the Next.js process.
- Next.js loads `.env.local` for development and builds, but the production preflight before `npm start` and the standalone `db:*` scripts do not. Export or prefix their variables.
- `npm audit` reports four moderate entries from one development-only `drizzle-kit -> @esbuild-kit -> esbuild@0.18.20` chain. The user prefers no npm overrides; leave it until Drizzle Kit fixes it upstream.

## Release versioning

`package.json` is the canonical application version. Keep its version and the
root package versions in `package-lock.json` synchronized. Starting from
`1.0.0`, every completed application change set must receive exactly one
Semantic Versioning bump before handoff:

- **Patch** (`x.y.Z`) for backward-compatible bug fixes, security fixes,
  accessibility or visual corrections, performance improvements, internal
  refactors, and shipped build/configuration corrections.
- **Minor** (`x.Y.0`) for backward-compatible product capabilities, routes,
  workflows, API additions, or data-model additions.
- **Major** (`X.0.0`) for incompatible API, data, authentication, deployment,
  or user-workflow changes that require migration or coordinated adoption.

When one change set contains multiple kinds of work, apply the highest required
bump once. Do not bump for read-only investigation or changes limited to
documentation, comments, formatting, or generated development state. The
Settings page receives the version from `package.json` at build time.

A major release must also add a new version section to both `README.md` and this
guide, preserving earlier sections as a historical record.
`docs/agents/conventions.md` lists what that section must document.

## Traps that produce wrong conclusions

Each of these has caused a confident, incorrect verification. Check them before
trusting a local result.

- **A second `next dev` exits, but the port still answers.** `npm run dev` fails
  with `Another next dev server is already running` and exits, while
  `curl localhost:3000` keeps returning 200 from the _other_ server. A passing
  request is therefore not proof your code is running. Confirm with
  `ps aux | grep "next dev"` and read the dev log before trusting any HTTP check.
- **PGlite allows one process on `.data/pglite`.** Querying the directory from a
  second process while a dev server holds it returns inconsistent state. Stop
  the server first, or read through the running app's API instead.
- **`npm run db:reset` is undone by a running dev server.** The server keeps its
  own in-memory state and writes it back over the fresh seed. Stop every dev
  server before resetting, then reseed.
- **`npm run build` rewrites `next-env.d.ts`** to its production form. Run
  `git checkout -- next-env.d.ts` afterward instead of committing the flip.

## Verification expectations

There is intentionally no unit, component, or end-to-end test suite. Do not add automated test dependencies, configuration, or files unless the user explicitly changes that decision.

Meaningful application changes normally require:

```bash
npm run verify:fix      # lint:fix + format, then format:check + typecheck + lint
npm run build           # application, dependency, or build-configuration changes
```

`npm run verify` is the read-only gate on its own. Run `lint:fix` before
`format` — ESLint's structural fixes can add or remove blank lines that Prettier
must then normalize, which is why `verify:fix` orders them that way.

`npm run build` rewrites the generated `next-env.d.ts` to its production form and `next dev` restores the development form, so the file appears modified after every build. Run `git checkout -- next-env.d.ts` after building instead of committing the flip; the `/handoff` command does this automatically.

Database or container changes also require PostgreSQL parity, empty-database migration, and health checks. Manually exercise the affected user flow and report what was checked, especially for exact-money, carryover, split, retry, conflict, and authorization behavior.

The acceptance target for safe actions is a visible update in under 100 ms without a global spinner, followed by eventual equality with the authoritative snapshot.

## Code conventions

- Prettier owns formatting and ESLint Stylistic owns structural whitespace. Run `npm run verify:fix` rather than hand-formatting, and never introduce a conflicting formatter without explicit user approval. `docs/agents/conventions.md` has the full split and the rules each tool owns; read it before changing formatter or linter configuration.
- Size and complexity budgets are enforced by ESLint: 500 lines per file, plus 150 lines per function and complexity 30 in `.ts`. `crypto.randomUUID()` is banned in `src/components/**` (use `createUuid()`) and `parseFloat` in the money modules. When a limit is hit, split the file or extract the function — do not raise the cap and do not add a per-file override; there are none, and the budgets stop being budgets the moment one is added. `docs/agents/conventions.md` has the full table and the two splitting patterns this codebase uses.
- Keep TypeScript strict. `noUnusedLocals` and `noUnusedParameters` are enabled so dead local declarations and parameters fail type checking. Avoid `any`; narrow `unknown` at boundaries, keep exports limited to real module consumers, and remove obsolete helpers instead of preserving speculative APIs.
- Prefer small pure functions, discriminated unions, branded identifiers, and exhaustive switches.
- Validate environment variables and every untrusted request payload.
- Keep money and calendar logic in `src/domain/`, not in JSX.
- Keep database operations in server/database modules; never import server-only code into Client Components.
- Prefer Server Components for authenticated initial reads and focused Client Components for stateful interactions.
- Keep query keys, invalidation, and optimistic patches narrow enough that one failed mutation cannot roll back unrelated changes.
- Use stable error codes in contracts and translate them into concise user-facing copy at the UI edge.
- Preserve accessibility semantics when composing Radix primitives and custom sheets.
- Source code carries no comments except JSDoc, in every language — TypeScript, CSS, and configuration. Rename, extract, or restructure until the code says it; whatever still needs explaining (a financial invariant, an ordering guarantee, a browser workaround, a cross-file coupling, a tuned constant) goes into `README.md`, this guide, or the owning `docs/agents/` reference in the same change. Lint suppressions state their reason after `--` in the directive itself. Comments that predate this rule move into the documentation when their code is next touched. `docs/agents/conventions.md` holds the full rule and the JSDoc bar.
- Do not perform broad mechanical rewrites or unrelated restyling while fixing a focused issue.
- Preserve user data and existing migrations. Never make reset/seed behavior available in production.

## Docker constraints

The regular production image must remain multi-stage, standalone, non-root, and health-checkable, with a small connection pool and the advisory-lock migration prestart retained. `/api/live` is process-only (container and watchdog liveness), `/api/ready` verifies database connectivity (deployment readiness), and `/api/health` is a compatibility alias for readiness. `docs/agents/deployment.md` holds the image and `owner-bootstrap` target details.

## Definition of done

Step 6 is mechanical and is automated by the `/handoff` command in
`.claude/commands/handoff.md`, which owns the verification sequence, the
`next-env.d.ts` restore, and the version-bump classification. Run it rather than
performing that sequence from memory.

Before handing off a meaningful change:

1. Confirm the implementation matches the relevant approved design and product rule.
2. Confirm exact-cent and historical carryover invariants remain intact.
3. Confirm optimistic behavior has a deterministic rollback and canonical reconciliation path.
4. Confirm authorization and household scoping are server-enforced.
5. Manually exercise affected financial and failure paths in proportion to risk, and read [Traps that produce wrong conclusions](#traps-that-produce-wrong-conclusions) before trusting a local verification result.
6. Run `/handoff`. It runs `verify:fix`, runs `build` when the change warrants it, restores `next-env.d.ts`, applies exactly one Semantic Versioning bump per [Release versioning](#release-versioning), and checks the documentation contract.
7. Update `README.md`, this guide, or the relevant `docs/agents/` reference when workflows, environment variables, architecture, or product behavior change. Update whichever file owns the behavior instead of restating it in several.
8. Report exactly which verification commands and manual flows ran, and say plainly what was skipped or left unverified.
9. Do not publish externally unless explicitly requested.
