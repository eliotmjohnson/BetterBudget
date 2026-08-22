# Better Budget

Better Budget is a mobile-first household budgeting PWA with eager updates, exact-cent accounting, month-specific plans, income tracking, split transactions, historical carryover, and a PostgreSQL-ready backend.

It is designed for one household using one shared owner login. The default development workflow needs no external database: Next.js automatically migrates and seeds a file-persistent PGlite database. The same application can run against PostgreSQL locally or through the provider-neutral Docker image.

## Current status

Version 1 implements the complete local product foundation:

- Separate budgets and notes for each calendar month.
- Immediate previous/next month navigation.
- Copying the immediately previous month into an empty target month when the
  source has active budget structure or an expected-income plan, with clear
  feedback when there is nothing to copy. The month-actions list omits copy
  when either side is ineligible.
- Untouched months begin without category or line-item structure and show setup actions to copy the previous budget or start with a new category. Viewing or navigating through one does not create a `budget_months` record; the first successful mutation that needs the month creates it atomically.
- Clearing planned amounts without deleting transactions, income receipts, structure, or carryover settings.
- Resetting a selected month to a fresh empty budget without changing any other month. Definitions still used elsewhere are preserved, while definitions left unused by the reset are removed.
- Categories and budget items with add, rename, reorder, archive, and unused-definition deletion flows. Category names, icons, colors, and deletion are managed from the Budget page; budget-item deletion is revealed with a left swipe. Holding a category header or item row for 350 ms starts reordering without visible drag grips. The interaction uses a transition-free lifted preview, a target-following faded placeholder, interruptible transform-based list reflow, accessible keyboard controls, and gently accelerated edge auto-scroll. Moving more than 8 px before activation cancels the hold so normal scrolling and item swipe-to-delete remain reliable. React and the backend receive the final order once on drop, and progress-bar entrance animations do not replay during sorting.
- Available amounts are shown by default on the Budget page, with a stable-width animated switch to Planned amounts. Each line-item progress bar starts full when its available balance is untouched and shrinks in proportion as net spending consumes that balance. A negative balance switches to a coral striped warning bar.
- Budget-item details use a URL-backed iOS-style navigation push on mobile, including browser history and an app-controlled left-edge swipe-to-go-back. The Budget back control and editable item title stay in the fixed detail header while only the detail body scrolls. The underlying swipe remains disabled while an add/edit transaction sheet is visible or exiting. Across every route, cancelable touches beginning in the leftmost 20 px are claimed immediately outside controls, while controls retain normal taps and every drag from that strip is prevented regardless of direction so Safari cannot claim it as a history gesture. Desktop retains the centered detail modal. A floating blue plus button at the bottom right opens the transaction sheet with the current budget item already selected.
- Planned amount editing and forward-looking per-month carryover settings. A
  month's switch sends its ending balance to the immediately following month;
  it does not change that month's inbound balance.
- Cents-first currency inputs that always display a formatted value such as `$200.57`; typing digits shifts them through the decimal places without requiring a decimal point.
- Expected-income sources with editable names, icons, and colors plus per-source received-transaction history,
  soft deletion of individual receipts, and safe source deletion after its
  receipts are cleared. Income-source details use the same URL-backed mobile
  navigation push, Back behavior, left-edge swipe dismissal, and desktop modal
  fallback as budget-item details. Empty months show a guided state that opens
  the existing add-source flow.
- Expenses and refunds with merchant, date, note, allocation, exact split support, editing, soft deletion, and Undo.
- Transaction search with a non-refocusing clear control, immediately applied type pills, and a full draft-before-apply filter sheet for transaction type, budget item, and split status. Applied filters receive a distinct icon/count treatment and an outside Clear action directly after the inline pills.
- Optimistic updates, idempotent mutation retries, conflict detection, rollback isolation, and offline feedback.
- Better Auth email/password sessions with public signup disabled.
- Mobile bottom navigation, desktop side navigation, responsive summary rail, PWA metadata/icons, and accessible sheets.
- PGlite, PostgreSQL, and Docker development paths.

