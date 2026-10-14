<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Better Budget Agent Guide

This file is the durable engineering contract for Better Budget, loaded into
every session. It holds the guardrails, invariants, conventions, and
verification contract; longer reference material lives alongside it. Preserve
the generated Next.js block above exactly; `next dev` may regenerate it.

## How to use this guide

| Read before                                                     | File                                         |
| --------------------------------------------------------------- | -------------------------------------------- |
| Adding or reshaping a user-facing capability                    | `docs/agents/product.md`                     |
| Changing layout, motion, gestures, sheets, or navigation detail | `docs/agents/design.md`, then its topic file |
| Writing or changing any mutation                                | `docs/agents/persistence.md`                 |
| Changing Better Buddy's route, prompt, tools, or model          | `docs/agents/better-buddy.md`                |
| Changing bill reminders, push, or the service worker            | `docs/agents/bill-reminders.md`              |
| Changing deployment, infrastructure, or the production runtime  | `docs/agents/deployment.md`                  |
| Formatter/linter config, size budgets, comments, or releasing   | `docs/agents/conventions.md`                 |
| The story behind a release guardrail, or a major release        | `docs/agents/releases.md`                    |
| Operating, rolling back, or replacing the production host       | `docs/aws/ec2-cloudfront-migration.md`       |
| Working in an unfamiliar file or directory                      | `docs/agents/paths.md`                       |
| Setup, environment variables, commands, and troubleshooting     | `README.md`                                  |

Read the relevant page of the roughly 4 MB Next.js guide in
`node_modules/next/dist/docs/` only when a change touches routing, route
handlers, `next.config.ts`, metadata, caching, data fetching, or the Server and
Client Component boundary; most changes here live inside Client Components.

`README.md` is the human-facing setup and operations manual. When behavior
changes, update whichever file actually documents it rather than restating it
in several.

## Product brief

Better Budget is a mobile-first, installable household budgeting PWA inspired
by envelope and zero-based budgeting. Version 1 serves one household through one
shared owner login, and prioritizes instant-feeling interactions, exact
financial calculations, clear month-to-month planning, and provider-neutral
container deployment. Each calendar month holds its own budget built from
household-scoped category and item definitions; months that are only viewed
persist nothing. `docs/agents/product.md` is the implemented-capability
inventory.

## Release guardrails

Versions 2–6 left the Version 1 financial model, schema, and authentication
model unchanged. These are the rules that are easy to violate; each reference
file holds the detail and `docs/agents/releases.md` the history.

**Interface (6.0.0).** A control that must not scroll goes in the sheet's
`headerAccessory`. Every date field sits in `.date-input-shell` with the
`CalendarDays` icon. Income's green `--green` (`#1eb574`) is brighter than the
Remaining text color at the user's request; do not darken it without direction.

**Better Buddy (5.0.0).** Read `docs/agents/better-buddy.md` before changing it.

- Assistant writes go only through `applyBudgetMutation`, server-confirmed, with
  a fresh `clientMutationId` and a just-read `expectedVersion`.
- Never add an assistant tool without explicit user direction.
- `SYSTEM_PROMPT` and `ASSISTANT_TOOLS` stay free of per-request values, in a
  deterministic order, and above the model's minimum cacheable prefix.
- No `ANTHROPIC_API_KEY` means no assistant. Keep the cheapest current Claude
  model with thinking explicitly disabled, and keep the call, conversation, and
  rate caps.

**Bill reminders (6.12.0).** Read `docs/agents/bill-reminders.md` before
changing them. They are the only notification the product sends.

- Bill rules stay pure in `src/domain/bill-reminders.ts`.
- `bill_reminder_deliveries` keeps every alert at most once.
- The in-process scheduler assumes exactly one application container.
- The VAPID key pair in Postgres is user-directed; do not move it to the AWS
  secret without direction.

**Production host (2.0.0–5.0.0).** Read `docs/agents/deployment.md` before
changing any of it; `docs/aws/ec2-cloudfront-migration.md` is the live-resource,
rollback, and replacement-host runbook.

- Do not reintroduce ECS, an ALB, NAT, SSH, RDS, or a public IPv4 address
  without explicit user direction. The database's one inbound IPv6 port, scoped
  to one personal `/64`, is deliberate.
- Production requires `DATABASE_SSL=verify-full` with the private CA bundle;
  never weaken it.
