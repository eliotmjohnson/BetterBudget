# Release history

The full Version 2–6 release sections, kept as the historical record that
`docs/agents/conventions.md` requires. `AGENTS.md` keeps only each release's
load-bearing rules, under **Release guardrails**; read this file when you need
the story behind one of them, or before preparing a major release.

## Version 6 interface release

Version `6.0.0` is a user-directed major release that rolls up the 5.1–5.13
interface work (Move money, fill from Left to budget, calculator math, the
transaction hold menu, docked strips and floating add buttons, the desktop
layout rework, still focus and keyboard-fit sheets, and Better Buddy's throws
and failure recovery) with the transaction sheet's header-anchored kind
selector. `README.md` holds the full list. The Version 1 financial model,
database schema, authentication model, and every Version 2–5 deployment and
assistant rule are unchanged, and there is no migration.

These rules are load-bearing:

- **A control that must not scroll goes in `headerAccessory`.** `Sheet` renders
  it inside the fixed drag region under the title row. Buttons there stay
  tappable because a drag never starts on a `button`.
- **Every date field sits in `.date-input-shell`** with the `CalendarDays` icon.
  iOS sizes a bare `<input type='date'>` to its content, which overflowed the
  Record income sheet.
- **Income's green is `--green` (`#1eb574`) in `tokens.css`.** It is brighter
  than the `#199d67` Remaining text color at the user's request, and white text
  on it is below the AA contrast bar; do not darken it back without direction.

`docs/agents/design/sheets-and-menus.md` holds the selector and date-field
detail, and `docs/agents/design/navigation-detail.md` the strip shadow.

## Version 5 assistant release

Version `5.0.0` adds Better Buddy, an optional budget assistant: a draggable
floating robot button on every authenticated page that opens a chat driven by
Claude Haiku 4.5. It answers questions about the household's budget and commits
basic changes. The Version 1 financial model, database schema, authentication
model, and every Version 2–4 deployment rule are unchanged.

These rules are load-bearing:

- **Assistant writes go through `applyBudgetMutation`.** Every tool builds a
  `BudgetMutation`, parses it with `mutationSchema`, and commits it with a fresh
  `clientMutationId` and the `expectedVersion` from a snapshot read immediately
  before. Never give the assistant a write path around the mutation service, and
  never add a tool for archiving, deleting definitions, copying, clearing,
  resetting, reordering, or deleting income without explicit user direction.
- **Assistant writes are server-confirmed.** The client applies no optimistic
  patch; it invalidates every cached `budget-snapshot` query after a turn that
  reports changed months, because carryover can move later months.
- **The cached prefix is frozen.** `SYSTEM_PROMPT` and `ASSISTANT_TOOLS` must
  contain no per-request value and must keep a deterministic order, and together
  they must stay above Haiku 4.5's 4,096-token minimum cacheable prefix, or
  every request pays full input price. Today's date and the viewed month travel
  in a text block at the start of each person turn instead. The server warns
  `prompt cache unused` when a response reads and writes no cache.
- **The conversation is client-held and stateless on the server.** The browser
  sends the whole message history each turn; the route validates its shape and
  size, and the household always comes from the session. Tool results the client
  sends back only affect the model's context, never authorization.
- **The assistant is off without `ANTHROPIC_API_KEY`.** The button is not
  rendered and the route answers `unavailable`. Production validation rejects a
  placeholder key and accepts an absent one. With a key, the Settings **Better
  Buddy** switch hides or shows it per device through the
  `better-budget-assistant-v1` cookie (`parseAssistantPreference` in
  `src/domain/budget-preferences.ts`); that switch is a display preference, not
  an access control. Beaming Better Buddy up to his spaceship writes the same
  preference through the same `changeAssistantEnabled` handler in
  `app-client.tsx`, so the two can never disagree.
- **Replies are plain text.** The chat renders no Markdown, so the prompt
  forbids it and `run.ts` strips `**`/`__` emphasis from model text before it is
  shown or stored in the history.
- **Production egress is IPv6 NAT on the Docker network.** The host has no IPv4
  egress, so `bootstrap-ec2.sh` gives the `better-budget` network IPv6 with
  Docker's `ip6tables` NAT. Enabling IPv6 forwarding stops `systemd-networkd`
  accepting the router advertisements that keep the host's own IPv6 address and
  route alive, so the `IPv6AcceptRA=yes` drop-in must be installed first;
  without it the host loses IPv6, and with it Systems Manager and ECR, within
  minutes. `docs/agents/deployment.md` records the order.