Approved design references live in [`docs/design`](./docs/design).

## Version 2 deployment release

Version `2.0.0` keeps the Version 1 budgeting product and database model while
changing the coordinated production deployment architecture:

- The public application is served by CloudFront from a single private
  `t3a.micro` EC2 VPC origin. The instance has no public IPv4, SSH access, NAT
  gateway, or load balancer.
- The existing RDS database, shared owner, ECR repository, Secrets Manager
  secret, production validation, migration prestart, and health endpoints are
  retained without a data migration.
- Pushes to `main` deploy immutable `linux/amd64` images through GitHub OIDC and
  Systems Manager. Failed liveness or readiness automatically restores the
  previous image tag.
- The production URL changes from the ECS Express hostname to the generated
  CloudFront hostname. Existing browser sessions do not cross origins, and both
  users must sign in and reinstall the PWA from the new URL before ECS is
  removed.
- ECS task-definition deployment is no longer supported by the production
  workflow. Operators must complete the one-time AWS console migration in
  [`docs/aws/ec2-cloudfront-migration.md`](docs/aws/ec2-cloudfront-migration.md)
  before pushing this release to `main`.

Version 2 does not expand the product into multiple households, invitations,
bank syncing, recurring automation, imports/exports, multiple currencies,
notifications, realtime push, or offline financial writes. The Version 1
financial, authentication, and provider-neutral container boundaries remain in
force.

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
http://localhost:3000/?month=2026-08
```

No PostgreSQL service is required. On the first database access, the application:

1. Creates `.data/pglite`.
2. Applies the ordered SQL migrations in `drizzle/`.
3. Inserts deterministic development data.
4. Serves the August 2026 budget, with July 2026 history available for carryover behavior.

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

Open `http://<mac-ip-address>:3000/?month=2026-08` on the phone. For example, an address of `192.168.1.50` becomes `http://192.168.1.50:3000/?month=2026-08`.

At development-server startup, `next.config.ts` automatically allows the computer's active IPv4 network addresses to access Next.js development assets. Restart `npm run dev:mobile` after changing Wi-Fi networks or receiving a different local address. Client-generated UUIDs also include a fallback for plain-HTTP LAN development, where browsers may withhold secure-context crypto APIs.

Use this only on a trusted network. Real Better Auth sessions also require `BETTER_AUTH_URL` to exactly match the LAN origin; the default `AUTH_BYPASS=true` workflow does not.

### Optional environment file

The application has safe local defaults, so an environment file is not required for the PGlite quick start. To make settings explicit or customize them:

```bash
cp .env.example .env.local
```

Do not commit `.env.local` or real credentials.

## Application routes

| Route            | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `/`              | Budget plan, month summary, category groups, and month activity         |
| `/transactions`  | Search and manage expenses plus refund-backed Income entries            |
| `/income`        | Expected-income plans and received-income receipts                      |
| `/organize`      | Category/item organization, ordering, carryover, archive, and additions |
| `/settings`      | Security/session controls and non-production failure scenarios          |
| `/sign-in`       | Shared household owner sign-in                                          |
| `/api/snapshot`  | Authenticated canonical month snapshot                                  |
| `/api/mutations` | Validated/idempotent mutation endpoint and mutation status lookup       |
| `/api/live`      | Process-only container liveness check                                   |
| `/api/ready`     | Database-backed traffic readiness check                                 |
| `/api/health`    | Backward-compatible alias for `/api/ready`                              |
| `/api/auth/*`    | Better Auth handlers                                                    |

Month-aware routes accept a query such as `?month=2026-08`. The UI preserves the selected month when moving between primary sections.

### Transaction history and filters

