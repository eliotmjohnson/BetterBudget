# Better Budget

Better Budget is a mobile-first household budgeting PWA with eager updates, exact-cent accounting, month-specific plans, income tracking, split transactions, historical carryover, and a PostgreSQL-ready backend.

It is designed for one household using one shared owner login. The default development workflow needs no external database: Next.js automatically migrates and seeds a file-persistent PGlite database. The same application can run against PostgreSQL locally or through the provider-neutral Docker image.

## Documentation map

This README is the human setup and operations manual: prerequisites, quick
start, environment variables, database workflows, deployment, troubleshooting,
and package scripts.

`AGENTS.md` is the engineering contract for anyone — person or coding agent —
changing application code, and it names four on-demand references:

| Topic                                        | File                                   |
| -------------------------------------------- | -------------------------------------- |
| Implemented product capabilities             | `docs/agents/product.md`               |
| Layout, motion, gesture, and sheet contracts | `docs/agents/design.md`                |
| Mutation lifecycle and optimistic rules      | `docs/agents/persistence.md`           |
| Version 2 deployment model                   | `docs/agents/deployment.md`            |
| Live AWS resources, operations, and rollback | `docs/aws/ec2-cloudfront-migration.md` |

When behavior changes, update whichever file actually documents it rather than
restating it in both.

## Current status

Version 1 implements the complete product foundation: month-scoped budgets with
notes and navigation, household category and budget-item definitions with
per-month plans, month copying and clearing, budget resets, planned amounts with
forward-looking carryover, expense and refund transactions with exact splits,
expected and received income, searchable and filterable transaction history,
URL-backed budget-item and income-source details, and a Settings organizer.

Underneath that: optimistic updates with idempotent mutation retries, conflict
detection, isolated rollback, and offline feedback; Better Auth email/password
sessions with public signup disabled; a mobile bottom navigation, desktop side
navigation, and responsive summary rail; and PGlite, PostgreSQL, and Docker
development paths.

`docs/agents/product.md` holds the complete implemented-capability inventory.
Approved design references live in [`docs/design`](./docs/design).

## Version 2 deployment release

Version `2.0.0` kept the Version 1 budgeting product and database model while
changing the production deployment architecture. CloudFront serves the public
application from a single private `t3a.micro` EC2 VPC origin with no public
IPv4, SSH access, NAT gateway, or load balancer. Pushes to `main` deploy
immutable `linux/amd64` images through GitHub OIDC and Systems Manager, and a
failed liveness or readiness check restores the previous image tag.

