# AWS EC2 and CloudFront production operations

The Better Budget production migration from ECS Express to a private EC2 host
was completed on August 22, 2026. This file retains its original path so
existing links continue to work, but it is now the current-state inventory,
operations runbook, and replacement-host guide.

The production request path is:

```text
Browser -> CloudFront HTTPS -> private EC2 port 80 -> container port 3000
                                                   -> RDS port 5432
```

The public application is
[`https://ddz00reob9ubc.cloudfront.net`](https://ddz00reob9ubc.cloudfront.net).
The EC2 instance has private IPv4 connectivity inside the VPC and outbound-only
IPv6 connectivity for AWS services. It has no public IP address, SSH key, NAT
gateway, or load balancer.

## Current production status

- CloudFront distribution `E13RII40P7L8EE` and VPC origin
  `vo_GKXJkQDSOGRChpUS3Ha7rz` are deployed.
- EC2 instance `i-058062ec86ebb26ae` is the only instance tagged
  `Application=better-budget` and `Environment=production`.
- Pushes to `main` verify ECR tag immutability, then build and deploy immutable
  commit-SHA images through GitHub OIDC and Systems Manager.
- Public `/api/live` and `/api/ready` checks pass, owner authentication works,
  existing data is present, and deployment rollback has been exercised.
- The old ECS service, cluster, tasks, load balancer, target groups, ECS
  security group, task definitions, ECS IAM roles, and `/ecs/` log groups have
  been removed.
- RDS public access is intentionally still enabled. Its EC2 security-group
  ingress remains required, and the approved personal-IP ingress remains until
  the database is deliberately made private.

There is no ECS fallback. RDS, ECR, Secrets Manager, and the production data
remain in place and must not be deleted during host recovery.

## Core resource inventory

All resources are in AWS account `563692880710` and region `us-east-2` unless
otherwise noted.

| Resource                | Name or identifier                                          | Purpose                                   |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| CloudFront distribution | `E13RII40P7L8EE`                                            | Public HTTPS application endpoint         |
| CloudFront hostname     | `ddz00reob9ubc.cloudfront.net`                              | `BETTER_AUTH_URL` and `PRODUCTION_URL`    |
| CloudFront VPC origin   | `vo_GKXJkQDSOGRChpUS3Ha7rz`                                 | Private connection to EC2 on port 80      |
| EC2 instance            | `better-budget-production` / `i-058062ec86ebb26ae`          | Single application host                   |
| EC2 instance type       | `t3a.micro`                                                 | Low-cost production compute               |
| EC2 private IPv4        | `172.31.32.120`                                             | CloudFront and RDS VPC traffic            |
| EC2 IPv6                | `2600:1f16:1049:6a00:d18f:1b07:59a2:447e`                   | Outbound AWS service traffic              |
| EC2 root volume         | `vol-09117bfc959d79d71`                                     | 8 GiB encrypted gp3 host volume           |
| RDS instance            | `better-budget-db`                                          | Persistent PostgreSQL database            |
| RDS endpoint            | `better-budget-db.czvyzz9gwvpl.us-east-2.rds.amazonaws.com` | Application database host                 |
| RDS database            | `better_budget` on port `5432`                              | Persistent application data               |
| ECR repository          | `better-budget/app`                                         | Immutable runtime images                  |
| Secrets Manager secret  | `better-budget/prod-zALPFC`                                 | Database URL, RDS CA, and auth secret     |
| EC2 IAM role/profile    | `better-budget-ec2-runtime`                                 | SSM, secret read, ECR pull, and log write |
| EC2 inline IAM policy   | `better-budget-ec2-runtime-access`                          | Account-scoped runtime permissions        |
| GitHub deployment role  | `better-budget-github-deploy`                               | OIDC image push and SSM deployment        |
| CloudWatch log group    | `/better-budget/production`                                 | Container output with 14-day retention    |
| CloudWatch alarm        | `better-budget-ec2-system-recovery`                         | Automatic EC2 system recovery             |

The production secret may retain the one-time owner-bootstrap fields, but the
long-running service and routine deployments read only `database_url`,
`database_ssl_ca`, and `better_auth_secret`. Do not rerun owner bootstrap,
development seeding, or a database reset.

## VPC resource names

These `Name` tags are the console-friendly labels for every Better Budget VPC
resource reviewed during the completed cleanup. Some resources predate the
EC2 migration but remain because RDS or the current EC2 architecture uses
them.

| Resource type                | Name tag                                     | Identifier                   | Current use                                        |
| ---------------------------- | -------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| VPC                          | `better-budget-default-vpc`                  | `vpc-014bc408e55f0fc9d`      | EC2, CloudFront VPC origin, and RDS                |
| DHCP options                 | `better-budget-default-dhcp-options`         | `dopt-069d544077844207b`     | VPC DNS and DHCP settings                          |
| Network ACL                  | `better-budget-default-network-acl`          | `acl-06975c1cd3d888fd9`      | Default subnet network ACL                         |
| Private EC2 subnet           | `better-budget-ec2-private-us-east-2a`       | `subnet-0195a562e735ef996`   | Private dual-stack EC2 host                        |
| Public RDS subnet            | `better-budget-rds-public-us-east-2a`        | `subnet-04a0a88ce2cbbc5a0`   | RDS subnet group and current public access         |
| Public RDS subnet            | `better-budget-rds-public-us-east-2b`        | `subnet-070941edb58234eab`   | RDS subnet group and current public access         |
| Public route table           | `better-budget-rds-public-route-table`       | `rtb-05da4f6a04eeacb65`      | Internet route for the RDS public subnets          |
| Private route table          | `better-budget-ec2-private-ipv6-route-table` | `rtb-0af2b29f9635f4c0f`      | EC2 outbound-only IPv6 route                       |
| Internet gateway             | `better-budget-public-internet-gateway`      | `igw-0f1a928227d93c855`      | Required for public RDS and CloudFront VPC origins |
| Egress-only gateway          | `better-budget-ec2-ipv6-egress-only-gateway` | `eigw-0df0ec04a5bc336df`     | EC2 outbound IPv6 without inbound internet access  |
| EC2 security group           | `better-budget-ec2-origin-sg`                | `sg-03e2360c7d24e5ae6`       | CloudFront ingress and application egress          |
| CloudFront security group    | `better-budget-cloudfront-vpc-origin-sg`     | `sg-02cc3cd5ec4a45c3c`       | Service-managed VPC-origin source                  |
| RDS security group           | `better-budget-rds-postgres-sg`              | `sg-0691f597eb48f57c1`       | PostgreSQL ingress control                         |
| Default security group       | `better-budget-default-sg-unused`            | `sg-0b2e5f1322599735a`       | Unused default group; retain with the VPC          |
| EC2 network interface        | `better-budget-ec2-primary-eni`              | `eni-08866f26d457b4cf3`      | Primary EC2 interface                              |
| RDS network interface        | `better-budget-rds-public-eni`               | `eni-0bfaca485e025cae9`      | RDS-managed public interface                       |
| CloudFront network interface | `better-budget-cloudfront-vpc-origin-eni`    | `eni-0a1e56f87c3438dcb`      | CloudFront-managed VPC-origin interface            |
| Elastic IP allocation        | `better-budget-rds-public-ip`                | `eipalloc-05d964a2c6fc3b885` | Current RDS public IPv4 access                     |

The VPC has a second Amazon-provided IPv6 block,
`2600:1f16:1049:6a00::/56`, associated as
`vpc-cidr-assoc-0b65010795c1fcf25`. The private EC2 subnet uses
`2600:1f16:1049:6a00::/64`, associated as
`subnet-cidr-assoc-028df4b68efe93bd8`.

Do not delete a managed ENI, gateway, subnet, route table, or security group
merely because it has little visible traffic. Resolve its attachment or owner
from this table first.

## Network and security contract

The private EC2 subnet automatically assigns IPv6 but not public IPv4. Its
dedicated route table contains local VPC routes and `::/0` to the egress-only
internet gateway. It must not receive a `0.0.0.0/0` route.

The regular internet gateway remains attached. CloudFront VPC origins require
it, and the public RDS subnets currently use it, but the EC2 subnet does not
route application traffic through it.

Security-group intent is:

- EC2 inbound: TCP `80` from `sg-02cc3cd5ec4a45c3c` only.
- EC2 outbound: TCP `443` to `::/0` for AWS dual-stack endpoints.
- EC2 outbound: TCP `5432` to RDS security group
  `sg-0691f597eb48f57c1`.
- RDS inbound: TCP `5432` from EC2 security group
  `sg-03e2360c7d24e5ae6`.
- RDS inbound: only the deliberately approved personal public IP while public
  database access remains enabled.
- No SSH, public EC2 IPv4, public EC2 IPv6 ingress, NAT gateway, ALB, or ECS
  rule.

CloudFront uses HTTP on port 80 only on the private VPC-origin hop. Browser
traffic is redirected to HTTPS at CloudFront. The default behavior permits all
application methods, uses managed `CachingDisabled` and `AllViewer` policies,
forwards cookies and query strings, and has IPv6 and compression enabled. WAF,
Origin Shield, and access logging are disabled for this low-traffic deployment.

## Runtime behavior

[`scripts/aws/bootstrap-ec2.sh`](../../scripts/aws/bootstrap-ec2.sh) is the
version-controlled host definition. On a fresh Amazon Linux 2023 x86_64 host it:

- Enables dual-stack AWS and Systems Manager endpoints.
- Installs and starts Docker and installs `jq`.
- Creates a 1 GiB swap file.
- Installs `better-budget.service`, `better-budget-healthcheck.timer`,
  `better-budget-deploy`, and `better-budget-set-url`.
- Reads the production Secrets Manager JSON on every service start.
- Keeps secret material in root-controlled files under memory-backed `/run`.
- Runs the container on host port 80 and container port 3000.
- Uses PostgreSQL with pool size 3, verified RDS TLS, migration prestart,
  production auth, and the CloudFront Better Auth URL.
- Writes container output to `/better-budget/production` with 14-day retention.
- Restarts a crashed process through systemd.
- Checks only `/api/live` every minute and restarts after three consecutive
  liveness failures. A readiness-only database outage does not cause a restart
  loop.
- Retains only the current and preceding local images.

The host pulls from the IPv6-capable registry
`563692880710.dkr-ecr.us-east-2.on.aws/better-budget/app:<commit-sha>`.
The bootstrap file contains a known-good initial SHA for replacement hosts;
normal deployments immediately move the host to the selected immutable SHA.

The runtime role attaches AWS-managed `AmazonSSMManagedInstanceCore` and has an
inline policy named `better-budget-ec2-runtime-access`. The inline policy body
is version controlled in
[`ec2-runtime-policy.json`](ec2-runtime-policy.json), and the role trust is in
[`ec2-runtime-trust-policy.json`](ec2-runtime-trust-policy.json). It can read
only the production secret, pull only the production repository, and write
only the production log group.

## Automatic deployments

A push to `main` is the complete normal deployment action. The workflow in
[`deploy-production.yml`](../../.github/workflows/deploy-production.yml):

1. Checks formatting, TypeScript, and linting.
2. Verifies that `better-budget/app` uses ECR's `IMMUTABLE` tag policy.
3. Reuses the immutable commit image when it already exists, including on a
   workflow rerun; otherwise builds the runtime target for `linux/amd64` from a
   digest-pinned Node image and pushes it with the full Git commit SHA.
4. Finds exactly one running EC2 instance carrying both production tags.
5. Confirms that instance is online in Systems Manager.
6. Runs `better-budget-deploy <commit-sha>` through Systems Manager.
7. Waits for the host to pass liveness and readiness within the bounded command
   and workflow timeout budgets.
8. Verifies both public CloudFront health endpoints with bounded retries.

GitHub stores no AWS access key or application secret. The repository variable
`PRODUCTION_URL` is the exact CloudFront HTTPS origin without a trailing slash.
The OIDC trust remains limited to this repository and the `main` branch. The
deployment policy in
[`github-actions-deploy-policy.json`](github-actions-deploy-policy.json) permits
only inspection and pushes for the production ECR repository, tagged-instance
discovery, and the fixed SSM deployment path. All external workflow actions are
pinned to verified full commit SHAs, with their release versions retained in
comments for deliberate updates.

Before deploying a workflow revision that changes the version-controlled IAM
policy, publish that JSON as the current version of the customer-managed policy
attached to `better-budget-github-deploy`. Keep `better-budget/app` configured
with **Immutable** image tags. The workflow checks both prerequisites before it
builds an image or changes the host.

Production startup applies only missing, advisory-lock-protected migrations.
It does not seed, reset, recreate the database, or recreate the owner. RDS data
and the owner survive image deployments and EC2 replacement. Database
migrations must remain backward-compatible because restoring an older image
does not undo a migration.

### Manual rollback

1. Open **GitHub**, then **Actions**.
2. Select **Deploy production to Amazon EC2**.
3. Choose **Run workflow**.
4. Enter an existing full 40-character ECR commit SHA in `image_tag`.
5. Run the workflow.

The workflow skips the build and redeploys that existing immutable image. A
normal failed deployment also restores the previous local image automatically
and reports a failed GitHub run.

## Routine host operations

Use the browser-based Systems Manager terminal; SSH is intentionally disabled.
Useful checks are:

```bash
sudo systemctl status better-budget.service --no-pager
sudo systemctl status better-budget-healthcheck.timer --no-pager
sudo systemctl restart better-budget.service
sudo journalctl -u better-budget.service --since today --no-pager
sudo cat /etc/better-budget/image-tag
curl --fail http://127.0.0.1/api/live
curl --fail http://127.0.0.1/api/ready
```

Application output is in CloudWatch Logs. The systemd journal contains host
startup, image pull, and service lifecycle messages.

The recovery alarm uses `StatusCheckFailed_System`, statistic `Minimum`, a
threshold of at least `0.99`, and two consecutive one-minute periods. Missing
data is not breaching, and the configured action recovers the instance. With
one metric sample per minute, `Minimum` and `Maximum` have the same practical
result; this documents the live setting.

## RDS public access

RDS is intentionally public at present. Keep these safeguards in place:

- Never allow `0.0.0.0/0` or `::/0` on PostgreSQL port 5432.
- Keep direct access restricted to the current personal IP, preferably as a
  single `/32` rule.
- Retain the EC2 security-group source rule independently of the personal-IP
  rule.
- Continue using the RDS CA bundle and verified TLS from the application and
  database client.
- Remove a superseded personal-IP rule when adding a replacement.

While public access is enabled, DBeaver can connect directly with:

- Host: `better-budget-db.czvyzz9gwvpl.us-east-2.rds.amazonaws.com`
- Port: `5432`
- Database: `better_budget`
- Username: `better_b_admin`
- Password: the current database password
- SSL mode: `verify-full`
- Root certificate: the current Amazon RDS CA bundle

If the connection stops working after the home public IP changes, replace the
old personal `/32` ingress rule instead of broadening it.

Making RDS private is an optional future hardening step, not an unfinished
deployment requirement. When ready:

1. Change **RDS**, **Connectivity**, **Public access** to **No**.
2. Apply the modification and wait for `Available`.
3. Confirm public `/api/ready` and owner data through CloudFront.
4. Remove personal/public-IP PostgreSQL ingress, retaining the EC2 source.

After that change, use Systems Manager remote-port forwarding for DBeaver:

```bash
aws ssm start-session \
    --target i-058062ec86ebb26ae \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":["better-budget-db.czvyzz9gwvpl.us-east-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}' \
    --region us-east-2
```

Configure DBeaver for `localhost:15432`, database `better_budget`, user
`better_b_admin`, the current password, the RDS CA bundle, and SSL mode
`verify-ca` for the local tunnel. Normal AWS administration remains available
through the browser console; this tunnel requires the local AWS CLI and Session
Manager plugin.

## Replace an unhealthy EC2 host

The host is disposable; RDS is the source of truth. To replace it:

1. Launch the current Amazon Linux 2023 x86_64 AMI as a `t3a.micro` in
   `better-budget-ec2-private-us-east-2a`.
2. Disable public IPv4, assign one IPv6 address, use CPU credit mode Standard,
   and require IMDSv2.
3. Use no key pair, disable detailed monitoring, enable termination protection,
   and attach an 8 GiB encrypted gp3 root volume with delete-on-termination.
4. Attach security group `sg-03e2360c7d24e5ae6` and IAM profile
   `better-budget-ec2-runtime`.
5. Tag it `Application=better-budget` and `Environment=production`.
6. Paste the complete current
   [`bootstrap-ec2.sh`](../../scripts/aws/bootstrap-ec2.sh) into **User data**.
7. Wait for Systems Manager to report `Online`, then confirm both local health
   endpoints and the existing RDS data.
8. Update or recreate the CloudFront VPC origin for the replacement instance,
   wait for `Deployed`, and ensure EC2 port 80 accepts only the new
   CloudFront-managed security group.
9. Verify the public URL, owner sign-in, data reads/writes, logs, and a GitHub
   deployment.
10. Terminate the failed instance only after the replacement is healthy and
    CloudFront no longer depends on it.

Never run owner bootstrap, seeding, or reset while replacing the host.

## Completed ECS cleanup record

The 24-hour rollback window and cutover verification are complete. The
following old ECS resources were removed:

- ECS Express service `better-budget-zalpfc` and all Fargate tasks.
- The ECS-managed application load balancer, listener, target groups, and
  related network interfaces.
- ECS security group `sg-02cd893c3e7783e5f` and its RDS ingress rule.
- All active and inactive Better Budget ECS task-definition revisions.
- Obsolete ECS execution/runtime IAM roles and policies.
- ECS CloudWatch log groups under `/ecs/`.
- The now-empty ECS cluster.

The cleanup intentionally retained RDS and its data, ECR images, Secrets
Manager, the GitHub OIDC role, and every resource listed in the current
inventory above.