The Transactions route is intentionally different from the combined activity surfaces. It contains expense and refund records only, labels refunds as **Income**, and does not duplicate received-income or paycheck receipts from the Income page.

The transaction controls follow these interaction rules:

- Search matches the merchant, budget-item subtitle, and note. Its clear icon appears only for a populated query, empties the query, and does not return focus to the input.
- The visible All, Expenses, and Income pills apply their transaction-type choice immediately.
- The sliders button opens the full filter sheet for transaction type, budget item, and split status. Changes made there remain drafts until **Apply filters** is pressed. Closing the sheet discards the drafts.
- **Clear filters** inside the sheet resets its draft controls. It does not change the applied results until **Apply filters** is pressed.
- Applied filters give the sliders button a blue active treatment and a badge containing the number of active filter dimensions.
- While any filter is applied, an outside **Clear** control appears immediately after the Income pill in the same left-aligned row. It resets the applied type, budget-item, and split-status filters while leaving the search query unchanged.

## Seeded development data

The deterministic local seed provides a useful August 2026 household scenario, including:

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

Open `http://localhost:3000/?month=2026-08` and verify:

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
candidate fails.

The workflow does not store AWS access keys or application secrets in GitHub.
The instance role reads the existing Secrets Manager value at each service
start. Secret values remain in process memory and memory-backed files rather
than GitHub, systemd configuration, Docker arguments, or persistent host files.

Complete the console-first
[`EC2 and CloudFront migration runbook`](docs/aws/ec2-cloudfront-migration.md)
before pushing Version 2 to `main`. The lasting GitHub configuration is:

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
6. In GitHub **Settings**, **Secrets and variables**, **Actions**, create the
   repository variable `PRODUCTION_URL` with the exact CloudFront HTTPS origin
   and no trailing slash.

The trust policy accepts tokens only for this repository's immutable GitHub
owner/repository IDs and the `main` branch. The permissions policy can push only
to `better-budget/app` and send the fixed deployment command only to the
correctly tagged production instance. It cannot update ECS or pass an ECS role.

After the role exists, commit and push the workflow to `main`. Follow the first
deployment under the repository's **Actions** tab. Production startup applies
only missing migrations before serving traffic; it does not seed, reset, or
bootstrap RDS.

Each deployment keeps the current and preceding image locally and leaves the
commit-tagged ECR images available for rollback. Run the workflow manually with
an existing full SHA in `image_tag` to skip the build and redeploy that image.

The production image also embeds that commit SHA as public build metadata. The
Settings page reads the app version and description from `package.json` and
shows the first seven commit characters beside its production-build label.

## Release versioning

Better Budget follows Semantic Versioning from `1.0.0`. Each completed
application change set receives one version bump: patch for backward-compatible
fixes and corrections, minor for backward-compatible features, and major for
incompatible changes requiring migration or coordinated adoption. A mixed
change set takes the highest applicable bump. `package.json` is canonical and
the root versions in `package-lock.json` must remain synchronized. Changes
limited to documentation, comments, formatting, or read-only investigation do
not bump the application version.

Every major release also adds a new version section to this documentation while
preserving earlier sections as historical context. A Version 2 section, for
example, must summarize its new features and improvements, changed or removed
behavior, breaking changes, required migrations, compatibility boundaries, and
updated non-goals. The matching engineering details must be added to
`AGENTS.md` in the same change set.

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

Key guarantees:

- Safe actions should visibly update within one animation frame and under the 100 ms acceptance target.
- Every mutation has a unique `clientMutationId`.
- The mutation receipt is committed atomically with the financial change, so retries cannot duplicate transactions, receipts, allocations, or copied months.
- Direct versioned edits send `expectedVersion`; a mismatch produces a conflict instead of overwriting newer data.
- Routine success is silent.
- A saving indicator is delayed for roughly 400 ms so fast writes do not flash status UI.
- Idempotent transient failures retry with short exponential backoff and jitter.
- An ambiguous timeout is checked by mutation ID before rollback/retry.
- Harmless canonical differences, such as timestamps or normalized order, reconcile silently.
- Permanent failures roll back only the affected cache patch and keep useful form values.
- Offline financial writes are not queued in version 1. Drafts are retained, unsafe optimistic writes are reverted, and the offline banner remains visible.