- Build `linux/arm64` only, natively on `ubuntu-24.04-arm`; no `linux/amd64`
  or QEMU.
- Keep the 512 MiB sizing and container limits in `bootstrap-ec2.sh`, the
  helper's image-architecture check, and Unlimited CPU credits.
- Deployment needs exactly one _running_ tagged instance; a stopped host is the
  rollback.
- The `bootstrap_host()` seed tag needs an arm64 image, and a replacement root
  volume needs the `Backup=daily` tag.
- Install the `IPv6AcceptRA=yes` drop-in before enabling IPv6 forwarding.
- Backups are seven days of daily EBS snapshots only: take a manual `pg_dump`
  before anything destructive.

## Version 1 boundaries

Do not silently expand the product into any of the following without explicit user direction:

- Bank syncing or account reconciliation.
- Recurring-transaction automation.
- Imports or exports beyond the Settings JSON backup (no CSV, bank, or third-party formats).
- Multi-currency storage or conversion.
- Notifications beyond the bill reminders described under **Bill reminders** in Release guardrails.
- WebSocket or realtime server push.
- Queued offline financial writes.
- Multiple households, invitations, or role-based household access.
- Native iOS or Android clients.

USD and `America/Chicago` are the version 1 defaults.

## Approved product design

The approved references live in `docs/design/`. The visual system is
deliberately iOS-like and restrained, built on cornflower blue `#1769E0` with
pastel semantic accents, rounded cards, tactile sheets, a mobile bottom
navigation, and a desktop left-nav/budget/rail layout. Interactive targets are
at least 44 px, with safe-area padding, keyboard focus management, accessible
status announcements, and reduced-motion support. Do not replace the brand or
visual language with a generic dashboard theme; extend existing primitives and
tokens first.

## Technology and repository

Node.js 24+, npm 11, Next.js 16 App Router, React 19, strict TypeScript,
Tailwind CSS 4, Radix UI, TanStack Query, Drizzle ORM, PGlite locally and
PostgreSQL 17 in production, Zod, Better Auth, the Anthropic TypeScript SDK, and
`web-push`. Versions are pinned by `package-lock.json`. Use npm only, and before
adding a dependency check whether an existing one or a platform primitive
already solves the problem.

Source lives under `src/`: `app/` routes and route handlers, `domain/` exact
money and calculations, `db/` Drizzle schema and seeding, `lib/` Better Auth
wiring, `server/` authoritative services, and `components/` grouped by view plus
`shell/`, `shared/`, and `ui/`. `docs/agents/paths.md` lists what each
high-impact file owns.

- **The import order in `src/app/globals.css` is the cascade order.** Never
  reorder it; `responsive-motion.css` stays last.
- `budget-service.ts` dispatches into `src/server/budget-mutations/`, and
  `optimistic.ts` into `src/components/shell/optimistic-patches/`. A mutation's
  server handler and its optimistic patch share a file name on both sides, and a
  change to one usually needs the other.
- Locate a region with `grep -n` and read that range rather than whole files.
  Line numbers move, so derive them per session.

## Architecture

Authenticated initial reads are Server Components that build a canonical month
snapshot and dehydrate it into TanStack Query; focused Client Components use it
as the interactive source. Internal route handlers expose Zod-validated
contracts, and mutations return discriminated results or stable error kinds
(`validation`, `conflict`, `target_not_empty`, `split_mismatch`, `offline`,
`not_found`); never leak raw database messages to the UI. Pure financial helpers
are shared by optimistic client code and the server; never duplicate budget
arithmetic in components or route handlers.

`DATABASE_KIND` selects `pglite` (default, `.data/pglite`, auto-migrated and
deterministically seeded) or `postgres` (`DATABASE_URL`). Production never runs
the development seed, and requires PostgreSQL, migration prestart, verified TLS,
an HTTPS Better Auth origin, a real auth secret, and disabled auth-bypass
guards. `runtime-environment.mjs` is the one validation and connection source
for the app, migrations, and owner bootstrap; do not duplicate or weaken it.

