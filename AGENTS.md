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
| Operating, rolling back, or replacing the production host       | `docs/aws/ec2-cloudfront-migration.md` |
| Setup, environment variables, and troubleshooting               | `README.md`                            |

`README.md` is the human-facing setup and operations manual. This file is the
engineering contract. When behavior changes, update whichever of the two
actually documents it rather than restating it in both.

## Product brief

Better Budget is a mobile-first, installable household budgeting PWA inspired by envelope and zero-based budgeting. Version 1 intentionally serves one household through one shared owner login. It prioritizes instant-feeling interactions, exact financial calculations, clear month-to-month planning, and provider-neutral container deployment.

Each calendar month holds its own budget built from household-scoped category and budget-item definitions with per-month participation, plans, and carryover settings. Months that are only viewed persist nothing; the first mutation that needs a month creates it atomically. Transactions are expenses and refunds with exact splits, while expected-income plans and received-income receipts stay separate from them.

Read `docs/agents/product.md` for the complete implemented-capability inventory before adding, removing, or reshaping a user-facing capability.

## Version 2 deployment release

Version `2.0.0` changed the coordinated AWS production deployment while preserving the Version 1 product, financial model, authentication model, database schema, and provider-neutral runtime image. CloudFront is the public HTTPS origin and connects directly to a single private `t3a.micro` EC2 instance through a VPC origin. The migration completed on August 22, 2026, and there was no Version 2 data migration.

Do not reintroduce ECS, an ALB, NAT, SSH, or a public EC2 address without explicit user direction. Version 2 retains every Version 1 non-goal; the infrastructure change is not authorization to add households, invitations, roles, bank syncing, recurring automation, imports/exports, currencies, notifications, realtime push, or offline financial writes.

Read `docs/agents/deployment.md` before changing deployment, infrastructure, or the production runtime. `docs/aws/ec2-cloudfront-migration.md` remains the authoritative live-resource, operations, rollback, and replacement-host runbook.

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

The visual system is deliberately iOS-like and restrained: true-white surfaces, charcoal text, and cool-gray dividers; cornflower blue `#1769E0` as the primary action color; and mint `#55D49B`, sky `#9FC0FF`, yellow `#FFD977`, coral `#FF7E83`, and lilac `#B6A6FF` as semantic accents. Pastel category medallions, tactile sheets, rounded cards, lightweight CSS/SVG charts, a mobile bottom navigation, and bottom-sheet interactions carry the rest. Desktop uses a slim left navigation, a primary budget column, and a summary/activity rail. Interactive targets are at least 44 px, with safe-area padding, keyboard focus management, accessible status announcements, and reduced-motion support.

Do not replace the established brand or visual language with a generic dashboard theme. Extend existing primitives and tokens first.