Server-confirmed actions such as month copy, plan clearing, archival with history, password changes, and cross-month transaction moves show only a local pending state. They do not block the whole application.

The client refreshes authoritative state on focus, route/month navigation, successful writes, and a lightweight visible-tab interval. WebSockets are not required for version 1 convergence.

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

Financial correctness is shared between optimistic client patches and authoritative server services.

- All monetary values are signed integer cents in code and PostgreSQL `bigint` in storage.
- Cents are serialized as base-10 strings; JavaScript floating-point arithmetic is not used for money.
- A month key has the validated `YYYY-MM` form.
- `Left to budget = expected income - planned amounts`.
- Received income is tracked separately from expected income and does not change left-to-budget math.
- `Available = planned - net spending + carry in`. Carry in is the immediately
  previous month's ending available balance only when that previous month's
  carryover switch was enabled and the item exists in both adjacent months.
- Refunds/credits reduce net spending.
- Positive and negative balances both carry forward.
- A month's carryover switch controls whether its ending available balance
  flows into the next month. Toggling it does not change the selected month's
  inbound balance or overwrite any future month's switch.
- Carryover is derived chronologically from history. Correcting an older transaction or plan changes later affected months.
- Every transaction has at least one allocation. An unsplit transaction has one allocation, and split allocation cents must exactly equal the transaction total.
- Cross-month moves are server-confirmed and require matching valid destination allocations.
- Categories/items are household definitions; category participation, item plans, planned amounts, and carryover choices are month-specific.
- Copy is limited to the immediately preceding month, requires active budget
  structure or an expected-income plan in the source, and requires an empty
  target. Archived definitions and soft-deleted transactions do not make an
  otherwise empty target ineligible.
- Copy includes structure, order, plans, expected income, and carryover settings, so the new month's outbound switch inherits the source month's choice. It never copies transactions or received-income receipts.
- Clearing a plan preserves activity, structure, income receipts, and carryover settings.
- Resetting a budget permanently removes the selected month's structure, plans, transactions, income activity, and note while preserving every other month and its definitions. Definitions left unused across all months by the reset are permanently deleted.
- Archive keeps history. Hard deletion is only allowed for unused definitions.

Changes to these rules should update `src/domain/`, server services, mutation contracts, optimistic patches, and documentation together.

## Verification

The repository intentionally has no unit, component, or end-to-end test suite. Use the static checks and focused manual verification appropriate to the change.

```bash
npm run format
npm run format:check
npm run typecheck
npm run lint
npm run build
```

`format` writes the repository's canonical Prettier formatting, and `format:check` verifies that formatting without changing files. `typecheck` runs strict TypeScript without emitting files and rejects unused local declarations or parameters. `lint` runs the repository ESLint/Next.js configuration. `build` verifies the optimized standalone production output.

### Formatting and linting

Prettier owns deterministic source layout: an 80-character print width, four-space indentation using spaces, single quotes in JavaScript/TypeScript and JSX, semicolons, LF endings, and no trailing commas. ESLint Stylistic complements it with structural whitespace, including import and variable grouping, blank lines before returns/throws, class-member and comment separation, one statement/declaration per line, and whitespace cleanup.

When autofixes are needed, use this order so ESLint can make structural changes and Prettier can normalize the final layout:

```bash
npm run lint:fix
npm run format
npm run format:check
npm run typecheck
npm run lint
```

For meaningful application or dependency changes, follow with `npm run build`. The final read-only `format:check` and `lint` commands—not merely the autofix commands—must pass before handoff.