Keep the model on the cheapest current Claude model with thinking omitted unless
the user directs otherwise, and keep the per-turn call cap, the conversation
cap, and the per-household rate limit.

## Version 4 deployment release

Version `4.0.0` moved the production host from an x86_64 `t3a.micro` to an arm64
`t4g.nano`. There is no application-source change. The Version 1 product,
financial model, authentication model, database schema, and provider-neutral
runtime image are unchanged, as is every Version 3 database, TLS, IPv6, and
backup rule.

GitHub Actions builds `linux/arm64` only, natively on a GitHub-hosted
`ubuntu-24.04-arm` runner. Do not reintroduce `linux/amd64` or QEMU emulation:
nothing in the fleet can run an amd64 image, and the emulated build was slow
enough to be abandoned during the migration. If an x86 host ever becomes a real
rollback target again, add a second native job rather than emulating.

`scripts/aws/bootstrap-ec2.sh` is sized for 512 MiB. PostgreSQL runs with
`shared_buffers=32MB`, `max_connections=10`, and a 192 MiB container limit; the
application container has a 320 MiB limit and a 256 MiB V8 old-space limit. If
the application restarts under memory pressure, lower `shared_buffers` further
or resize the instance to `t4g.micro` — a stop, change-type, and start, since
the architecture is unchanged. Do not remove the container limits.

Four host facts are load-bearing and easy to violate:

- A fresh host pulls the seed image tag in `bootstrap_host()` before any
  deployment runs. That tag must name a commit whose ECR image includes an arm64
  manifest, or the host fails its first pull with no matching manifest.
- Deployment requires exactly one _running_ instance carrying both production
  tags. Two running hosts fail every deployment; a stopped host is invisible and
  is the rollback.
- Data Lifecycle Manager selects volumes by the `Backup=daily` tag. A
  replacement root volume without that tag is never snapshotted and nothing
  reports it.
- The deployment helper refuses an image whose architecture does not match the
  host. A wrong-architecture image pulls successfully and only fails at exec
  time, so without that check it overwrites the working tag and crashloops with
  no usable rollback target. This took production down once during the Version 4
  migration.

The instance uses Unlimited CPU credits. Standard credits throttle a `t4g.nano`
partway through a deployment and roll back a working image; the surplus charge
is cents a month at this traffic. Do not switch it back to Standard as a cost
measure.

Read `docs/agents/deployment.md` before changing deployment, infrastructure, or
the production runtime. `docs/aws/ec2-cloudfront-migration.md` remains the
authoritative live-resource, operations, rollback, and replacement-host runbook.

## Version 3 deployment release

Version `3.0.0` replaced the managed RDS database with a PostgreSQL 17 container
on the existing EC2 host. The Version 1 product, financial model, authentication
model, database schema, and provider-neutral runtime image are unchanged. The
only application-source change is a guard in `src/db/index.ts` that skips
development seeding during owner bootstrap.

The verified-TLS contract is unchanged and must stay that way: production still
requires `DATABASE_SSL=verify-full` and a trusted CA bundle. The CA is now a
private authority generated for this deployment instead of an Amazon bundle,
which is precisely why `runtime-environment.mjs` needed no change. Do not weaken
it to `require` or `disable` for a host-local database.

The database is reachable from outside AWS over IPv6 only, gated by a
security-group rule scoped to one personal `/64`. This one inbound port is
deliberate and user-directed — it replaced a billed public IPv4 endpoint with an
unbilled one — and is not drift to be corrected. No Better Budget resource has a
public IPv4 address.

Backups are daily crash-consistent EBS snapshots of the root volume, retained
seven days. There is no logical dump on a schedule and no point-in-time
recovery, so take a manual `pg_dump` before anything destructive.

Do not reintroduce ECS, an ALB, NAT, SSH, RDS, or a public IPv4 address without
explicit user direction, and do not treat the infrastructure change as
authorization to relax any Version 1 boundary below.

Read `docs/agents/deployment.md` before changing deployment, infrastructure, or
the production runtime. `docs/aws/ec2-cloudfront-migration.md` remains the
authoritative live-resource, operations, rollback, and replacement-host runbook.

## Version 2 deployment release

Version `2.0.0` changed the AWS production deployment only, moving from ECS
Express to a private EC2 host behind a CloudFront VPC origin. The Version 1
product, financial model, authentication model, database schema, and
provider-neutral runtime image were unchanged. Version 3 superseded its RDS
database.
