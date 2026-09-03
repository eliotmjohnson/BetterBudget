# Version 2 deployment release

Read this before changing deployment, infrastructure, or the production
runtime. The standing guardrails live in `AGENTS.md`;
`docs/aws/ec2-cloudfront-migration.md` is the authoritative live-resource,
operations, rollback, and replacement-host runbook.

Version `2.0.0` changes the coordinated AWS production deployment while
preserving the Version 1 product, financial model, authentication model,
database schema, and provider-neutral runtime image.

- CloudFront is the public HTTPS origin and connects directly to a single
  private `t3a.micro` EC2 instance through a VPC origin. Production no longer
  requires ECS Express, an ALB, NAT, SSH, or a public EC2 IPv4 address.
- The existing PostgreSQL RDS database, shared owner, ECR repository, production
  secret, verified TLS policy, advisory-lock migration prestart, and split
  health endpoints remain authoritative. There is no Version 2 data migration.
- GitHub Actions builds immutable `linux/amd64` images and deploys through SSM
  to the uniquely tagged production instance. The host pulls before stopping,
  checks liveness and readiness, and restores the previous image after a failed
  deployment.
- The migration completed on August 22, 2026. The CloudFront hostname is the
  active browser and PWA origin, and the former ECS service, cluster, Fargate
  tasks, load balancer, task definitions, ECS roles, security group, and ECS log
  groups have been removed.
- RDS public access is intentionally retained for now with restricted ingress.
  Making RDS private is an optional future hardening step, not an incomplete
  Version 2 migration task.
- Use `docs/aws/ec2-cloudfront-migration.md` as the authoritative live-resource,
  operations, rollback, and replacement-host runbook. Do not reintroduce ECS,
  an ALB, NAT, SSH, or a public EC2 address without explicit user direction.

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

The private EC2 host is initialized by `scripts/aws/bootstrap-ec2.sh`. The
self-installing script owns the systemd application service, one-minute
liveness watchdog, memory-backed runtime secret files, dual-stack AWS service
endpoints, current/previous image tags, and automatic rollback. It reads the
existing JSON secret at every application start and passes only its three
runtime values into the container process. `BETTER_AUTH_URL` and deployment
identifiers live in root-owned non-secret host configuration. Do not persist
secret values, add SSH access, or bypass the host deployment helper.

## Image constraints

The regular production image must remain multi-stage, standalone, non-root, and
health-checkable. `/api/live` is process-only and is the container and
host-watchdog liveness target; `/api/ready` verifies database connectivity and
is the deployment-readiness target; `/api/health` remains a compatibility alias
for readiness. Keep the production connection pool small and retain the
advisory-lock migration prestart. Keep the separate `owner-bootstrap` target
non-root and limited to the one-time owner command.