For financial changes, manually exercise the affected exact-money, carryover, split, optimistic reconciliation, retry, conflict, and authorization flows. For database changes, also verify PGlite reset/migration and PostgreSQL parity. For container changes, build the full Compose profile and check `/api/live` plus `/api/ready`.

### Production build

```bash
npm run build
npm run start
```

`npm run build` currently runs `next build --webpack` and produces the standalone output used by the Docker image. After the build, `npm run start` validates the production environment and serves the production build on port 3000.

### Recommended pre-handoff check

For normal application changes:

```bash
npm run format
npm run format:check
npm run typecheck
npm run lint
npm run build
```

For database changes, also verify PGlite reset/migration and PostgreSQL parity. For container changes, build the full Compose profile and check `/api/live` plus `/api/ready`.

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
| `npm run db:generate`  | Generate a new Drizzle migration from schema differences.                                       |
| `npm run db:migrate`   | Apply migrations to the selected database.                                                      |
| `npm run db:seed`      | Insert the deterministic development scenario; refuses production.                              |
| `npm run db:reset`     | Guarded deletion of the local PGlite data directory.                                            |
| `npm run db:owner`     | Idempotently create the shared owner, empty household, and membership.                          |

The database CLI scripts intentionally set the `react-server` Node condition because they execute server-only modules outside a Next.js process.

## Project structure

```text
.
├── drizzle/                       Ordered SQL migrations
├── docs/
│   ├── aws/                       AWS runbook and least-privilege policies
│   └── design/                    Approved visual concepts
├── public/                        PWA icons and static files
├── scripts/
│   ├── aws/                       Private EC2 bootstrap and deployment host
│   ├── create-owner.ts            Shared-owner bootstrap
│   ├── migrate.ts                 Development migration command
│   ├── migrate-production.mjs     Advisory-lock container prestart
│   ├── reset-local.ts             Guarded local PGlite reset
│   ├── seed.ts                    Explicit deterministic seed command
│   └── validate-production-environment.mjs
│                                  Production startup validation
├── src/
│   ├── app/                       App Router pages, metadata, and API routes
│   ├── components/budget/         Responsive views, sheets, forms, query logic
│   ├── db/                        Drizzle schema, adapters, migrations, seed
│   ├── domain/                    Exact money, calculations, and shared types
│   ├── lib/                       Authentication and supporting libraries
│   └── server/                    Access checks, contracts, and budget services
├── AGENTS.md                      Durable implementation guide for coding agents
├── compose.yaml                   PostgreSQL and full-app Compose services
├── Dockerfile                     Runtime and owner-bootstrap image targets
└── package.json                   Toolchain, dependencies, and commands
```

## PWA and accessibility

The application installs as **Better Budget** with white-background `any` and maskable icons, white theme/background metadata, safe-area support, and standalone display configuration. To verify installation behavior, use a production build or a browser environment that permits local PWA installation; installed icon changes can remain cached by iOS and may require removing and reinstalling the home-screen app.

On mobile, the app intentionally disables pinch/double-tap page zoom, text selection, touch callouts, document-level pull-to-refresh, and cancelable Safari history gestures beginning in the leftmost 20 px. Non-control touches in that strip are prevented immediately; controls retain normal taps, while every move that starts there is prevented regardless of direction. Each route scrolls inside the app content surface behind the translucent blurred bottom navigation, with bottom padding that keeps the final content reachable. The top header remains opaque. Sheets use a transparent overlay, shared entrance/exit motion, a fixed header, an independently scrolling body, and downward drag-to-dismiss on mobile. Budget-item details are the exception: they push over the Budget page from the right while the underlying page shifts left, support browser Back/Forward and a left-edge swipe to pop, and remain centered modals on desktop. Their Budget back control and editable item title remain fixed while the detail body scrolls; opening a child add/edit transaction sheet suspends the detail swipe until that sheet has fully exited.

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
