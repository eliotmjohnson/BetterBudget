# Version 4 deployment release

Read this before changing deployment, infrastructure, or the production
runtime. The standing guardrails live in `AGENTS.md`;
`docs/aws/ec2-cloudfront-migration.md` is the authoritative live-resource,
operations, rollback, and replacement-host runbook.

Version `4.0.0` moves the production host from an x86_64 `t3a.micro` to an arm64
`t4g.nano`. There is no application-source change, and every Version 3 database,
TLS, IPv6, and backup rule is retained.

- GitHub Actions builds `linux/arm64` only, natively on a GitHub-hosted
  `ubuntu-24.04-arm` runner. These runners are free because the repository is
  public. Do not reintroduce `linux/amd64` or QEMU emulation: nothing in the
  fleet can run an amd64 image, and the emulated build proved too slow to keep.
  If an x86 host ever becomes a rollback target again, add a second native job
  and merge the two with `docker buildx imagetools create`.
- Both containers are resized for 512 MiB. PostgreSQL runs with
  `shared_buffers=32MB`, `max_connections=10`, `work_mem=2MB`, and a 192 MiB
  container limit. The application container gains a 320 MiB limit and a 256 MiB
  V8 old-space limit, having previously had none. journald is capped at 64 MiB
  and `vm.swappiness` is raised to 80. The 2 GiB swap file is unchanged.
- The deployment helper prunes dangling images before pulling. Decompressing a
  new image beside a running container is the memory peak of a deployment, and
  it is the most likely place for this host to fail.
- The helper refuses an image whose architecture does not match the host, before
  it writes the image tag or restarts anything. A single-platform image for the
  wrong architecture pulls _successfully_ and only fails when the container
  execs, so without that check a wrong-architecture deployment overwrites the
  working tag, crashloops, and cannot roll back: the rollback target is read
  from the tag file at the start of the deployment, so a second bad deployment
  makes the recorded previous tag bad too. This took production down once during
  the Version 4 migration. Do not remove the check.
- The instance uses Unlimited CPU credits. A `t4g.nano` earns six credits an
  hour against a five percent baseline, and Standard credits throttle it partway
  through a deployment, stretching the health check past its window and rolling
  back a working image. Surplus credits cost cents a month at this traffic; do
  not switch back to Standard as a cost measure.
- A fresh host pulls the seed image tag in `bootstrap_host()` before any
  deployment runs, so that tag must name a commit whose image includes an arm64
  manifest.
- `better-budget-metrics.timer` publishes memory, disk, and database health to
  the `BetterBudget/Host` CloudWatch namespace every five minutes, each with an
  alarm. It is a `oneshot` timer rather than the CloudWatch agent because the
  agent is a resident daemon of roughly 50 to 80 MiB on a host with about 150
  MiB spare. `DatabaseReady` runs `select 1`, not `pg_isready`, because a wedged
  database still accepts connections. Every alarm publishes to the
  `better-budget-alarms` SNS topic on both entry and exit. An email subscription
  delivers nothing until it is confirmed from the address itself, so check for
  `PendingConfirmation` before trusting the alarms to reach anyone.
- Deployment requires exactly one _running_ instance carrying both production
  tags, so a cutover stops the outgoing host rather than leaving it running.
- The host was replaced rather than resized, because architecture cannot change
  in place. Resizing between `t4g.nano` and `t4g.micro` later is a stop,
  change-type, and start, with no volume or VPC-origin work.
- The existing production data was not migrated. The new cluster started empty
  and the owner was recreated from the secret.
- The bill went from about $8.80/month to about $4.75/month. If memory pressure
  proves the 512 MiB host wrong, `t4g.micro` at $6.13/month is the answer rather
  than removing the container limits.

Version 4 retains all Version 1, Version 2, and Version 3 boundaries.

## Version 3 deployment release

Version `3.0.0` replaces the managed RDS database with a PostgreSQL container on
the existing application host. The product, financial model, authentication
model, database schema, and provider-neutral runtime image are unchanged. The
only application-source change is `shouldSeed()` in `src/db/index.ts`, which
excludes owner bootstrap from development seeding.

- PostgreSQL 17 runs as `better-budget-db.service` beside the application
  container on the same EC2 instance, with its data directory on the EBS root
  volume and a private Docker network between the two containers.
- The verified-TLS contract is unchanged. `DATABASE_SSL=verify-full` and a
  trusted CA bundle are still required in production; the CA is now a private
  authority generated for this deployment rather than an Amazon bundle. This is
  why `runtime-environment.mjs` needed no change, and it must not be weakened.
