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
