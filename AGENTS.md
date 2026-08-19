<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Better Budget Agent Guide

This file is the durable engineering handoff for Better Budget. Read it before changing application code, database behavior, deployment configuration, or product copy. Preserve the generated Next.js block above exactly; `next dev` may regenerate it.

## Product brief

Better Budget is a mobile-first, installable household budgeting PWA inspired by envelope and zero-based budgeting. Version 1 intentionally serves one household through one shared owner login. It prioritizes instant-feeling interactions, exact financial calculations, clear month-to-month planning, and provider-neutral container deployment.

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
- Adding, editing, reordering, archiving, and conditionally deleting categories and items. Category name, icon, and color editing lives directly on the Budget page. A 350 ms long-press on a Budget-page category header or item row starts reordering, with a lifted pointer-following preview, an in-list placeholder, and animated neighboring rows. There are no visible drag grips on the Budget page.
- Planned amount editing and forward-looking per-month carryover settings. A
  month's switch sends its ending balance to the immediately following month;
  it does not change that month's inbound balance.
- Cents-first currency inputs that always display a formatted value such as `$200.57`; typing digits shifts them through the decimal places without requiring a decimal point.
- Expense and refund transactions, including exact splits across budget items.
- Adding transactions globally or from a line-item detail with that item preselected, editing transactions, soft deleting, and undoing transaction deletion.
- Expected-income sources with editable names, icons, and colors plus one or more dated received-income receipts.
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
- File-persistent PGlite development, PostgreSQL parity, and Docker packaging.

## Version 1 boundaries

Do not silently expand the product into any of the following without explicit user direction:

- Bank syncing or account reconciliation.
- Recurring-transaction automation.
- Imports or exports.
- Multi-currency storage or conversion.
- Notifications.
- WebSocket or realtime server push.
- Queued offline financial writes.
- Multiple households, invitations, or role-based household access.
- Native iOS or Android clients.

USD and `America/Chicago` are the version 1 defaults.

## Approved product design

The approved visual references are stored in `docs/design/`:

- `budget-responsive.png`: primary budget and responsive layout.
- `brand-system.png`: wordmark and app icon.
- `transactions.png`: transaction list, editing, and split flows.
- `auth-income-organizer.png`: sign-in, income, month copying, and organization.

Important responsive reference viewports are 390 x 844 for mobile and 1440 x 1000 for desktop.

The visual system is deliberately iOS-like and restrained:

- True-white surfaces with charcoal text and cool-gray dividers.
- Cornflower blue `#1769E0` as the primary action color.
- Mint `#55D49B`, sky `#9FC0FF`, yellow `#FFD977`, coral `#FF7E83`, and lilac `#B6A6FF` as semantic/accent colors.
- Pastel category medallions, tactile sheets, rounded cards, and lightweight CSS/SVG charts.
- A mobile bottom navigation and bottom-sheet interactions.
- Category headers expose an edit menu; budget-item rows alone use a deliberately leftward swipe to reveal Delete. Keep the inactive swipe action fully transparent so fast vertical scrolling cannot flash its red layer.
- The Budget page defaults its amount display to Available. Its Planned/Available switch must not resize rows. A line-item progress bar represents the share of its starting available balance still remaining: it is full before any net spending and shrinks toward empty as spending consumes the balance, including carried-in funds and refunds. A negative balance replaces the regular fill with a coral striped warning bar and an accessible over-budget amount. Reordering starts after a 350 ms long-press on the category header or item row; movement beyond 8 px before activation must cancel so vertical scrolling and item swipe-delete remain reliable. A visually hidden keyboard control must continue to support Arrow Up/Arrow Down reordering. Use a transition-free rendered drag copy inside a neutral compositor shell plus animated list reflow. Never move the source clone directly with inherited row/header transitions because that creates compositor ghosting. During a pointer drag, keep the real DOM order fixed, translate the faded placeholder into the current target slot, and move neighboring rows with interruptible transforms; commit the React/server order once on drop. Edge auto-scroll is frame-based with gradual acceleration/deceleration and continues while the pointer is held near an edge. Item reordering remains within its current category. Summary and budget progress entrance animations are one-shot and must not replay when a drag preview is created or a list order is committed.
- Budget-item details are URL-backed and use an iOS-style navigation push below 760 px. The detail page slides in from the right while the mobile header, Budget content, and bottom navigation parallax left; Back, browser history, refresh, and an app-controlled left-edge swipe all preserve navigation-stack semantics. The global left-edge guard must leave this custom swipe available from x=0 while suppressing Safari's cancelable native history gesture. Disable the underlying detail swipe while any child sheet is visible or exiting so add/edit transaction interactions cannot pop the line-item route. Keep the Budget back control and editable item title in a fixed detail header while only the detail body scrolls. A floating blue plus action remains at the bottom right and opens the add-transaction sheet with the current item preselected. At 760 px and above, keep the centered detail modal.
- The Transactions page keeps its All, Expenses, and Income type pills visible and applies those inline choices immediately. Its sliders control opens a full filter sheet with transaction type, budget item, and split-status controls. Sheet changes are drafts until Apply filters is pressed; closing the sheet discards them, and the sheet's Clear filters action resets only the drafts. Applied filters give the sliders control a distinct blue treatment and active-count badge. While filters are applied, expose an outside Clear action immediately after the Income pill in the same left-aligned group, never pushed to the far edge of the row. That action resets the applied type, item, and split filters without clearing search. A populated search field exposes an accessible clear control that empties the query without returning focus to the input.
- All sheets share the same interaction contract: transparent/non-dimming overlay, 0.6 s `cubic-bezier(0.29, 1, 0.29, 1)` entrance, 0.45 s `cubic-bezier(0.4, 1, 0.4, 1)` exit, and mobile downward drag-to-dismiss with distance, velocity, and projected-distance thresholds. Keep the grabber, title, and close control fixed while only `.sheet-body` scrolls; prevent horizontal sheet overflow. Desktop sheets use the same timing as centered modals without drag dismissal.
- The mobile PWA intentionally disables page zoom, text selection, touch callouts, document-level pull-to-refresh, and cancelable Safari history gestures beginning within the leftmost 20 px on any route. The global touch guard must remain capture-phase and non-passive for touchstart and touchmove, claim non-control edge touches immediately, preserve normal control taps, and prevent every move that begins inside the edge strip regardless of direction. Mount it once above all routes. `.app-content` is the vertical overscroll surface for every route, continues behind the translucent blurred bottom navigation, and must retain enough bottom padding/scroll padding to expose the final content above that navigation. The top header remains opaque white, and route content enters over 0.65 s with the established blur-to-sharp motion.
- A slim desktop left navigation, primary budget column, and summary/activity rail.
- At least 44 px interactive targets, safe-area padding, keyboard focus management, accessible status announcements, and reduced-motion support.

Do not replace the established brand or visual language with a generic dashboard theme. Extend existing primitives and tokens first.

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
- Better Auth for email/password sessions.
- Prettier 3.9.6 for repository-wide source and documentation formatting.
- ESLint Stylistic 5.10.0 for autofixable structural whitespace rules that do not overlap the Prettier style contract.

Dependency versions are pinned by `package-lock.json`. Use npm consistently and do not introduce another package-manager lockfile. Before introducing or changing a dependency, determine whether an existing dependency or platform primitive already solves the problem.

## Important repository paths