Pushes to `main` deploy through GitHub Actions and Systems Manager. Host-script
changes in `scripts/aws/bootstrap-ec2.sh` are never deployed by Actions and must
be installed over Systems Manager separately. Never add long-lived AWS
credentials or production secrets to GitHub, persist secret values on the host,
add SSH access, or bypass the host deployment helper.

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
12. Copy only the immediately preceding calendar month, only when its source has active category/item structure or an expected-income plan that is not one-time, and only into a target that has no active plan or activity. Archived category/item definitions and soft-deleted transactions do not make an otherwise empty target ineligible.
13. A month copy includes category/item structure, ordering, planned amounts, expected-income plans that are not one-time, and carryover settings. It never copies one-time expected-income plans, expense/refund transactions, received-income receipts, or a month's bill due-day override. Each expected-income plan's one-time setting belongs to its month and defaults to false, including for mutation payloads and backup files that predate it; an `updateIncomePlan` that omits it leaves it unchanged.
14. Clearing a month resets planned amounts while preserving activity, structure, received-income receipts, and carryover settings. Resetting a budget permanently removes only the selected month's structure, plans, transactions, income activity, and note while preserving every other month and its definitions. Category and item definitions left unused across all months by the reset are permanently deleted. Deleting a received-income receipt soft deletes it and updates actual-cash totals; deleting an income source permanently deletes its receipts in the same transaction, and the server refuses it with `conflict` unless the mutation's `receiptIds` match the source's active receipts exactly, so a receipt recorded on another device is never deleted unseen.
15. Archiving retains history. Deleting a category or item archives it from the selected month onward, so its active transactions in that month and every later month must first move to a live destination item, resolved per month by household definition; the server refuses the archive with `target_not_empty` otherwise, because hidden allocations would silently drop out of Spent. Moved allocations merge into an existing split on the destination, and the plan moves too when requested. Restoring a soft-deleted transaction whose item was archived for its month requires a live destination item in that month; its allocations to archived items move there in the same database transaction, merging into an existing split on the destination, and the server refuses the restore with `validation` without one. Hard deletion is only valid for definitions that have never been used: budgeted in no month other than the selected one and never allocated to any transaction, including soft-deleted ones.
16. Financial multi-row writes, reorder operations, month copying, and archival must run in database transactions.

When changing any of these rules, update the shared domain functions, server services, API validation, optimistic patches, README, and this guide together.

## Eager and optimistic persistence

Safe changes update the visible query snapshot within one animation frame, then
persist quietly. Every mutation carries a unique `clientMutationId`, the
affected entity's `expectedVersion` when it edits versioned state, and the data
needed for deterministic optimistic calculation and server validation. Mutation
receipts are written in the same transaction as the financial change, so a
retry returns the existing result and never duplicates anything. Read
`docs/agents/persistence.md` before writing or changing any mutation.

## Data model

UUID identifiers, indexed foreign keys, household/month uniqueness, exact
constraints, PostgreSQL `date` for financial dates, `timestamptz` audit fields,
archive/delete timestamps, integer sort positions, and monotonically incremented
integer versions; `src/db/schema.ts` is the source. Never edit an applied
migration: change the schema, run `npm run db:generate`, inspect the SQL, and
verify it against an empty PGlite database and PostgreSQL. Production migration
prestart is advisory-lock protected.

## Authentication and access

Better Auth email/password sessions protect application and internal API
routes. Public sign-up is disabled; only `npm run db:owner` may create the one
shared owner, and it must refuse a different owner once the household is
claimed. Every authenticated read and write resolves the current user's owner
membership for the fixed household on the server; client-provided household IDs
are never authorization. Development defaults to `AUTH_BYPASS=true`; production
rejects bypass, and that guard must never be weakened or deployed enabled.

## Commands

```bash
npm run verify          # format:check + typecheck + lint, the usual gate
npm run verify:fix      # lint:fix + format, then the gate
npm run build           # application, dependency, or build changes
npm run db:inspect      # months, planned/spent totals, transaction counts
npm run db:reset && npm run db:migrate && npm run db:seed
```

`README.md` holds the full catalogue and environment variables. `db:reset` only
touches local PGlite. The production preflight and standalone `db:*` scripts do
not load `.env.local`. `npm audit` reports four moderate entries from the
development-only `drizzle-kit` esbuild chain; the user prefers no npm overrides,
so leave it until Drizzle Kit fixes it upstream.

## Release versioning

`package.json` is the canonical version; keep both root versions in
`package-lock.json` in sync. Every completed application change set gets exactly
one SemVer bump, taking the highest that applies: patch for fixes, refactors,
and visual or performance work; minor for new capabilities, routes, API or
data-model additions; major for incompatible changes needing migration. Do not
bump for investigation or for documentation, comment, or formatting-only
changes. A major release also adds sections to `README.md` and
`docs/agents/releases.md` and its rules to **Release guardrails**; `/handoff`
and `docs/agents/conventions.md` hold the detail.

