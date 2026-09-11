# Version 3 deployment release

Read this before changing deployment, infrastructure, or the production
runtime. The standing guardrails live in `AGENTS.md`;
`docs/aws/ec2-cloudfront-migration.md` is the authoritative live-resource,
operations, rollback, and replacement-host runbook.

Version `3.0.0` replaces the managed RDS database with a PostgreSQL container on
the existing application host. The product, financial model, authentication
model, database schema, and provider-neutral runtime image are unchanged, and no
file under `src/` changed.

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
- **There are no automated backups.** The EBS root volume holds the only copy of
  the data. The runbook carries the manual `pg_dump` command; run it before any
  risky host change. Revisit this once real budget data accumulates.
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
waste. The host command reuses the application's own secret files, so it cannot
be pointed at a different database, and no production secret reaches a
workstation. Seeding is additionally blocked during bootstrap by `shouldSeed()`
in `src/db/index.ts`, independently of `NODE_ENV`.

The database container is pinned by digest, runs as uid 70, and is published on
the host's IPv6 address and on loopback but never on `0.0.0.0`. The loopback
publish exists so Systems Manager port forwarding has something to reach; the
IPv6 publish is the security-group-gated operator path. GitHub Actions deploys
only the application image, so changes to the host script must be installed
separately over Systems Manager.

## Image constraints

The regular production image must remain multi-stage, standalone, non-root, and
health-checkable. `/api/live` is process-only and is the container and
host-watchdog liveness target; `/api/ready` verifies database connectivity and
is the deployment-readiness target; `/api/health` remains a compatibility alias
for readiness. Keep the production connection pool small and retain the
advisory-lock migration prestart. Keep the separate `owner-bootstrap` target
non-root and limited to the one-time owner command.