Read `docs/agents/design.md` for the full layout, motion, gesture, sheet, swipe, reordering, and navigation-detail interaction contracts before changing any of them.

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
src/components/ui/               Shared sheet, gesture, sortable, and input primitives
src/domain/                      Shared exact-money, budget calculations, and domain types
src/db/                          Drizzle schema, database selection, migration, and seeding
src/lib/                         Better Auth server/client wiring and small shared helpers
src/server/                      Auth access, mutation contracts, and authoritative services
scripts/                         Database commands, production prestart, and AWS host bootstrap
runtime-environment.mjs          Shared production validation and PostgreSQL TLS configuration
drizzle/                         Ordered SQL migrations and migration metadata
public/                          PWA icons and static assets
docs/agents/                     On-demand engineering references named by this guide
docs/design/                     Approved visual references
Dockerfile                       Multi-stage non-root standalone application image
compose.yaml                     PostgreSQL service and optional full application profile
.github/workflows/               GitHub Actions production deployment
docs/aws/                        Account-scoped GitHub OIDC and deployment policies
```

High-impact files include:

- `src/domain/money.ts` for parsing, formatting, and exact cent operations.
- `src/domain/uuid.ts` for client-safe UUID generation across secure production and plain-HTTP LAN development.
- `src/domain/calendar.ts` for `APP_TIME_ZONE`, the current-month key that month-aware routes default to, and month-date helpers.
- `src/domain/budget-calculations.ts` for authoritative and optimistic totals/carryover.
- `src/domain/types.ts` for snapshot and domain contracts.
- `src/db/schema.ts` for relational structure and database constraints.
- `src/db/index.ts` for PGlite/PostgreSQL selection and initialization.
- `src/db/household.ts` for the single-household identity and owner bootstrap membership.
- `src/db/seed.ts` for development data seeded into the current and previous month. Merchants, amounts, and structure are fixed; only the calendar months follow today's date.
- `src/server/mutation-schema.ts` for validated mutation contracts.
- `src/server/budget-service.ts` for atomic server-side financial changes.
- `src/components/budget/use-budget-data.ts` for query hydration, retry, reconciliation, and sync state.
- `src/components/budget/optimistic.ts` for pure optimistic cache patches.
- `src/components/budget/app-client.tsx` for the authenticated interactive shell.
- `src/components/budget/budget-view.tsx` for Budget-page rendering, URL-backed line-item details, and the item-scoped add-transaction flow.
- `src/components/budget/budget-item-editors.tsx` for the plan input and item edit/detail components used by the Budget page.
- `src/server/month-snapshot.ts` for the canonical month snapshot read path.
- `src/server/mutation-failures.ts` for the shared mutation-failure class and its not-found/conflict helpers.
- `src/components/budget/transactions-view.tsx` for transaction-only activity scoping, search, inline filters, filter-sheet drafts, and applied-filter clearing.
- `src/components/ui/navigation-detail.tsx` for mobile push navigation, line-item edge-swipe dismissal, fixed detail chrome, and modal fallback.
- `src/components/ui/left-edge-gesture-guard.tsx` for the global Safari left-edge history-gesture suppression contract.
- `src/components/ui/sheet.tsx` for the shared animated, scroll-contained, drag-dismissible sheet behavior.
- `src/components/ui/sortable-list.tsx` for long-press activation, lifted previews, placeholder movement, list reflow, keyboard reordering, and edge auto-scroll.
- `src/app/globals.css` for the Tailwind import and the ordered `@import` list only. The rules live in `src/app/styles/`.
- `src/app/styles/` for the visual system, split by area: `tokens`, `app-shell`, `budget`, `navigation-detail`, `sheets-and-forms`, `transactions`, `income`, `organize`, `settings`, `sign-in`, `responsive-motion`. **The import order in `globals.css` is the cascade order.** Later files intentionally override earlier ones, so never reorder the imports, and add a new area file at the position its specificity requires — `responsive-motion.css` must stay last.

### Navigating the large files without reading them whole

Three files are big enough that a full read is expensive: `budget-service.ts`
(~15k tokens), `budget-view.tsx` (~13k), `navigation-detail.tsx` (~11k). Most
tasks need one region. Locate it first, then read that range with an offset:

```bash
grep -n "case '" src/server/budget-service.ts        # the 25 mutation cases
grep -n '^export \|^async function \|^function ' src/server/budget-service.ts
grep -n '^function \|^export function ' src/components/budget/budget-view.tsx
grep -rn '\.class-name' src/app/styles/                # which stylesheet owns it
```

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

Pushes to `main` deploy the regular runtime target through GitHub Actions. The workflow assumes the account-scoped `better-budget-github-deploy` IAM role through GitHub OIDC, tags the ECR image with the immutable commit SHA, discovers exactly one running instance with the `Application=better-budget` and `Environment=production` tags, and invokes `better-budget-deploy` through Systems Manager. The host pulls the candidate before restarting, checks liveness and readiness, and restores the preceding tag on failure. Keep the OIDC trust restricted to the immutable BetterBudget repository identity and `main`; keep its permissions limited to the production ECR repository and SSM commands on the tagged production instance. Do not add long-lived AWS credentials or production application secrets to GitHub.
The workflow verifies that the production ECR repository uses immutable tags,
and its external actions plus the Docker base image are pinned to immutable
digests. The Docker build receives `github.sha` as `APP_BUILD_SHA`; Next.js
embeds it as public, non-secret build metadata for the Settings page.

The private EC2 host is initialized by `scripts/aws/bootstrap-ec2.sh`. The
self-installing script owns the systemd application service, one-minute
liveness watchdog, memory-backed runtime secret files, dual-stack AWS service
endpoints, current/previous image tags, and automatic rollback. It reads the
existing JSON secret at every application start and passes only its three
runtime values into the container process. `BETTER_AUTH_URL` and deployment
identifiers live in root-owned non-secret host configuration. Do not persist
secret values, add SSH access, or bypass the host deployment helper.

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

Every major release must add a new, clearly labeled version section to both
`README.md` and this guide. Preserve earlier version sections as a historical
record instead of rewriting them around the new release. At minimum, each new
major-version section must document:

- The release's new user-facing capabilities and important improvements.
- Changed or removed behavior and other breaking changes.
- Required data, configuration, authentication, deployment, or workflow
  migrations.
- Compatibility boundaries, retained non-goals, and any superseded guidance.

The Version 2 sections in `README.md` and this guide are the worked example of
that requirement; follow their shape for any future major release.

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

- Prettier is the formatting source of truth for all supported code, configuration, stylesheets, and Markdown. The required style uses an 80-character print width, four-space indentation using spaces, single quotes in JavaScript/TypeScript and JSX, semicolons, LF endings, and no trailing commas. Run `npm run format` after edits and before verification; never hand-format around Prettier or introduce a conflicting formatter without explicit user approval.
- ESLint Stylistic owns structural whitespace that Prettier intentionally preserves: import/directive separation, variable-group separation, blank lines before returns and throws, class-member separation, block padding, meaningful comment separation, comment spacing, one statement/declaration per line, Unix line endings, file endings, and prevention of tabs, trailing whitespace, mixed spacing, or excessive empty lines. Do not add ESLint rules for indentation width, quotes, commas, semicolons, or line wrapping because those belong to Prettier.
- `lines-around-comment` requires a blank line before an own-line comment while `padding-line-between-statements` forbids a blank line between consecutive `const`/`let`/`var` declarations, so an own-line comment cannot sit between two declarations and `lint:fix` cannot resolve it. Use a trailing comment on the declaration, start the comment at a block or object-literal start, or place it above a preceding non-declaration statement.
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

The regular production image must remain multi-stage, standalone, non-root, and health-checkable. `/api/live` is process-only and is the container and host-watchdog liveness target; `/api/ready` verifies database connectivity and is the deployment-readiness target; `/api/health` remains a compatibility alias for readiness. Keep the production connection pool small and retain the advisory-lock migration prestart. Keep the separate `owner-bootstrap` target non-root and limited to the one-time owner command.

## Definition of done

Steps 6 through 9 are mechanical and are automated by the `/handoff` command in
`.claude/commands/handoff.md`. Run it rather than performing the sequence from
memory.

Before handing off a meaningful change:

1. Confirm the implementation matches the relevant approved design and product rule.
2. Confirm exact-cent and historical carryover invariants remain intact.
3. Confirm optimistic behavior has a deterministic rollback and canonical reconciliation path.
4. Confirm authorization and household scoping are server-enforced.
5. Manually exercise affected financial and failure paths in proportion to risk, and read [Traps that produce wrong conclusions](#traps-that-produce-wrong-conclusions) before trusting a local verification result.
6. Run `npm run verify:fix`, which applies ESLint autofixes and Prettier, then confirms `format:check`, `typecheck`, and `lint` all pass.
7. Confirm `npm run build` passes for meaningful application, dependency, or build-configuration changes, then restore `next-env.d.ts`.
8. Use the [Release versioning](#release-versioning) guide to classify the completed change set, apply exactly one Semantic Versioning bump, and confirm `package.json` and the root package versions in `package-lock.json` match. Skip the bump only for the exceptions named in that guide.
9. Update `README.md`, this guide, or the relevant `docs/agents/` reference when workflows, environment variables, architecture, or product behavior change. Update whichever file owns the behavior instead of restating it in several.
10. Report exactly which verification commands and manual flows ran, and say plainly what was skipped or left unverified.
11. Do not publish externally unless explicitly requested.