- The production secret now carries six runtime values plus the two
  owner-bootstrap fields. The application service reads `database_url`,
  `database_ssl_ca`, and `better_auth_secret`; the database service reads
  `postgres_password`, `postgres_server_cert`, and `postgres_server_key`.
- The application service requires and orders after the database service, and
  waits for `pg_isready` before starting, but does not restart with it.
- The database is reachable from outside AWS over IPv6 only, gated by a
  security-group rule scoped to one personal `/64`. This is deliberate and
  user-directed: it replaced a billed public IPv4 endpoint with an unbilled one.
  No public IPv4 address exists on any Better Budget resource.
- RDS, its public address, its security group, and its automated backups were
  deleted on September 11, 2026. Do not reintroduce RDS without explicit user
  direction.
- Backups are daily EBS snapshots of the root volume with seven-day retention,
  driven by Data Lifecycle Manager. They are crash-consistent rather than
  transactionally clean, so they restore the whole host but give a weaker
  guarantee than a logical dump. The runbook carries the manual `pg_dump`
  command; run it before any risky host change.
- Co-location is a deliberate cost trade: it removed roughly $20/month from a
  $26.78 bill, at the cost of making the host a single point of failure and
  leaving roughly 400 MiB of RAM available on a 917 MiB instance. If the
  application starts restarting under memory pressure, lower `shared_buffers`
  before reaching for a larger instance type.

Version 3 retains all Version 1 and Version 2 boundaries.

## Version 2 deployment release

Version `2.0.0` changed the coordinated AWS production deployment while
preserving the Version 1 product, financial model, authentication model,
database schema, and provider-neutral runtime image.

- CloudFront is the public HTTPS origin and connects directly to a single
  private `t3a.micro` EC2 instance through a VPC origin. Production no longer
  requires ECS Express, an ALB, NAT, SSH, or a public EC2 IPv4 address.
- The PostgreSQL RDS database, shared owner, ECR repository, production secret,
  verified TLS policy, advisory-lock migration prestart, and split health
  endpoints remained authoritative. There was no Version 2 data migration.
  Version 3 later replaced RDS.
- GitHub Actions builds immutable `linux/amd64` images and deploys through SSM
  to the uniquely tagged production instance. The host pulls before stopping,
  checks liveness and readiness, and restores the previous image after a failed
  deployment.
- The migration completed on August 22, 2026. The CloudFront hostname is the
  active browser and PWA origin, and the former ECS service, cluster, Fargate
  tasks, load balancer, task definitions, ECS roles, security group, and ECS log
  groups have been removed.
- RDS public access was intentionally retained with restricted ingress. This was
  superseded by the Version 3 decommission.
- Use `docs/aws/ec2-cloudfront-migration.md` as the authoritative live-resource,
  operations, rollback, and replacement-host runbook. Do not reintroduce ECS,
  an ALB, NAT, SSH, RDS, or a public IPv4 address without explicit user
  direction.

Version 2 retains all Version 1 non-goals. Do not treat the infrastructure
change as authorization to add households, invitations, roles, bank syncing,
recurring automation, imports/exports, currencies, notifications, realtime
push, or offline financial writes.

## The deployment pipeline

Pushes to `main` deploy the regular runtime target through GitHub Actions. The
workflow assumes the account-scoped `better-budget-github-deploy` IAM role
through GitHub OIDC, tags the ECR image with the immutable commit SHA,
discovers exactly one running instance with the `Application=better-budget` and
`Environment=production` tags, and invokes `better-budget-deploy` through
Systems Manager. The host pulls the candidate before restarting, checks
liveness and readiness, and restores the preceding tag on failure. Keep the
OIDC trust restricted to the immutable BetterBudget repository identity and
`main`; keep its permissions limited to the production ECR repository and SSM
commands on the tagged production instance. Do not add long-lived AWS
credentials or production application secrets to GitHub.

The workflow verifies that the production ECR repository uses immutable tags,
and its external actions plus the Docker base image are pinned to immutable
digests. The Docker build receives `github.sha` as `APP_BUILD_SHA`; Next.js
embeds it as public, non-secret build metadata for the Settings page.

## The EC2 host

The EC2 host is initialized by `scripts/aws/bootstrap-ec2.sh`. The
self-installing script owns both systemd services, the Docker network and
database data directory, the one-minute liveness watchdog, memory-backed runtime
secret files, dual-stack AWS service endpoints, current/previous image tags, and
automatic rollback. It reads the existing JSON secret at every service start and
passes only the values that service needs into its container process.
`BETTER_AUTH_URL` and deployment identifiers live in root-owned non-secret host
configuration. Do not persist secret values, add SSH access, or bypass the host
deployment helper.