## Traps that produce wrong conclusions

Each of these has caused a confident, incorrect verification. Check them before
trusting a local result.

- **A second `next dev` exits, but the port still answers.** `npm run dev`
  fails with `Another next dev server is already running` and exits, while
  `curl localhost:3000` keeps returning 200 from the _other_ server. Confirm
  with `ps aux | grep "next dev"` and read the dev log before trusting any HTTP
  check.
- **PGlite allows one process on `.data/pglite`.** Querying it from a second
  process while a dev server holds it returns inconsistent state. Stop the
  server first, or read through the running app's API.
- **`npm run db:reset` is undone by a running dev server**, which writes its
  in-memory state back over the fresh seed. Stop every dev server first.
- **`npm run build` rewrites `next-env.d.ts`** to its production form. Run
  `git checkout -- next-env.d.ts` afterward instead of committing the flip.
- **A reloaded dev page can still run an old module.** After edits, even a full
  reload of an open page has served a stale module, which crashed on a missing
  export or hid a bug that was really there. Restart `next dev` before trusting
  an on-device or simulator check of a change.

## Verification

There is intentionally no unit, component, or end-to-end test suite; do not add
test dependencies, configuration, or files unless the user changes that
decision. Meaningful changes run `npm run verify:fix` and, for application,
dependency, or build changes, `npm run build`. Database or container changes
also need PostgreSQL parity, an empty-database migration, and health checks.
Manually exercise the affected flow and report what was checked, especially
exact-money, carryover, split, retry, conflict, and authorization behavior. Safe
actions must update visibly in under 100 ms without a global spinner, then
converge on the authoritative snapshot.

## Code conventions

- Prettier owns formatting and ESLint Stylistic owns structural whitespace; run
  `npm run verify:fix` rather than hand-formatting.
- ESLint enforces 500 lines per file and, in `.ts`, 150 lines per function and
  complexity 30. When a limit is hit, split the file or extract the function.
  Never raise a cap or add a per-file override.
- Client code uses `createUuid()`, never `crypto.randomUUID()`.
- Source carries no comments except JSDoc, in every language. Whatever still
  needs explaining after renaming or extracting goes into `README.md`, this
  guide, or the owning `docs/agents/` reference in the same change. Lint
  suppressions state their reason after `--`.
- `docs/agents/conventions.md` holds the full rules for all of the above.
- Keep TypeScript strict: no `any`, unknown narrowed at boundaries, no dead
  exports or speculative helpers.
- Prefer small pure functions, discriminated unions, branded identifiers, and
  exhaustive switches.
- Validate environment variables and every untrusted payload.
- Keep money and calendar logic in `src/domain/`, database code in server
  modules, and server-only code out of Client Components.
- Keep query keys, invalidation, and optimistic patches narrow enough that one
  failed mutation cannot roll back unrelated changes.
- Use stable error codes in contracts and translate them at the UI edge.
- Preserve accessibility semantics when composing Radix primitives and sheets.
- No broad mechanical rewrites or unrelated restyling while fixing a focused
  issue.
- Preserve user data and existing migrations. Never make reset or seed
  available in production.

## Docker

The production image stays multi-stage, standalone, non-root, and
health-checkable, with a small connection pool and the advisory-lock migration
prestart. `/api/live` is process-only liveness, `/api/ready` checks the
database, and `/api/health` aliases readiness. `docs/agents/deployment.md` holds
the image and `owner-bootstrap` details.

## Definition of done

1. The change matches the approved design and product rules.
2. Exact-cent and historical carryover invariants still hold.
3. Optimistic behavior has a deterministic rollback and canonical
   reconciliation path.
4. Authorization and household scoping are server-enforced.
5. Affected financial and failure paths were exercised in proportion to risk,
   after re-reading the traps above.
6. Run `/handoff`, which verifies, restores `next-env.d.ts`, applies the one
   version bump, and checks the documentation contract.
7. `README.md`, this guide, or the owning `docs/agents/` reference is updated
   when workflows, environment variables, architecture, or behavior change.
8. Report exactly what ran and what was skipped or left unverified.
9. Do not publish externally unless explicitly requested.