```text
src/app/                         Next.js routes, layouts, metadata, and route handlers
src/components/budget/           Budget shell, views, forms, sheets, and optimistic UI
src/domain/                      Shared exact-money, budget calculations, and domain types
src/db/                          Drizzle schema, database selection, migration, and seeding
src/server/                      Auth access, mutation contracts, and authoritative services
scripts/                         Migration, seed, reset, owner bootstrap, and production prestart
runtime-environment.mjs          Shared production validation and PostgreSQL TLS configuration
drizzle/                         Ordered SQL migrations and migration metadata
public/                          PWA icons and static assets
docs/design/                     Approved visual references
Dockerfile                       Multi-stage non-root standalone application image
compose.yaml                     PostgreSQL service and optional full application profile
.github/workflows/               GitHub Actions production deployment
docs/aws/                        Account-scoped GitHub OIDC and deployment policies
```

High-impact files include:

- `src/domain/money.ts` for parsing, formatting, and exact cent operations.
- `src/domain/uuid.ts` for client-safe UUID generation across secure production and plain-HTTP LAN development.
- `src/domain/budget-calculations.ts` for authoritative and optimistic totals/carryover.
- `src/domain/types.ts` for snapshot and domain contracts.
- `src/db/schema.ts` for relational structure and database constraints.
- `src/db/index.ts` for PGlite/PostgreSQL selection and initialization.
- `src/db/household.ts` for the single-household identity and owner bootstrap membership.
- `src/db/seed.ts` for deterministic August 2026 development data.
- `src/server/mutation-schema.ts` for validated mutation contracts.
- `src/server/budget-service.ts` for atomic server-side financial changes.
- `src/components/budget/use-budget-data.ts` for query hydration, retry, reconciliation, and sync state.
- `src/components/budget/optimistic.ts` for pure optimistic cache patches.
- `src/components/budget/app-client.tsx` for the authenticated interactive shell.
- `src/components/budget/budget-view.tsx` for Budget-page rendering, URL-backed line-item details, and the item-scoped add-transaction flow.
- `src/components/budget/transactions-view.tsx` for transaction-only activity scoping, search, inline filters, filter-sheet drafts, and applied-filter clearing.
- `src/components/ui/navigation-detail.tsx` for mobile push navigation, line-item edge-swipe dismissal, fixed detail chrome, and modal fallback.
- `src/components/ui/left-edge-gesture-guard.tsx` for the global Safari left-edge history-gesture suppression contract.
- `src/components/ui/sheet.tsx` for the shared animated, scroll-contained, drag-dismissible sheet behavior.
- `src/components/ui/sortable-list.tsx` for long-press activation, lifted previews, placeholder movement, list reflow, keyboard reordering, and edge auto-scroll.

## Architecture

Authenticated initial reads are Server Components. The server builds a canonical month snapshot, dehydrates it into TanStack Query, and focused Client Components use that snapshot as the interactive source for the current budget, income, and activity.

Internal route handlers expose Zod-validated request/response contracts. Mutations return discriminated success responses or stable error kinds such as `validation`, `conflict`, `target_not_empty`, `split_mismatch`, `offline`, and `not_found`. Keep errors stable and actionable; do not leak raw database messages to the UI.

Pure financial helpers are shared by optimistic client code and authoritative server services. Never duplicate budget arithmetic inside components or route handlers.

The database adapter is selected through `DATABASE_KIND`:

- `pglite` is the default and persists under `.data/pglite`.
- `postgres` uses `DATABASE_URL` and the production-compatible Drizzle/PostgreSQL path.

The default PGlite path is automatically migrated and deterministically seeded.
Production initialization never invokes the development seed. Production startup requires PostgreSQL, migration prestart, verified TLS with a trusted CA bundle, an HTTPS Better Auth origin, a non-placeholder auth secret, and disabled auth-bypass guards. `runtime-environment.mjs` is the shared validation and PostgreSQL connection source for the application, migrations, and owner bootstrap; do not duplicate or weaken those rules.