Owner bootstrap is a host command, `better-budget-owner`, not a workstation
procedure. The workflow publishes the `owner-bootstrap` target to ECR as
`owner-<commit-sha>` only when its `build_owner_image` input is set, because the
bootstrap runs at most once per database and building it on every push would be
waste. That same input also makes the workflow invoke the host command through
Systems Manager as its final step, after the deployment has been health-checked,
because the bootstrap depends on the schema that migration prestart creates.
Keep it last for that reason. The host command reuses the application's own secret files, so it cannot
be pointed at a different database, and no production secret reaches a
workstation. Seeding is additionally blocked during bootstrap by `shouldSeed()`
in `src/db/index.ts`, independently of `NODE_ENV`.

The database container is pinned by digest, runs as uid 70, and is published on
the host's IPv6 address and on loopback but never on `0.0.0.0`. The loopback
publish exists so Systems Manager port forwarding has something to reach; the
IPv6 publish is the security-group-gated operator path. GitHub Actions deploys
only the application image, so changes to the host script must be installed
separately over Systems Manager.

## Assistant key and egress (Version 5)

The budget assistant needs `ANTHROPIC_API_KEY` in the application container and
outbound HTTPS from that container to `api.anthropic.com`. Without the key the
assistant is simply off: the button is not rendered and nothing calls out, so
deploying Version 5 changes nothing in production until both steps below are
done, the host script is installed over Systems Manager, and the key is added.

- **The key.** `fetch_application_secrets()` reads the optional
  `anthropic_api_key` field from the existing Secrets Manager entry, writes it
  to the memory-backed secret directory beside the other runtime values (an
  empty file when the field is absent), and the entrypoint exports it. The
  updated host script must be installed over Systems Manager before the field
  takes effect, and the application service must restart to pick up a changed
  key. `runtime-environment.mjs` rejects a placeholder but accepts an empty
  value.
- **Egress.** The host has no public IPv4 address and no NAT gateway; its only
  internet path is IPv6 through the internet gateway, with HTTPS egress to
  `::/0` already allowed by the security group, and `api.anthropic.com`
  publishes an AAAA record. The application container reaches it over IPv6 on
  the `better-budget` network, which `bootstrap_host()` sets up in three steps,
  in this order:
    1. `keep_router_advertisements_with_forwarding()` writes a
       `systemd-networkd` drop-in, `IPv6AcceptRA=yes`, for the interface that
       holds the IPv6 default route. The host's global address (a DHCPv6 `/128`
       with a lifetime of minutes) and its default route come from router
       advertisements, which networkd stops accepting by default once IPv6
       forwarding is on, and Docker turns forwarding on for an IPv6 network.
       Without the drop-in the host would lose IPv6 within minutes, and with it
       Systems Manager, ECR, and every AWS endpoint, since all are reached over
       IPv6. It must be in place before Docker IPv6 is enabled.
    2. `enable_docker_ipv6()` writes `/etc/docker/daemon.json` with
       `experimental` and `ip6tables` (IPv6 NAT is experimental on the Docker 25
       that Amazon Linux 2023 ships) and restarts Docker.
    3. `upgrade_database_network()` stops both services and recreates an
       IPv4-only `better-budget` network with `--ipv6` and the ULA subnet
       `fd62:6275:6467:1::/64`; Docker masquerades it behind the host's global
       address. The database's bind-mounted data directory is untouched. Service
       starts only create the network when it is missing.

    Adding NAT or a public IPv4 address instead is outside the standing
    deployment rules and needs explicit user direction.

## Image constraints

The regular production image must remain multi-stage, standalone, non-root, and
health-checkable. `/api/live` is process-only and is the container and
host-watchdog liveness target; `/api/ready` verifies database connectivity and
is the deployment-readiness target; `/api/health` remains a compatibility alias
for readiness. Keep the production connection pool small and retain the
advisory-lock migration prestart. Keep the separate `owner-bootstrap` target
non-root and limited to the one-time owner command.

[`ecr-lifecycle-policy.json`](../aws/ecr-lifecycle-policy.json) is the retention
policy on `better-budget/app`: untagged images expire after a day, the two most
recent `owner-*` images are kept, and the twenty most recent images are kept
overall. Without it the repository grows by roughly 80 MiB per deployment
forever. ECR cannot mark an image as protected, so the policy cannot exempt the
image that `bootstrap_host()` names as its seed tag; the replacement procedure
verifies that image exists before a host launches, which is what catches a
pruned one. A running host is unaffected either way, because it holds its image
locally.
