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

| Read before                                                     | File                                         |
| --------------------------------------------------------------- | -------------------------------------------- |
| Adding or reshaping a user-facing capability                    | `docs/agents/product.md`                     |
| Changing layout, motion, gestures, sheets, or navigation detail | `docs/agents/design.md`, then its topic file |
| Writing or changing any mutation                                | `docs/agents/persistence.md`                 |
| Changing deployment, infrastructure, or the production runtime  | `docs/agents/deployment.md`                  |
| Formatter/linter config, size budgets, comments, or releasing   | `docs/agents/conventions.md`                 |
| Operating, rolling back, or replacing the production host       | `docs/aws/ec2-cloudfront-migration.md`       |
| Working in an unfamiliar file or directory                      | `docs/agents/paths.md`                       |
| Setup, environment variables, and troubleshooting               | `README.md`                                  |

The generated block above asks for the Next.js guide in
`node_modules/next/dist/docs/` before writing code. That guide is about 4 MB,
and most changes here live inside Client Components and never touch a Next.js
API, so read the relevant page of it only when a change touches routing, route
handlers, `next.config.ts`, metadata, caching, data fetching, or the Server and
Client Component boundary.

`README.md` is the human-facing setup and operations manual. This file is the
engineering contract. When behavior changes, update whichever of the two
actually documents it rather than restating it in both.

## Product brief

Better Budget is a mobile-first, installable household budgeting PWA inspired by envelope and zero-based budgeting. Version 1 intentionally serves one household through one shared owner login. It prioritizes instant-feeling interactions, exact financial calculations, clear month-to-month planning, and provider-neutral container deployment.

Each calendar month holds its own budget built from household-scoped category and budget-item definitions with per-month participation, plans, and carryover settings. Months that are only viewed persist nothing; the first mutation that needs a month creates it atomically. Transactions are expenses and refunds with exact splits, while expected-income plans and received-income receipts stay separate from them.

Read `docs/agents/product.md` for the complete implemented-capability inventory before adding, removing, or reshaping a user-facing capability.

## Release guardrails

Versions 2–6 each changed one area and left the Version 1 financial model,
database schema, and authentication model unchanged. Their full release notes
are in `docs/agents/releases.md`; these are the rules from them that are easy
to violate.

**Interface (6.0.0).**

- **A control that must not scroll goes in `headerAccessory`.** `Sheet` renders it inside the fixed drag region under the title row. Buttons there stay tappable because a drag never starts on a `button`.
- **Every date field sits in `.date-input-shell`** with the `CalendarDays` icon. iOS sizes a bare `<input type='date'>` to its content, which overflowed the Record income sheet.
- **Income's green is `--green` (`#1eb574`) in `tokens.css`.** It is brighter than the `#199d67` Remaining text color at the user's request, and white text on it is below the AA contrast bar; do not darken it back without direction.

**Better Buddy (5.0.0).** An optional assistant on Claude Haiku 4.5, a floating robot button on every authenticated page that opens a chat.

- **Assistant writes go through `applyBudgetMutation`.** Every tool builds a `BudgetMutation`, parses it with `mutationSchema`, and commits it with a fresh `clientMutationId` and the `expectedVersion` from a snapshot read immediately before. Never give the assistant a write path around the mutation service, and never add a tool for archiving, deleting definitions, copying, clearing, resetting, reordering, or deleting income without explicit user direction.
- **Assistant writes are server-confirmed.** The client applies no optimistic patch; it invalidates every cached `budget-snapshot` query after a turn that reports changed months, because carryover can move later months.
- **The cached prefix is frozen.** `SYSTEM_PROMPT` and `ASSISTANT_TOOLS` must contain no per-request value and must keep a deterministic order, and together they must stay above Haiku 4.5's 4,096-token minimum cacheable prefix, or every request pays full input price. Today's date and the viewed month travel in a text block at the start of each person turn instead. The server warns `prompt cache unused` when a response reads and writes no cache.
- **The conversation is client-held and stateless on the server.** The browser sends the whole message history each turn; the route validates its shape and size, and the household always comes from the session. Tool results the client sends back only affect the model's context, never authorization.
- **The assistant is off without `ANTHROPIC_API_KEY`.** The button is not rendered and the route answers `unavailable`. Production validation rejects a placeholder key and accepts an absent one. With a key, the Settings **Better Buddy** switch and beaming him up to his spaceship both write the per-device `better-budget-assistant-v1` cookie through `changeAssistantEnabled` in `app-client.tsx`; it is a display preference, not an access control.
- **Replies are plain text.** The chat renders no Markdown, so the prompt forbids it and `run.ts` strips `**`/`__` emphasis from model text.
- Keep the model on the cheapest current Claude model with thinking omitted unless the user directs otherwise, and keep the per-turn call cap, the conversation cap, and the per-household rate limit.

**Production host (2.0.0–5.0.0).** A private arm64 `t4g.nano` EC2 host behind a CloudFront VPC origin, running the application and a PostgreSQL 17 container. Read `docs/agents/deployment.md` before changing any of it; `docs/aws/ec2-cloudfront-migration.md` is the live-resource, rollback, and replacement-host runbook.

- Do not reintroduce ECS, an ALB, NAT, SSH, RDS, or a public IPv4 address without explicit user direction. The database's one inbound IPv6 port, scoped to one personal `/64`, is deliberate and user-directed, not drift.
- Production still requires `DATABASE_SSL=verify-full` with the deployment's private CA bundle. Do not weaken it to `require` or `disable` for the host-local database.
- Build `linux/arm64` only, natively on `ubuntu-24.04-arm`. Never reintroduce `linux/amd64` or QEMU emulation; if an x86 host becomes a real rollback target, add a second native job.
- Keep the 512 MiB sizing in `bootstrap-ec2.sh` and never remove the container limits. Under memory pressure, lower `shared_buffers` or resize to `t4g.micro`.
- The seed image tag in `bootstrap_host()` must name a commit whose ECR image has an arm64 manifest. Deployment requires exactly one _running_ instance with both production tags; a stopped host is the rollback. A replacement root volume needs the `Backup=daily` tag or it is never snapshotted. Keep the helper's image-architecture check, whose absence once took production down.
- Keep Unlimited CPU credits; Standard credits throttle a deployment into rolling back a working image.
- Backups are daily EBS snapshots kept seven days, with no scheduled dump or point-in-time recovery: take a manual `pg_dump` before anything destructive.
- Production egress is IPv6 NAT on the Docker network, and the `IPv6AcceptRA=yes` drop-in must be installed before IPv6 forwarding is enabled, or the host loses IPv6, Systems Manager, and ECR within minutes.

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

Read `docs/agents/design.md` for the palette and reference viewports before changing layout. Each interaction contract (layout, motion, gesture, sheet, swipe, reordering, and navigation detail) lives in one topic file under `docs/agents/design/`, and the table in `design.md` says which; read only the topic you are changing.

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

`docs/agents/paths.md` lists what each high-impact file and directory owns. Read
the entries for the area you are changing before editing it.

**The import order in `src/app/globals.css` is the cascade order.** Later files
in `src/app/styles/` intentionally override earlier ones, so never reorder the
imports, and add a new area file at the position its specificity requires —
`responsive-motion.css` must stay last.

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

A major release must also add a new version section to both `README.md` and
`docs/agents/releases.md`, preserving earlier sections as a historical record,
and add its load-bearing rules to **Release guardrails** in this guide.
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