Pushes to `main` deploy the regular runtime target through GitHub Actions. The workflow assumes the account-scoped `better-budget-github-deploy` IAM role through GitHub OIDC, tags the ECR image with the immutable commit SHA, copies the current ECS task definition so production secrets and service configuration remain authoritative in AWS, replaces only the `Main` container image, and waits for service stability before checking liveness and readiness. Keep the OIDC trust restricted to the immutable BetterBudget repository identity and `main`; keep its permissions limited to the production ECR repository, ECS service, and task execution role. Do not add long-lived AWS credentials or production application secrets to GitHub.
The Docker build receives `github.sha` as `APP_BUILD_SHA`; Next.js embeds it as
public, non-secret build metadata for the Settings page.

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
15. Archiving retains history. Hard deletion is only valid for definitions that have never been used.
16. Financial multi-row writes, reorder operations, month copying, and archival must run in database transactions.

When changing any of these rules, update the shared domain functions, server services, API validation, optimistic patches, README, and this guide together.

## Eager and optimistic persistence

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

## Development scenarios

The non-production settings scenario panel can simulate normal operation, latency, a timeout, transient failure, conflict, validation failure, and offline behavior. Use it when changing mutation behavior so error feedback, retries, rollback isolation, retained drafts, and canonical reconciliation remain observable.

Scenario simulation must stay non-production and must not alter real production failure behavior.

## Commands and local workflows

Common commands:

```bash
npm install
npm run dev
npm run dev:mobile
npm run dev:postgres
npm run db:migrate
npm run db:seed
npm run db:reset
npm run db:owner
npm run format
npm run format:check
npm run typecheck
npm run lint
npm run lint:fix
npm run build
npm run start
```

Important details:

- `npm run dev` uses file-persistent PGlite unless environment variables override it.
- `npm run dev:mobile` binds Next.js to all local interfaces. `next.config.ts` discovers active IPv4 interfaces at startup and adds those exact hosts to `allowedDevOrigins`; restart it after network-address changes.
- Client code must use `createUuid()` from `src/domain/uuid.ts` instead of calling `crypto.randomUUID()` directly. Mobile browsers can withhold secure-context crypto APIs when the development app is opened over a plain-HTTP LAN address.
- `npm run db:reset` is intentionally guarded. It only resets the local `.data` PGlite target, refuses production, and refuses PostgreSQL.
- The `NODE_OPTIONS=--conditions=react-server` used by database scripts is intentional because server-only modules are imported outside the Next.js process.
- Next.js loads `.env.local` for development and builds, but the production preflight that precedes `npm start` and the standalone `db:*` scripts do not. Export or prefix their required environment variables; Docker/ECS must inject production values through the container environment and secret references.
- `npm run start` and both production Docker targets fail closed on invalid production configuration. The local full-Compose profile is the only explicit production-mode auth-bypass exception and requires a loopback auth URL plus both local bypass guards.
- `DATABASE_SSL` accepts `disable`, `require`, or `verify-full`; real production requires `verify-full` plus `DATABASE_SSL_CA`. The shared connection helper strips conflicting SSL query parameters from `DATABASE_URL` before applying this policy.
- `npm run build` currently selects webpack explicitly for a reliable standalone production build.
- `npm run format` writes the canonical Prettier formatting across every supported repository file. Generated data, build output, database snapshots, and binary/static design assets are excluded by `.prettierignore`.
- `npm run format:check` is the read-only formatting check for local verification and automation.
- `npm run lint:fix` applies safe ESLint autofixes, including the configured structural blank-line rules. Run Prettier afterward because ESLint fixes can add or remove blank lines.
- `npm audit` currently reports four moderate entries from one development-only `drizzle-kit -> @esbuild-kit -> esbuild@0.18.20` chain. The user explicitly prefers no npm overrides, so retain the upstream dependency until a stable Drizzle Kit release fixes it naturally.

See `README.md` for complete setup, environment, Docker, and troubleshooting instructions.

## Verification expectations

There is intentionally no unit, component, or end-to-end test suite. Do not add automated test dependencies, configuration, or files unless the user explicitly changes that decision.

Meaningful application changes normally require:

```bash
npm run format
npm run format:check
npm run typecheck
npm run lint
npm run build
```