The migration completed on August 22, 2026 with no data migration. Production is
[`https://ddz00reob9ubc.cloudfront.net`](https://ddz00reob9ubc.cloudfront.net).
RDS remains publicly accessible by deliberate operator choice, with private EC2
access and restricted PostgreSQL ingress; making it private is an optional later
hardening step, not a pending cutover task.

The [EC2 and CloudFront production runbook](docs/aws/ec2-cloudfront-migration.md)
records the live resources, VPC names, routine operations, rollback process, and
replacement-host procedure. `docs/agents/deployment.md` records the engineering
boundaries that come with it.

## Stack

| Area           | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Application    | Next.js 16 App Router, React 19, strict TypeScript           |
| Styling        | Tailwind CSS 4, Radix UI primitives, Lucide icons            |
| Client data    | TanStack Query with server-hydrated month snapshots          |
| Validation     | Zod request and response contracts                           |
| Database       | Drizzle ORM, file/in-memory PGlite, PostgreSQL 17            |
| Authentication | Better Auth email/password sessions                          |
| Code quality   | Prettier 3.9.6 and ESLint Stylistic 5.10.0                   |
| Packaging      | Next.js standalone output, multi-stage non-root Docker image |

Exact dependency versions are pinned in `package-lock.json`.

Known development-tool exception: `npm audit` currently reports four moderate entries from the same deprecated esbuild chain inside `drizzle-kit@0.31.10`. The application does not use that esbuild copy at runtime. The repository intentionally avoids npm overrides and will take the upstream fix when it reaches a stable Drizzle Kit release.

## Prerequisites

For the default local workflow, install:

- Node.js 24 or newer.
- npm 11.17.0 or a compatible npm 11 release.

Docker Desktop or another Docker Compose-compatible runtime is optional and is only needed for PostgreSQL/container parity.

Confirm the local runtime:

```bash
node --version
npm --version
```

The Node version must be at least 24. The repository declares npm 11.17.0 in `package.json`, and all install, build, database, and Docker workflows use npm directly.

## Quick start: file-persistent PGlite

From the repository root:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

No PostgreSQL service is required. On the first database access, the application:

1. Creates `.data/pglite`.
2. Applies the ordered SQL migrations in `drizzle/`.
3. Inserts deterministic development data.
4. Serves the current month's budget, with the previous month seeded as history so carryover behavior is visible immediately.

The database persists between development-server restarts and is ignored by Git.

Authentication is bypassed by default in non-production so product work can begin immediately. See [Using real authentication locally](#using-real-authentication-locally) to exercise the sign-in flow.

### Open the development app on a phone

Connect the phone and development computer to the same trusted local network, then start the server with LAN access:

```bash
npm run dev:mobile
```

On macOS, find the current Wi-Fi address with:

```bash
ipconfig getifaddr en0
```

Open `http://<mac-ip-address>:3000` on the phone. For example, an address of `192.168.1.50` becomes `http://192.168.1.50:3000`.

At development-server startup, `next.config.ts` automatically allows the computer's active IPv4 network addresses to access Next.js development assets. Restart `npm run dev:mobile` after changing Wi-Fi networks or receiving a different local address. Client-generated UUIDs also include a fallback for plain-HTTP LAN development, where browsers may withhold secure-context crypto APIs.

Use this only on a trusted network. Real Better Auth sessions also require `BETTER_AUTH_URL` to exactly match the LAN origin; the default `AUTH_BYPASS=true` workflow does not.

### Optional environment file

The application has safe local defaults, so an environment file is not required for the PGlite quick start. To make settings explicit or customize them:

```bash
cp .env.example .env.local
```

Do not commit `.env.local` or real credentials.

## Application routes

| Route            | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `/`              | Budget plan, month summary, category groups, and month activity        |
| `/transactions`  | Search and manage expenses plus refund-backed Income entries           |
| `/income`        | Expected-income plans and received-income receipts                     |
| `/organize`      | URL-backed Settings detail for category/item organization and ordering |
| `/settings`      | Security/session controls and non-production failure scenarios         |
| `/sign-in`       | Shared household owner sign-in                                         |
| `/api/snapshot`  | Authenticated canonical month snapshot                                 |
| `/api/mutations` | Validated/idempotent mutation endpoint and mutation status lookup      |
| `/api/live`      | Process-only container liveness check                                  |
| `/api/ready`     | Database-backed traffic readiness check                                |
| `/api/health`    | Backward-compatible alias for `/api/ready`                             |
| `/api/auth/*`    | Better Auth handlers                                                   |

Month-aware routes accept a query such as `?month=2026-08` and default to the current month. The UI preserves the selected month when moving between primary sections.

### Transaction history and filters

The Transactions route is intentionally different from the combined activity
surfaces. It contains expense and refund records only, labels refunds as
**Income**, and does not duplicate received-income or paycheck receipts from the
Income page.

Search matches the merchant, budget-item subtitle, and note. The All, Expenses,
and Income pills apply immediately, while the sliders button opens a filter
sheet whose changes stay drafts until **Apply filters** is pressed.
`docs/agents/design.md` holds the precise filter, badge, and clear-control
contract.

## Seeded development data

The local seed builds a household scenario in the current month, with the previous month seeded as carryover history. Its merchants, amounts, categories, and structure are fixed, so every reset produces the same scenario; only the calendar months follow today's date, which keeps a fresh checkout from opening on an empty month. It includes:

- Category and budget-item structure.
- Planned amounts.
- Carryover-enabled items and prior-month history.
- Expected-income rows and received-income receipts.
- Expenses, refunds, and received-income activity. The Transactions view omits received-income receipts and labels refunds as Income.

The seed is idempotent: repeated application does not intentionally duplicate the deterministic scenario. It exists for local development and verification, is never invoked by production database initialization, and refuses to run when `NODE_ENV=production`.

## Environment variables

The example values are in `.env.example`.

| Variable                    | Default/example             | Purpose                                                                                            |
| --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_KIND`             | `pglite`                    | Selects `pglite` or `postgres`.                                                                    |
| `PGLITE_DATA_DIR`           | `.data/pglite`              | File-persistent PGlite directory.                                                                  |
| `DATABASE_URL`              | Local `postgres://...` URL  | Complete PostgreSQL connection URL. It takes precedence over individual connection variables.      |
| `DATABASE_HOST`             | `localhost`                 | PostgreSQL host when `DATABASE_URL` is absent.                                                     |
| `DATABASE_PORT`             | `5432`                      | PostgreSQL port when `DATABASE_URL` is absent.                                                     |
| `DATABASE_USER`             | `better_budget`             | PostgreSQL user when `DATABASE_URL` is absent.                                                     |
| `DATABASE_PASSWORD`         | `better_budget`             | PostgreSQL password when `DATABASE_URL` is absent. Never use this development value in production. |
| `DATABASE_NAME`             | `better_budget`             | PostgreSQL database when `DATABASE_URL` is absent.                                                 |
| `DATABASE_POOL_SIZE`        | `5`                         | Maximum PostgreSQL connection-pool size. Keep it small for lightweight deployments.                |
| `DATABASE_SSL`              | `disable` locally           | `disable`, `require`, or `verify-full`. Production requires `verify-full`.                         |
| `DATABASE_SSL_CA`           | unset                       | Trusted PostgreSQL CA bundle. Production requires the RDS/global PEM bundle.                       |
| `MIGRATIONS_PRESTART`       | unset                       | Set to `true` when the container prestart already applies migrations.                              |
| `BETTER_AUTH_SECRET`        | development placeholder     | Better Auth signing secret. Production requires a strong random value of at least 32 characters.   |
| `BETTER_AUTH_URL`           | `http://localhost:3000`     | Public application origin used by Better Auth. Must match the origin being used.                   |
| `AUTH_BYPASS`               | `true` locally              | Bypasses login in non-production development. Must be `false` in production.                       |
| `ALLOW_INSECURE_LOCAL_AUTH` | `false`                     | Additional local-container guard for auth bypass. Never enable in production.                      |
| `APP_BUILD_SHA`             | unset                       | Public build-time Git revision shown in Settings; the production workflow supplies `github.sha`.   |
| `BOOTSTRAP_OWNER_EMAIL`     | `family@betterbudget.local` | Email used by the one-time shared-owner bootstrap command.                                         |
| `BOOTSTRAP_OWNER_PASSWORD`  | local placeholder           | Password used only when the bootstrap creates a new owner; minimum 10 characters.                  |
| `BETTER_BUDGET_BOOTSTRAP`   | command-managed             | Limits the signup exception to the one-time owner command.                                         |

The application also respects standard `NODE_ENV` and `CI` values in their normal contexts.

Next.js automatically loads `.env.local` for `dev` and `build`. The production preflight that runs before `npm start` and the standalone `npm run db:*` scripts read the shell environment directly; they do not automatically load `.env.local`. Export or prefix the required values for those commands. Production container platforms must inject them through runtime environment and secret references.

Production startup fails before migrations or HTTP serving unless PostgreSQL, migration prestart, verified TLS, a non-placeholder Better Auth secret, the HTTPS auth origin, and disabled auth-bypass guards are all configured. The local full-Compose profile is the only explicit exception: it requires both local auth-bypass guards and a loopback `BETTER_AUTH_URL`.

## Database workflows

### Default PGlite workflow

`npm run dev` selects PGlite unless `DATABASE_KIND` says otherwise. Migrations and deterministic seeding occur automatically when the database singleton is first opened.

Useful explicit commands:

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` applies migrations using the selected database adapter. `db:seed` applies the deterministic seed to the selected database.

### Reset and reseed local PGlite

To return to a known scenario:

1. Stop the development server so the PGlite files are not open.
2. Run the guarded reset.
3. Start the application again.

```bash
npm run db:reset
npm run dev
```

The next database access recreates, migrates, and seeds `.data/pglite`.

The reset script is deliberately restrictive. It refuses to run in production, refuses PostgreSQL, and refuses targets outside the repository's `.data` directory. It permanently removes the selected local PGlite data, so export anything valuable before running it.

### PostgreSQL parity with Docker

Start only the database service:

```bash
docker compose up -d postgres
docker compose ps
```

The included service exposes PostgreSQL 17 on `localhost:5432` with these development-only credentials:

```text
database: better_budget
user: better_budget
password: better_budget
```

Copy the example environment if needed, then start Next.js with the PostgreSQL adapter:

```bash
cp .env.example .env.local
npm run dev:postgres
```

`npm run dev:postgres` sets `DATABASE_KIND=postgres`; the default `DATABASE_URL` in `.env.example` points to the Compose service. On first access the app migrates and seeds PostgreSQL unless `MIGRATIONS_PRESTART=true` is set.

Check database readiness:

```bash
curl --fail http://localhost:3000/api/ready
```

Stop the service while preserving its named volume:

```bash
docker compose stop postgres
```

### Full container-boundary workflow

To build and run the production-style application image plus PostgreSQL:

```bash
docker compose --profile full up --build
```

Open `http://localhost:3000` and verify:

```bash
curl --fail http://localhost:3000/api/live
curl --fail http://localhost:3000/api/ready
docker compose --profile full ps
```

The `app` service:

- Uses the standalone multi-stage image.
- Runs as a non-root user.
- Waits for PostgreSQL health.
- Runs the advisory-lock-protected production migration prestart.
- Uses process-only liveness and database-backed readiness endpoints.
- Enables the two explicit local auth-bypass guards for this Compose-only workflow.

Stop the containers while preserving the database volume:

```bash
docker compose --profile full stop
```

Remove containers and the network while preserving the volume:

```bash
docker compose --profile full down
```

Do not add `--volumes` unless you intend to permanently delete the local Compose database.

### Schema changes and migrations

The Drizzle schema is defined in `src/db/schema.ts`; generated SQL migrations are committed under `drizzle/`.

For a schema change:

1. Update `src/db/schema.ts` and associated domain/server types.
2. Generate a new migration.
3. Inspect the generated SQL and constraints.
4. Apply it to a fresh/reset PGlite database.
5. Apply it to PostgreSQL.
6. Run Prettier formatting and its read-only check, then strict typecheck, lint, production build, and focused manual browser checks relevant to the change.

```bash
npm run db:generate
npm run db:migrate
```

The default migration command targets PGlite. To explicitly migrate the local Compose PostgreSQL database from the host shell:

```bash
DATABASE_KIND=postgres \
DATABASE_URL=postgres://better_budget:better_budget@localhost:5432/better_budget \
DATABASE_SSL=disable \
npm run db:migrate
```

Never rewrite an already-applied migration to alter existing environments. Add a new ordered migration instead.

## Using real authentication locally

Public registration is disabled. Development normally uses `AUTH_BYPASS=true`, but the repository provides a one-time owner bootstrap command.

Create or update `.env.local` with at least:

```dotenv
AUTH_BYPASS=false
BETTER_AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
BOOTSTRAP_OWNER_EMAIL=family@example.com
BOOTSTRAP_OWNER_PASSWORD=choose-a-strong-password
```

Export the same values for the standalone bootstrap process, then create the owner once against the selected database:

```bash
export DATABASE_KIND=pglite
export PGLITE_DATA_DIR=.data/pglite
export BETTER_AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
export BETTER_AUTH_URL=http://localhost:3000
export BOOTSTRAP_OWNER_EMAIL=family@example.com
export BOOTSTRAP_OWNER_PASSWORD=choose-a-strong-password
npm run db:owner
```

For PostgreSQL, export `DATABASE_KIND=postgres` and the appropriate `DATABASE_URL` instead of the two PGlite values.

Then start the application:

```bash
npm run dev
```

Open `http://localhost:3000/sign-in` and use the configured email/password. The settings route exposes sign-out, password-change, and other-session-revocation controls.

Important behavior:

- Public sign-up remains disabled unless Better Auth is running inside `npm run db:owner`.
- The password must be at least 10 characters.
- The command is idempotent for the same email: it creates or reuses the Better Auth user, creates the empty household when needed, and ensures the owner membership.
- The command refuses to attach a different owner after the shared household already has one.
- Keep `AUTH_BYPASS=false` and `ALLOW_INSECURE_LOCAL_AUTH=false` in any real deployment.
- Every authenticated request resolves the owner membership on the server; client-provided household identifiers are never authorization.

### Production owner bootstrap container

The regular runtime image intentionally excludes source files and development tooling. Build the dedicated one-time bootstrap target from the same revision:

```bash
docker build \
    --platform linux/amd64 \
    --target owner-bootstrap \
    --tag better-budget-owner-bootstrap:local \
    .
```

Run that image once with the same production database, TLS, Better Auth, and migration-prestart values as the application plus `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD`. The `db:owner` command sets its internal bootstrap guard itself. Do not set `BETTER_BUDGET_BOOTSTRAP` on the long-running application task. The database must already be migrated.

The long-running production task must provide:

```dotenv
DATABASE_KIND=postgres
DATABASE_URL=postgres://user:password@database.example:5432/better_budget
DATABASE_POOL_SIZE=5
DATABASE_SSL=verify-full
DATABASE_SSL_CA=<trusted PostgreSQL CA bundle>
MIGRATIONS_PRESTART=true
BETTER_AUTH_SECRET=<high-entropy secret of at least 32 characters>
BETTER_AUTH_URL=https://budget.example.com
AUTH_BYPASS=false
ALLOW_INSECURE_LOCAL_AUTH=false
```

Keep `DATABASE_URL`, `DATABASE_SSL_CA`, and `BETTER_AUTH_SECRET` in the deployment secret store. The CA may be injected as a multiline PEM or with literal `\n` separators. Do not include `ssl`, `sslmode`, `sslcert`, `sslkey`, or `sslrootcert` query parameters in `DATABASE_URL`; the shared connection policy owns TLS for the application, migrations, and bootstrap command.

### Automatic production deployment from GitHub

Pushes to `main` run `.github/workflows/deploy-production.yml`. The workflow
uses GitHub OIDC to obtain temporary AWS credentials, builds the `runtime`
Docker target for `linux/amd64`, pushes an image tagged with the Git commit SHA,
finds the one running EC2 instance tagged `Application=better-budget` and
`Environment=production`, and invokes its deployment helper through Systems
Manager. The helper pulls before stopping the current container, waits for
`/api/live` and `/api/ready`, and restores the prior image automatically if the
candidate fails. The workflow fails closed unless the production ECR repository
uses immutable tags, and safely reuses an existing commit image when a workflow
is rerun. Its external actions and the Node runtime base image are pinned to
immutable commit and image digests.

The workflow does not store AWS access keys or application secrets in GitHub.
The instance role reads the existing Secrets Manager value at each service
start. Secret values remain in process memory and memory-backed files rather
than GitHub, systemd configuration, Docker arguments, or persistent host files.

The EC2 and CloudFront migration is complete. The
[`production operations runbook`](docs/aws/ec2-cloudfront-migration.md) records
the live resource inventory and recovery procedure. The lasting GitHub
configuration is:

1. Open IAM **Identity providers**, choose **Add provider**, and select
   **OpenID Connect**.
2. Use `https://token.actions.githubusercontent.com` for the provider URL and
   `sts.amazonaws.com` for the audience. Skip this step if that provider
   already exists in account `563692880710`.
3. In IAM **Policies**, create a customer-managed policy from
   [`docs/aws/github-actions-deploy-policy.json`](docs/aws/github-actions-deploy-policy.json).
4. Create the IAM role `better-budget-github-deploy`, select the GitHub OIDC
   provider as its trusted identity, and attach the policy from the previous
   step.
5. Open the role's **Trust relationships**, choose **Edit trust policy**, and
   replace it with
   [`docs/aws/github-actions-trust-policy.json`](docs/aws/github-actions-trust-policy.json).
6. Configure ECR repository `better-budget/app` with image-tag mutability set to
   **Immutable**.
7. In GitHub **Settings**, **Secrets and variables**, **Actions**, create the
   repository variable `PRODUCTION_URL` with the exact CloudFront HTTPS origin
   and no trailing slash.

The trust policy accepts tokens only for this repository's immutable GitHub
owner/repository IDs and the `main` branch. The permissions policy can inspect
and push only to `better-budget/app` and send the fixed deployment command only
to the correctly tagged production instance. It cannot change ECR repository
settings, update ECS, or pass an ECS role. Publish an updated version of the
customer-managed policy before the next deployment whenever its version-
controlled JSON changes.

This configuration is the required production state. For a replacement account
or disaster recovery, recreate it exactly and validate one manual deployment
before relying on pushes to `main`. Production startup applies only missing
migrations before serving traffic; it does not seed, reset, or bootstrap RDS.

Each deployment keeps the current and preceding image locally and leaves the
commit-tagged ECR images available for rollback. Run the workflow manually with
an existing full SHA in `image_tag` to skip the build and redeploy that image.

The production image also embeds that commit SHA as public build metadata. The
Settings page reads the app version and description from `package.json` and
shows the first seven commit characters beside its production-build label. Its
Budget section explains the fixed USD and `America/Chicago` configuration,
stores the default Available/Planned amount view per browser or installed PWA,
and opens the category and budget-item organizer for the selected month. The
organizer uses mobile push navigation with Back, browser history, and a
left-edge swipe to dismiss, plus the shared centered modal on desktop. Its
collapsible Budget-style list supports hold-to-drag and keyboard reordering,
category appearance and item-name editing, history-preserving deletion, and
permanent deletion of unused definitions. New structure remains a Budget-page
task rather than an organizer action.

## Release versioning

Better Budget follows Semantic Versioning from `1.0.0`. Each completed
application change set receives exactly one bump: patch for backward-compatible
fixes and corrections, minor for backward-compatible features, major for
incompatible changes requiring migration or coordinated adoption. A mixed change
set takes the highest applicable bump. `package.json` is canonical and the root
versions in `package-lock.json` must stay synchronized. Changes limited to
documentation, comments, formatting, or read-only investigation do not bump.

`AGENTS.md` holds the full classification guide and the requirement that every
major release adds a version section to both files. The Version 2 sections are
the worked example.

## Eager persistence model

The application is intentionally optimistic for safe, fully validated operations. A normal write follows this sequence:

```text
Server-render canonical month snapshot
              |
              v
Hydrate TanStack Query client cache
              |
              v
Validate form -> capture narrow rollback -> apply optimistic patch
              |                              |
              |                              v
              +----------------------> UI changes immediately
              |
              v
Send clientMutationId + expectedVersion
              |
              v
Atomic server transaction + mutation receipt
              |
              v
Replace cache with canonical server snapshot
```

The guarantees that matter when reading the code: safe actions update within one
animation frame and under the 100 ms acceptance target; every mutation carries a
unique `clientMutationId`; the mutation receipt commits atomically with the
financial change, so retries cannot duplicate transactions, receipts,
allocations, or copied months; direct versioned edits send `expectedVersion` and
a mismatch produces a conflict rather than an overwrite; routine success is
silent; and offline financial writes are not queued in version 1.

Server-confirmed actions such as month copy, plan clearing, archival with
history, password changes, and cross-month transaction moves show only a local
pending state. The client refreshes authoritative state on focus, route/month
navigation, successful writes, and a lightweight visible-tab interval.

`docs/agents/persistence.md` holds the full mutation lifecycle rules, the
safe-versus-server-confirmed operation lists, and the reconciliation contract.

### Failure scenario panel

In non-production, open `/settings` to simulate:

- Normal persistence.
- Approximately 1.8 seconds of latency.
- Timeout/ambiguous completion.
- Transient failure and retry recovery.
- Version conflict.
- Validation failure.
- Offline state.

Use the panel to verify saving feedback, retry behavior, isolated rollback, retained drafts, and canonical reconciliation. It is intentionally unavailable as production behavior.

## Financial rules

Financial correctness is shared between optimistic client patches and
authoritative server services. The rules a reader needs up front:

- All monetary values are signed integer cents in code and PostgreSQL `bigint`
  in storage, serialized as base-10 strings. JavaScript floating-point
  arithmetic is never used for money.
- A month key has the validated `YYYY-MM` form.
- `Left to budget = expected income - planned amounts`. Received income is
  tracked separately and does not change that math.
- `Available = planned - net spending + carry in`, where refunds and credits
  reduce net spending.
- Carryover is derived chronologically from history, so correcting an older
  transaction or plan changes every later affected month. Both positive and
  negative balances carry.
- Every transaction owns at least one allocation, and split allocation cents
  must equal the transaction total exactly.

`AGENTS.md` holds all sixteen numbered financial invariants, including the
copy, clear, reset, archive, and cross-month-move rules. Changes to any of them
must update `src/domain/`, server services, mutation contracts, optimistic
patches, and documentation together.

## Verification

The repository intentionally has no unit, component, or end-to-end test suite.
Use static checks plus focused manual verification appropriate to the change.

```bash
npm run lint:fix
npm run format
npm run format:check
npm run typecheck
npm run lint
npm run build
```

Run `lint:fix` before `format`, because ESLint's structural fixes can add or
remove blank lines that Prettier must then normalize. The read-only
`format:check` and `lint` commands — not merely the autofix commands — must pass
before handoff. `npm run build` produces the standalone output used by the
Docker image; it also rewrites `next-env.d.ts` to its production form, so run
`git checkout -- next-env.d.ts` afterward rather than committing the flip.

Prettier owns deterministic source layout: an 80-character print width,
four-space indentation using spaces, single quotes in JavaScript/TypeScript and
JSX, semicolons, LF endings, and no trailing commas. ESLint Stylistic
complements it with structural whitespace. Because comment separation and
variable grouping are enforced together, an own-line comment cannot sit between
two consecutive `const`, `let`, or `var` declarations, and `npm run lint:fix`
cannot resolve that combination — use a trailing comment, a block or
object-literal start, or a position above a preceding non-declaration statement.

For financial changes, manually exercise the affected exact-money, carryover,
split, optimistic reconciliation, retry, conflict, and authorization flows. For
database changes, also verify PGlite reset/migration and PostgreSQL parity. For
container changes, build the full Compose profile and check `/api/live` plus
`/api/ready`.

### Pre-handoff check

The full pre-handoff sequence — autofix order, verification commands, the
`next-env.d.ts` restore, and the required version bump — is the **Definition of
done** in `AGENTS.md`. Coding agents can run it with the `/handoff` command in
`.claude/commands/handoff.md`.

## Package scripts

| Command                | Description                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start Next.js development using the environment-selected database, PGlite by default.           |
| `npm run dev:mobile`   | Start development on all local interfaces for testing from a phone on the same trusted network. |
| `npm run dev:postgres` | Start development while forcing `DATABASE_KIND=postgres`.                                       |
| `npm run build`        | Create a production webpack/standalone build.                                                   |
| `npm run start`        | Validate production configuration and serve the previously built application.                   |
| `npm run format`       | Format all supported repository files with the pinned Prettier version.                         |
| `npm run format:check` | Check repository formatting without writing files.                                              |
| `npm run lint`         | Run ESLint over the repository.                                                                 |
| `npm run lint:fix`     | Apply ESLint autofixes, including structural blank-line rules.                                  |
| `npm run typecheck`    | Run strict TypeScript checking without emit.                                                    |
| `npm run verify`       | Read-only gate: `format:check`, then `typecheck`, then `lint`.                                  |
| `npm run verify:fix`   | Apply ESLint autofixes and Prettier, then run the read-only gate.                               |
| `npm run db:generate`  | Generate a new Drizzle migration from schema differences.                                       |
| `npm run db:migrate`   | Apply migrations to the selected database.                                                      |
| `npm run db:seed`      | Insert the deterministic development scenario; refuses production.                              |
| `npm run db:reset`     | Guarded deletion of the local PGlite data directory.                                            |
| `npm run db:inspect`   | Print months with planned/spent totals and transaction counts. Stop dev servers first.          |
| `npm run db:owner`     | Idempotently create the shared owner, empty household, and membership.                          |

The database CLI scripts intentionally set the `react-server` Node condition because they execute server-only modules outside a Next.js process.

## Project structure

```text
.
├── drizzle/                       Ordered SQL migrations
├── docs/
│   ├── agents/                    On-demand engineering references
│   ├── aws/                       AWS runbook and least-privilege policies
│   └── design/                    Approved visual concepts
├── public/                        PWA icons and static files
├── scripts/
│   ├── aws/                       Private EC2 bootstrap and deployment host
│   ├── create-owner.ts            Shared-owner bootstrap
│   ├── generate-ios-startup-images.mjs
│                                  iOS launch-image generator
│   ├── migrate.ts                 Development migration command
│   ├── migrate-production.mjs     Advisory-lock container prestart
│   ├── reset-local.ts             Guarded local PGlite reset
│   ├── seed.ts                    Explicit deterministic seed command
│   └── validate-production-environment.mjs
│                                  Production startup validation
├── src/
│   ├── app/                       App Router pages, metadata, and API routes
│   ├── components/budget/         Responsive views, sheets, forms, query logic
│   ├── components/ui/             Sheet, gesture, sortable, and input primitives
│   ├── db/                        Drizzle schema, adapters, migrations, seed
│   ├── domain/                    Exact money, calculations, and shared types
│   ├── lib/                       Authentication and supporting libraries
│   └── server/                    Access checks, contracts, and budget services
├── .claude/                       Project permissions and the /handoff command
├── AGENTS.md                      Durable implementation guide for coding agents
├── compose.yaml                   PostgreSQL and full-app Compose services
├── Dockerfile                     Runtime and owner-bootstrap image targets
└── package.json                   Toolchain, dependencies, and commands
```

## PWA and accessibility

The application installs as **Better Budget** with white-background `any` and maskable icons, white theme/background metadata, safe-area support, and standalone display configuration. To verify installation behavior, use a production build or a browser environment that permits local PWA installation; installed icon changes can remain cached by iOS and may require removing and reinstalling the home-screen app.

On mobile, the app intentionally disables pinch/double-tap page zoom, text
selection, touch callouts, document-level pull-to-refresh, and cancelable Safari
history gestures beginning in the leftmost 20 px. Each route scrolls inside the
app content surface behind the translucent blurred bottom navigation. Sheets use
a transparent overlay, shared entrance/exit motion, a fixed header, an
independently scrolling body, and downward drag-to-dismiss on mobile.
Budget-item and income-source details push over the page from the right on
mobile and remain centered modals on desktop.

`docs/agents/design.md` holds the exact gesture, motion, swipe, reordering, and
navigation-detail contracts these behaviors must satisfy.

The iOS launch images under `public/ios-startup/` are generated assets, not
hand-authored ones. `scripts/generate-ios-startup-images.mjs` rebuilds them from
`public/better-budget-icon-512-v3.png` and the viewport list in
`src/app/ios-startup-viewports.json`:

```bash
node scripts/generate-ios-startup-images.mjs
```

It is a deliberate one-time asset command with no npm script. `sharp` is a
declared devDependency for exactly this purpose. Regenerate and commit the
output only when the source icon or the viewport list changes.

UI changes should preserve:

- 44 px minimum touch targets.
- Logical keyboard focus movement and focus return for sheets/dialogs.
- Visible focus styles.
- Accessible names for icon-only controls.
- Status announcements for saving, failure, retry, conflict, and offline state.
- Reduced-motion behavior.
- Mobile safe-area padding.
- Usability at 390 x 844 and 1440 x 1000 reference viewports.

## Troubleshooting

### The app opens with old or unexpected data

The PGlite database is intentionally persistent. Stop the development server and run:

```bash
npm run db:reset
npm run dev
```

This permanently replaces local PGlite data with the deterministic scenario on next access.

### Port 3000 is already in use

Stop the existing process or existing Compose application before starting Next.js. A different application on port 3000 will prevent Better Budget from starting.

### The app loads on a phone but buttons or sheets do not respond

Stop and restart the server with `npm run dev:mobile`, then reload the phone page using the computer's current LAN IPv4 address. Next.js reads its allowed development origins at startup, so an old process will not recognize an address obtained after a network change.

### PostgreSQL cannot connect

Check service health and port mapping:

```bash
docker compose ps
docker compose logs postgres
```

Then verify `DATABASE_KIND=postgres` and that `DATABASE_URL` points to `localhost:5432` when Next.js runs on the host. Inside Compose, the application uses the `postgres` service hostname instead.

### Sign-in redirects back to sign-in

Check that:

- `AUTH_BYPASS=false` when using real sessions.
- The owner was bootstrapped into the same selected database the app is using.
- `BETTER_AUTH_URL` exactly matches the browser origin.
- `BETTER_AUTH_SECRET` is stable across restarts.
- The credentials match `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD` used at bootstrap time.

### A mutation reports a conflict

The server rejected an outdated `expectedVersion`, normally because the entity changed in another tab/device or after a refetch. Let the app load the authoritative snapshot, review the newer value, and reapply the intended edit. Do not work around conflicts by disabling version checks.

### A transaction split is rejected

Enter non-negative allocation amounts whose exact cent sum equals the transaction total and choose valid budget items for the transaction month. Cross-month edits may require reselecting destination allocations.

### The full Docker app is unhealthy

Inspect both services:

```bash
docker compose --profile full ps
docker compose --profile full logs postgres
docker compose --profile full logs app
```

The app validates production configuration, waits for PostgreSQL, runs migration prestart, then serves port 3000. Check `/api/live` for the process and `/api/ready` for database connectivity. A validation, migration, connection, or readiness failure should appear in the application logs.

## Version 1 non-goals

The current scope intentionally excludes bank syncing, account reconciliation, recurring transactions, multi-currency conversion, imports/exports, notifications, realtime WebSockets, queued offline writes, and multi-household/member-role workflows.

Offline form drafts are preserved where practical, but the app never claims offline financial data was saved. Version 1 requires connectivity to persist a write.

## Contributing and handoff expectations

Read `AGENTS.md` before making implementation changes. It records the architecture, financial invariants, eager-persistence contract, design rules, migration policy, and definition of done.

In particular:

- Keep all money in exact integer cents.
- Share calculation functions between optimistic and authoritative paths.
- Keep every financial mutation idempotent and version-aware where applicable.
- Keep database writes atomic.
- Preserve household authorization on the server.
- Manually verify affected financial and persistence behavior in proportion to risk.
- Update this README and `AGENTS.md` whenever commands, environment variables, architecture, or product behavior change.