Database or container changes also require PostgreSQL parity, empty-database migration, and health checks. Manually exercise the affected user flow and report what was checked, especially for exact-money, carryover, split, retry, conflict, and authorization behavior.

The acceptance target for safe actions is a visible update in under 100 ms without a global spinner, followed by eventual equality with the authoritative snapshot.

## Code conventions

- Prettier is the formatting source of truth for all supported code, configuration, stylesheets, and Markdown. The required style uses an 80-character print width, four-space indentation using spaces, single quotes in JavaScript/TypeScript and JSX, semicolons, LF endings, and no trailing commas. Run `npm run format` after edits and before verification; never hand-format around Prettier or introduce a conflicting formatter without explicit user approval.
- ESLint Stylistic owns structural whitespace that Prettier intentionally preserves: import/directive separation, variable-group separation, blank lines before returns and throws, class-member separation, block padding, meaningful comment separation, comment spacing, one statement/declaration per line, Unix line endings, file endings, and prevention of tabs, trailing whitespace, mixed spacing, or excessive empty lines. Do not add ESLint rules for indentation width, quotes, commas, semicolons, or line wrapping because those belong to Prettier.
- Keep `.prettierrc.json`, `.prettierignore`, and the pinned Prettier version synchronized with any future formatting-workflow change. Generated files and ignored static assets must not be pulled into formatting runs accidentally.
- Keep TypeScript strict. `noUnusedLocals` and `noUnusedParameters` are enabled so dead local declarations and parameters fail type checking. Avoid `any`; narrow `unknown` at boundaries, keep exports limited to real module consumers, and remove obsolete helpers instead of preserving speculative APIs.
- Prefer small pure functions, discriminated unions, branded identifiers, and exhaustive switches.
- Validate environment variables and every untrusted request payload.
- Keep money and calendar logic in `src/domain/`, not in JSX.
- Keep database operations in server/database modules; never import server-only code into Client Components.
- Prefer Server Components for authenticated initial reads and focused Client Components for stateful interactions.
- Keep query keys, invalidation, and optimistic patches narrow enough that one failed mutation cannot roll back unrelated changes.
- Use stable error codes in contracts and translate them into concise user-facing copy at the UI edge.
- Preserve accessibility semantics when composing Radix primitives and custom sheets.
- Avoid routine comments. Add a comment only when a non-obvious financial invariant, concurrency guarantee, or framework workaround cannot be expressed clearly in code.
- Do not perform broad mechanical rewrites or unrelated restyling while fixing a focused issue.
- Preserve user data and existing migrations. Never make reset/seed behavior available in production.

## Docker constraints

The regular production image must remain multi-stage, standalone, non-root, and health-checkable. `/api/live` is process-only and is the container liveness target; `/api/ready` verifies database connectivity and is the load-balancer readiness target; `/api/health` remains a compatibility alias for readiness. Keep the production connection pool small and retain the advisory-lock migration prestart. Keep the separate `owner-bootstrap` target non-root and limited to the one-time owner command.

## Definition of done

Before handing off a meaningful change:

1. Confirm the implementation matches the relevant approved design and product rule.
2. Confirm exact-cent and historical carryover invariants remain intact.
3. Confirm optimistic behavior has a deterministic rollback and canonical reconciliation path.
4. Confirm authorization and household scoping are server-enforced.
5. Manually exercise affected financial and failure paths in proportion to risk.
6. Run `npm run lint:fix` when autofixable ESLint issues exist, then run `npm run format`.
7. Confirm `npm run format:check` passes.
8. Confirm `npm run typecheck` passes for application or configuration changes.
9. Confirm `npm run lint` passes; linting is mandatory even when `lint:fix` made no changes.
10. Confirm `npm run build` passes for meaningful application, dependency, or build-configuration changes.
11. Report exactly which verification commands and manual flows ran.
12. Update `README.md` and this guide when workflows, environment variables, architecture, or product behavior change.
13. Do not publish externally unless explicitly requested.
