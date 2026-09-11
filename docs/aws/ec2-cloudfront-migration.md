# AWS EC2 and CloudFront production operations

The Better Budget production migration from ECS Express to a private EC2 host
was completed on August 22, 2026, and the RDS database was replaced by a
co-located PostgreSQL container on September 11, 2026. This file retains its
original path so existing links continue to work, but it is now the
current-state inventory, operations runbook, and replacement-host guide.

The production request path is:

```text
Browser -> CloudFront HTTPS -> EC2 port 80 -> application container port 3000
                                           -> database container port 5432
```

The public application is
[`https://ddz00reob9ubc.cloudfront.net`](https://ddz00reob9ubc.cloudfront.net).
The EC2 instance has private IPv4 connectivity inside the VPC and dual-stack
IPv6 connectivity. It has no public IPv4 address, SSH key, NAT gateway, or load
balancer. Its only inbound rules are CloudFront on port 80 and the approved
personal IPv6 prefix on the PostgreSQL port.

## Current production status

- CloudFront distribution `E13RII40P7L8EE` and VPC origin
  `vo_HPi66ME94UUGDNvG59gBcn` are deployed.
- EC2 instance `i-03455a55b281dbde0` is the only instance tagged
  `Application=better-budget` and `Environment=production`.
- Pushes to `main` verify ECR tag immutability, then build and deploy immutable
  commit-SHA images through GitHub OIDC and Systems Manager.
- Public `/api/live` and `/api/ready` checks pass, owner authentication works,
  and deployment rollback has been exercised.
- PostgreSQL 17 runs as `better-budget-db.service` on the same host. The
  application reaches it by container name over a private Docker network with
  verified TLS.
- The old ECS service, cluster, tasks, load balancer, target groups, ECS
  security group, task definitions, ECS IAM roles, and `/ecs/` log groups have
  been removed.
- The RDS instance, its public Elastic IP, its security group, and its automated
  backups have been removed. Do not reintroduce RDS without explicit direction.
- Database access from outside AWS is deliberately retained over IPv6, scoped to
  a single approved personal prefix. IPv6 addresses are unbilled; the former
  public IPv4 path was not.

There is no ECS fallback. ECR, Secrets Manager, the host data directory, and the
production data must not be deleted during host recovery.

**Backups are daily EBS snapshots of the root volume, retained seven days.**
Data Lifecycle Manager policy `policy-0814a8ef0cb72ddd5` snapshots every volume
tagged `Backup=daily` at 08:00 UTC, which is 03:00 in `America/Chicago`. Only
`vol-034582146e2ccaad7` carries that tag.

Those snapshots are **crash-consistent, not transactionally clean**: they are
taken while PostgreSQL is running, so a restore replays write-ahead log the way
it would after a power loss. That is normally fine and is how PostgreSQL is
designed to recover, but it is a weaker guarantee than a logical dump, and the
seven-day window means a problem discovered late is unrecoverable.

Restoring is a manual procedure documented under "Restore the root volume from a
snapshot"; no alarm or automation performs it. The recovery point is up to 24
hours. Take a dump before anything risky:

```bash
sudo docker exec better-budget-db \
    pg_dump -U better_budget -Fc better_budget >better-budget-$(date +%F).dump
```

## Core resource inventory

All resources are in AWS account `563692880710` and region `us-east-2` unless
otherwise noted.

| Resource                 | Name or identifier                                 | Purpose                                         |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| CloudFront distribution  | `E13RII40P7L8EE`                                   | Public HTTPS application endpoint               |
| CloudFront hostname      | `ddz00reob9ubc.cloudfront.net`                     | `BETTER_AUTH_URL` and `PRODUCTION_URL`          |
| CloudFront VPC origin    | `vo_HPi66ME94UUGDNvG59gBcn`                        | Private connection to EC2 on port 80            |
| EC2 instance             | `better-budget-production` / `i-03455a55b281dbde0` | Single application host                         |
| EC2 instance type        | `t4g.nano`                                         | Low-cost arm64 production compute               |
| EC2 private IPv4         | `172.31.32.45`                                     | CloudFront VPC-origin traffic                   |
| EC2 IPv6                 | `2600:1f16:1049:6a00:cdcb:76c8:fe1d:cea2`          | AWS service traffic and database access         |
| EC2 root volume          | `vol-034582146e2ccaad7`                            | 8 GiB encrypted gp3 host volume                 |
| Database container       | `better-budget-db`                                 | PostgreSQL 17 on the application host           |
| Database image           | `postgres:17-alpine`, digest-pinned                | Pulled from Docker Hub, runs as uid 70          |
| Database data directory  | `/var/lib/better-budget/postgres`                  | Persistent application data on EBS              |
| Database TLS material    | `/run/better-budget/postgres-tls`                  | Memory-backed server certificate and key        |
| Docker network           | `better-budget`                                    | Private application-to-database bridge          |
| ECR repository           | `better-budget/app`                                | Immutable runtime images, lifecycle-pruned      |
| Secrets Manager secret   | `better-budget/prod-zALPFC`                        | Database URL, CA, auth, and TLS material        |
| EC2 IAM role/profile     | `better-budget-ec2-runtime`                        | SSM, secret read, ECR pull, and log write       |
| EC2 inline IAM policy    | `better-budget-ec2-runtime-access`                 | Account-scoped runtime permissions              |
| GitHub deployment role   | `better-budget-github-deploy`                      | OIDC image push and SSM deployment              |
| CloudWatch log group     | `/better-budget/production`                        | Container output with 14-day retention          |
| CloudWatch alarm         | `better-budget-ec2-system-recovery`                | Recovers the host on AWS hardware failure       |
| CloudWatch alarm         | `better-budget-ec2-instance-reboot`                | Reboots the host on OS-level check failure      |
| CloudWatch alarm         | `better-budget-host-memory-low`                    | Available memory under 15 percent for 15 min    |
| CloudWatch alarm         | `better-budget-host-disk-high`                     | Root volume above 80 percent for 10 minutes     |
| CloudWatch alarm         | `better-budget-database-unresponsive`              | Database failed `select 1` for 10 minutes       |
| CloudWatch metrics       | `BetterBudget/Host`                                | Memory, disk, and database health every 5 min   |
| Alarm notification topic | `better-budget-alarms`                             | Email delivery for every alarm and recovery     |
| Backup policy            | `policy-0814a8ef0cb72ddd5`                         | Daily root-volume snapshots, 7-day retention    |
| Backup service role      | `AWSDataLifecycleManagerDefaultRole`               | Lets Data Lifecycle Manager snapshot the volume |

The production secret holds eight fields, six of them read at runtime. The
application service reads `database_url`, `database_ssl_ca`, and
`better_auth_secret`. The database service reads `postgres_password`,
`postgres_server_cert`, and `postgres_server_key`. `owner_email` and
`owner_password` are used only by the one-time owner bootstrap. Do not rerun
owner bootstrap, development seeding, or a database reset against a populated
database.

`database_ssl_ca` is a private certificate authority generated for this
deployment, not an Amazon bundle. It signs one server certificate whose subject
alternative names are `better-budget-db`, `localhost`, `127.0.0.1`, and the
IPv6 address of the host that first issued it. Both expire in September 2036.
Storing the server certificate and key in the secret is what makes host
replacement reproducible: a new host fetches the same material and the
application's trusted CA still matches.

Because the certificate is reused rather than reissued, its `IP Address` name
does not follow a host replacement and is stale on the current host. Only the
`better-budget-db` name is durable, which is why operator connections use it.

## VPC resource names

These `Name` tags are the console-friendly labels for every Better Budget VPC
resource. Some predate the EC2 migration but remain in use. Entries removed
during the RDS decommission are listed in the record at the end of this file.

| Resource type                | Name tag                                     | Identifier                 | Current use                                     |
| ---------------------------- | -------------------------------------------- | -------------------------- | ----------------------------------------------- |
| VPC                          | `better-budget-default-vpc`                  | `vpc-014bc408e55f0fc9d`    | EC2 host and CloudFront VPC origin              |
| DHCP options                 | `better-budget-default-dhcp-options`         | `dopt-069d544077844207b`   | VPC DNS and DHCP settings                       |
| Network ACL                  | `better-budget-default-network-acl`          | `acl-06975c1cd3d888fd9`    | Default subnet network ACL                      |
| EC2 subnet                   | `better-budget-ec2-private-us-east-2a`       | `subnet-0195a562e735ef996` | Dual-stack EC2 host; no public IPv4             |
| Main route table             | `better-budget-vpc-main-route-table-unused`  | `rtb-05da4f6a04eeacb65`    | VPC main table; no subnets, nothing uses it     |
| EC2 route table              | `better-budget-ec2-private-ipv6-route-table` | `rtb-0af2b29f9635f4c0f`    | Local routes and `::/0` to the internet gateway |
| Internet gateway             | `better-budget-public-internet-gateway`      | `igw-0f1a928227d93c855`    | EC2 inbound and outbound IPv6; do not delete    |
| EC2 security group           | `better-budget-ec2-origin-sg`                | `sg-03e2360c7d24e5ae6`     | CloudFront and database ingress; HTTPS egress   |
| CloudFront security group    | `better-budget-cloudfront-vpc-origin-sg`     | `sg-02cc3cd5ec4a45c3c`     | Service-managed VPC-origin source               |
| Default security group       | `better-budget-default-sg-unused`            | `sg-0b2e5f1322599735a`     | Unused default group; retain with the VPC       |
| EC2 network interface        | `better-budget-ec2-primary-eni`              | `eni-08866f26d457b4cf3`    | Primary EC2 interface                           |
| CloudFront network interface | `better-budget-cloudfront-vpc-origin-eni`    | `eni-0a1e56f87c3438dcb`    | CloudFront-managed VPC-origin interface         |

The VPC has a second Amazon-provided IPv6 block,
`2600:1f16:1049:6a00::/56`, associated as
`vpc-cidr-assoc-0b65010795c1fcf25`. The EC2 subnet uses
`2600:1f16:1049:6a00::/64`, associated as
`subnet-cidr-assoc-028df4b68efe93bd8`.

Do not delete a managed ENI, gateway, subnet, route table, or security group
merely because it has little visible traffic. Resolve its attachment or owner
from this table first.

## Network and security contract

The EC2 subnet automatically assigns IPv6 but not public IPv4. Its route table
contains local VPC routes and `::/0` to the internet gateway. It must not
receive a `0.0.0.0/0` route, which is what keeps IPv4 entirely private and
unbilled.

That `::/0` route previously pointed at an egress-only gateway, which by
definition permits no inbound connections. It was changed to the internet
gateway so the database port can be reached over IPv6. The security group, not
the route table, is the access control. Do not delete the internet gateway: it
now carries EC2 IPv6 in both directions, and CloudFront VPC origins also
require it.

Security-group intent is:

- EC2 inbound: TCP `80` from `sg-02cc3cd5ec4a45c3c` only.
- EC2 inbound: TCP `5432` from the approved personal IPv6 prefix only, rule
  `sgr-0f493058eaa0239f7` for `2600:1702:7489:ae10::/64`.
- EC2 outbound: TCP `443` to `::/0` for AWS dual-stack endpoints and Docker Hub.
- No SSH, public EC2 IPv4, NAT gateway, ALB, or ECS rule.

Never widen the database rule to `::/0`, a `/56`, or any IPv4 range. When the
home prefix rotates, replace the single `/64` rule rather than adding to it. The
database is additionally protected by verified TLS and a 32-character password,
but the prefix rule is the first gate and must stay narrow.

CloudFront uses HTTP on port 80 only on the private VPC-origin hop. Browser
traffic is redirected to HTTPS at CloudFront. The default behavior permits all
application methods, uses managed `CachingDisabled` and `AllViewer` policies,
forwards cookies and query strings, and has IPv6 and compression enabled. WAF,
Origin Shield, and access logging are disabled for this low-traffic deployment.

## Image retention

[`ecr-lifecycle-policy.json`](./ecr-lifecycle-policy.json) is the lifecycle
policy on `better-budget/app`. It expires untagged images after a day, keeps the
two most recent `owner-*` images, and keeps the twenty most recent images
overall. Without it the repository grows by roughly 80 MiB per deployment
forever.

ECR has no way to mark one image as protected, so the policy cannot exempt the
image that `bootstrap_host()` names as its seed tag. Twenty deployments after
that tag is set, the policy will expire it. That is why the first step of the
replacement procedure is to confirm the seed image still exists before launching
a host: a pruned seed image costs nothing until a rebuild, and the check catches
it before it matters. Refresh the seed tag to a recent commit whenever you
replace a host.

## Runtime behavior

[`scripts/aws/bootstrap-ec2.sh`](../../scripts/aws/bootstrap-ec2.sh) is the
version-controlled host definition. On a fresh Amazon Linux 2023 arm64 host it:

- Enables dual-stack AWS and Systems Manager endpoints.
- Installs and starts Docker and installs `jq`.
- Creates or grows a 2 GiB swap file, sized for two containers on 512 MiB of RAM.
  Amazon Linux 2023 also enables a compressed `zram` device sized to RAM, at a
  higher priority than the swap file, so `free` reports more total swap than the
  script creates and the disk-backed file is only reached once `zram` fills.
- Caps journald at 64 MiB on disk and 16 MiB in `/run`, and raises
  `vm.swappiness` to 80 so cold pages leave RAM sooner.
- Creates the `better-budget` Docker network and the database data directory.
- Installs `better-budget-db.service`, `better-budget.service`,
  `better-budget-healthcheck.timer`, `better-budget-deploy`,
  `better-budget-set-url`, and `better-budget-owner`.
- Reads the production Secrets Manager JSON on every service start.
- Keeps secret material in root-controlled files under memory-backed `/run`.
- Runs PostgreSQL with `ssl=on`, `shared_buffers=32MB`, `max_connections=10`,
  and a 192 MiB container memory limit, published on the host's IPv6 address and
  on loopback but never on `0.0.0.0`.
- Refuses any pulled image whose architecture does not match the host, before
  writing the image tag or restarting, because a wrong-architecture image pulls
  successfully and only fails at exec time.
- Starts the application only after `pg_isready` succeeds, so a slow database
  start does not produce a migration failure loop.
- Runs the application container on host port 80 and container port 3000, capped
  at 320 MiB with a 256 MiB V8 old-space limit.
- Uses PostgreSQL with pool size 3, verified TLS, migration prestart, production
  auth, and the CloudFront Better Auth URL.
- Writes container output to `/better-budget/production` with 14-day retention.
- Restarts a crashed process through systemd. `better-budget.service` requires
  and orders after `better-budget-db.service`, but does not restart with it, so
  the connection pool reconnects across a database restart instead of cycling
  the application.
- Publishes `MemoryAvailablePercent`, `DiskUsedPercent`, and `DatabaseReady` to
  the `BetterBudget/Host` namespace every five minutes over the dual-stack
  CloudWatch endpoint, as a `oneshot` timer rather than a resident agent.
- Checks only `/api/live` every minute and restarts after three consecutive
  liveness failures. A readiness-only database outage does not cause a restart
  loop.
- Retains only the current and preceding local application images. Image pruning
  filters on the ECR repository, so the pinned PostgreSQL image is never reaped.

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
   workflow rerun; otherwise builds the runtime target for `linux/arm64` from a
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

A deployment restarts only `better-budget.service`. The database container keeps
running across deploys, so a deploy never interrupts the data layer. It does
depend on it: `run_application` waits up to two minutes for `pg_isready` and
fails with `The database container did not become ready.` if the database is
down, which triggers the normal rollback rather than a crash-looping container.
Check `better-budget-db.service` first when a deploy fails for that reason.

A redeploy of the currently running tag is a safe way to exercise the whole
path; it completes in under ten seconds.

Production startup applies only missing, advisory-lock-protected migrations.
It does not seed, reset, recreate the database, or recreate the owner. Database
data and the owner survive image deployments, because the data directory lives
on the EBS root volume rather than inside either container. Database migrations
must remain backward-compatible because restoring an older image does not undo a
migration.

### Manual rollback

1. Open **GitHub**, then **Actions**.
2. Select **Deploy production to Amazon EC2**.
3. Choose **Run workflow**.
4. Enter an existing full 40-character ECR commit SHA in `image_tag`.
5. Leave `build_owner_image` unchecked. The workflow rejects the combination,
   because the checkout would not match the tag being deployed.
6. Run the workflow.

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

Two alarms watch the host, both using statistic `Minimum`, a threshold of at
least `0.99`, and two consecutive one-minute periods. With one metric sample per
minute, `Minimum` and `Maximum` have the same practical result; this documents
the live setting.

- `better-budget-ec2-system-recovery` watches `StatusCheckFailed_System`, which
  is AWS infrastructure only — host hardware, network, or power. Its action
  recovers the instance onto healthy hardware, preserving the instance ID,
  private IP, and EBS volumes.
- `better-budget-ec2-instance-reboot` watches `StatusCheckFailed_Instance`, the
  OS-level check, and reboots. This covers kernel panics, an unresponsive
  operating system, and a filesystem too broken to serve.

Missing data is not breaching on either, so a stopped instance does not trip
them.

Those two alarms watch only the EC2 status checks. Memory, disk, and database
health come from `better-budget-metrics.timer`, which publishes three custom
metrics to the `BetterBudget/Host` namespace every five minutes and is alarmed
separately. No CloudWatch agent is installed: the agent is a persistent daemon
of roughly 50 to 80 MiB, which is a quarter of what a 512 MiB host has spare, so
a `oneshot` timer running the host script publishes the same values without a
resident process.

`DatabaseReady` runs an actual `select 1` rather than `pg_isready`, because a
wedged database can still accept connections. That is what closes the blind spot
left by the restart layers: systemd `Restart=always`, the one-minute `/api/live`
watchdog, the container health check, and the status-check alarms all restart
compute, none of them protect data, and `/api/live` is deliberately
process-only, so none of them can see a database that is running but not
answering.

Every alarm publishes to the SNS topic `better-budget-alarms` on both entry and
exit, so a recovery is reported as well as a failure. The two status-check alarms
keep their EC2 reboot and recover actions alongside it. The topic policy grants
`SNS:Publish` to `cloudwatch.amazonaws.com`, scoped by `AWS:SourceAccount`.

The email subscription must be confirmed from the delivery address before
anything is sent; an unconfirmed subscription silently drops every notification.
Check it with `aws sns list-subscriptions-by-topic`, which reports
`PendingConfirmation` until the link in the confirmation mail is opened.

## Database access

PostgreSQL runs on the application host and is published on two addresses:

- The host's IPv6 address, gated by the personal-prefix security-group rule.
  This is the operator path used by DBeaver.
- `127.0.0.1`, reachable only from the instance itself. This is what Systems
  Manager port forwarding connects to.

It is never published on `0.0.0.0`, and the application uses neither published
address: it reaches the container by name over the `better-budget` Docker
network.

### DBeaver over IPv6

Add one line to `/etc/hosts` on the client machine so the certificate's
`better-budget-db` name resolves:

```text
2600:1f16:1049:6a00:cdcb:76c8:fe1d:cea2  better-budget-db
```

Then configure DBeaver with:

- Host: `better-budget-db`
- Port: `5432`
- Database: `better_budget`
- Username: `better_budget`
- Password: `postgres_password` from the production secret
- SSL mode: `verify-full`
- Root certificate: the `database_ssl_ca` PEM from the production secret

Using the hostname rather than the IPv6 literal means replacing the EC2 host is
a one-line local edit instead of reissuing the certificate.

Connect by the `better-budget-db` name, never by the IPv6 literal. The
certificate is reused across host replacements, so its `IP Address` subject
alternative name still holds the address of whichever host first issued it and
does not follow a replacement. Under `verify-full` a literal-address connection
therefore fails hostname verification, while the `DNS:better-budget-db` name
stays valid. Reissuing the certificate is the only way to make the literal work
again, and it is not worth doing for this.

If the connection stops working, the home IPv6 prefix has almost certainly
rotated. Read the current address, take its `/64`, then revoke the existing rule
by its id and authorize the replacement. Never widen the rule instead of
replacing it, and never use `::/0`, a `/56`, or an IPv4 range.

### Systems Manager fallback

This path needs no inbound rule and works from a network without IPv6. It
requires the local AWS CLI and the Session Manager plugin, and forwards the
host's loopback `5432` to a local port:

```bash
aws ssm start-session \
    --target i-03455a55b281dbde0 \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["5432"],"localPortNumber":["15432"]}' \
    --region us-east-2
```

Point DBeaver at `localhost:15432` with the same database, user, password, and
CA. `verify-full` still succeeds because `localhost` and `127.0.0.1` are both in
the certificate's subject alternative names.

### Claiming the owner on an empty database

Only needed on a fresh database: a new deployment, or a host rebuild that was
not restored from a dump. Public sign-up is disabled and `AUTH_BYPASS=false`, so
until this runs there is no way to sign in.

Run the deployment workflow with **build_owner_image** enabled and `image_tag`
empty. That is the whole procedure. The workflow refuses to combine that input
with a rollback tag, because the checkout would not match the tag being
deployed.

The workflow pushes `better-budget/app:owner-<commit-sha>` next to the runtime
image, deploys and health-checks the application as usual, and then invokes
`better-budget-owner` on the host through Systems Manager. The bootstrap runs
last on purpose: it needs the schema, and the schema is created by the
application's migration prestart during the deployment it follows.

On the host, that command waits for the database, pulls the owner image, reads
`owner_email` and `owner_password` from the production secret, and runs the
bootstrap on the `better-budget` Docker network using the application's own
secret files. It removes the image afterwards. It is idempotent and refuses to
attach a second owner to a claimed household.

Run `sudo better-budget-owner` directly on the host only to retry without
rebuilding, or to bootstrap from an image other than the deployed one.

Because it reuses the application's secret files rather than accepting a
connection string, it cannot target the wrong database. Pass an explicit SHA as
`sudo better-budget-owner <sha>` only to bootstrap from an image other than the
deployed one.

### On the host

```bash
sudo systemctl status better-budget-db.service --no-pager
sudo docker exec -it better-budget-db psql -U better_budget
sudo docker exec better-budget-db psql -U better_budget -c 'SHOW ssl'
sudo docker logs --tail 50 better-budget-db
```

To confirm the application's own connection is encrypted rather than merely
permitted, join `pg_stat_ssl` to `pg_stat_activity` and read the `ssl`,
`version`, and `cipher` columns for the client backend.

## Restore the root volume from a snapshot

Use this when the root volume is impaired or its data is corrupt, and when the
last daily snapshot is an acceptable recovery point. Nothing about this is
automatic: the alarms restart compute, and a reboot cannot help an instance
whose root volume is gone. Snapshots are inert until a volume is created from
one.

**Expect to lose up to 24 hours of data.** Snapshots run daily at 08:00 UTC, so
a failure just before that window loses nearly a full day of budget entries.
They are also crash-consistent, so PostgreSQL replays write-ahead log on first
boot exactly as it would after a power loss.

1. Pick the snapshot. `aws ec2 describe-snapshots --owner-ids self` and take the
   newest `completed` one for `vol-034582146e2ccaad7`.
2. Create a volume from it in `us-east-2a`, matching the instance's availability
   zone, as 8 GiB `gp3`, encrypted.
3. Stop `i-03455a55b281dbde0`. Termination protection prevents accidental
   termination but does not prevent stopping.
4. Detach the impaired root volume, then attach the restored volume as
   `/dev/xvda`, the instance's root device name.
5. Confirm the new volume's delete-on-termination setting matches the intent in
   the replacement procedure below.
6. Start the instance. Both systemd services come up in order, and PostgreSQL
   recovers using its write-ahead log.
7. Verify `/api/live`, `/api/ready`, owner sign-in, and recent data, then delete
   the impaired volume once you are satisfied.

Because this restores the whole root volume, the operating system, Docker
images, host configuration, `/var/lib/better-budget/postgres`, and the image tag
files all return to their state at snapshot time. Nothing needs reinstalling and
the owner does not need rebootstrapping.

Prefer this over a rebuild when the instance itself is healthy. Use the
replacement procedure below when the instance is the problem.

## Replace an unhealthy EC2 host

The host is no longer disposable: its EBS root volume holds the database. When
the volume is intact, restoring it onto a new instance is usually faster than
rebuilding. Rebuild only when you need a fresh host, and take a manual dump
first if the current database is still readable.

1. Confirm the seed image tag in `bootstrap_host()` names a commit whose ECR
   image includes a `linux/arm64` manifest. A fresh host pulls that tag before
   any deployment runs, and an amd64-only image fails with no matching manifest.
   Verify with `docker buildx imagetools inspect` before launching anything.

    The image that tag names must never be deleted from ECR. Image retention is
    manual, and pruning old images by date will take the seed image with them
    unless it is excluded explicitly. Losing it does not affect a running host,
    which holds its image locally, but it breaks every future host rebuild.

2. Launch the current Amazon Linux 2023 arm64 AMI as a `t4g.nano` in
   `better-budget-ec2-private-us-east-2a`.
3. Disable public IPv4, assign one IPv6 address, use CPU credit mode Unlimited,
   and require IMDSv2. Standard credits throttle `t4g.nano` mid-deployment: it
   earns six credits an hour against a five percent baseline, and an exhausted
   balance stretches a deployment past the health-check window and triggers a
   rollback of a working image. Surplus credits bill at $0.05 per vCPU-hour,
   which is cents a month at this traffic.
4. Use no key pair, disable detailed monitoring, enable termination protection,
   and attach an 8 GiB encrypted gp3 root volume with delete-on-termination.
5. Attach security group `sg-03e2360c7d24e5ae6` and IAM profile
   `better-budget-ec2-runtime`.
6. Tag it `Application=better-budget` and `Environment=production`.
7. Tag the new root volume `Backup=daily`. Data Lifecycle Manager selects
   volumes by that tag, so a replacement volume without it is never snapshotted
   and nothing reports the omission.
8. Supply the complete current
   [`bootstrap-ec2.sh`](../../scripts/aws/bootstrap-ec2.sh) as **User data**. The
   script is larger than the 16 KiB user-data limit, so it cannot be pasted
   directly; gzip it first and upload the compressed file, which cloud-init
   decompresses on boot:

    ```bash
    gzip -9 -c scripts/aws/bootstrap-ec2.sh >bootstrap-ec2.sh.gz
    ```

9. Wait for Systems Manager to report `Online`. The bootstrap starts an empty
   PostgreSQL cluster, so the application will come up with no data.
10. Stop `better-budget.service`, restore the dump into the new cluster with
    `pg_restore --no-owner --no-acl -U better_budget -d better_budget`, then start
    the application again and confirm both local health endpoints. Skip this step
    when rebuilding onto a deliberately empty database.
11. Stop the outgoing instance before running any workflow. Instance discovery
    requires exactly one _running_ tagged instance, so two running hosts fail
    every deployment, while a stopped one is invisible and remains a rollback.
12. Recreate the CloudFront VPC origin for the replacement instance. It cannot
    be updated in place: `UpdateVpcOrigin` fails with
    `CannotUpdateEntityWhileInUse` while any distribution references it. Create a
    new origin, wait for `Deployed`, point the distribution's origin at it and at
    the new instance's private DNS name, wait for the distribution to deploy, and
    only then delete the old origin. Ensure EC2 port 80 accepts only the
    CloudFront-managed security group.
13. Update the `better-budget-db` line in `/etc/hosts` on **each operator
    workstation** that connects with DBeaver or `psql`, pointing it at the new
    instance's IPv6 address. Nothing on the host itself needs this: the
    application resolves the database by container name over the private Docker
    network. The certificate is reused from the secret and needs no reissuing,
    but its `IP Address` subject alternative name still names the previous host,
    so a literal-address connection fails `verify-full` after a replacement.
14. Repoint both CloudWatch alarms at the replacement instance.
    `better-budget-ec2-instance-reboot` and `better-budget-ec2-system-recovery`
    carry an `InstanceId` dimension, so they keep watching the old instance and
    silently protect nothing after a replacement.
15. Verify the public URL, owner sign-in, data reads/writes, logs, and a GitHub
    deployment.
16. Terminate the failed instance only after the replacement is healthy and
    CloudFront no longer depends on it. Clear termination protection first.

Run owner bootstrap only when rebuilding onto an empty database, using the
procedure in `README.md` under "Bootstrapping the current AWS deployment". Never
run seeding or reset.

Note that step 2 also assigns a new IPv6 address, which is why step 10 exists.
The certificate's `better-budget-db` name is what keeps this a local one-line
edit rather than a certificate reissue.

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
inventory above. RDS was decommissioned later; see the record below.

## Completed arm64 migration record

On September 11, 2026 the production host moved from an x86_64 `t3a.micro` to an
arm64 `t4g.nano`, taking the monthly bill from about $8.80 to about $4.75. The
architecture cannot change in place, so this was a host replacement onto an empty
database; the existing data was explicitly declared disposable, so there was no
dump, no restore, and no final snapshot. The owner was recreated from the secret.

Replaced:

- EC2 instance `i-058062ec86ebb26ae` (`t3a.micro`, x86_64) and its root volume
  `vol-09117bfc959d79d71`, both terminated after the replacement was verified.
- CloudFront VPC origin `vo_GKXJkQDSOGRChpUS3Ha7rz`, deleted once unattached. A
  VPC origin cannot be updated while a distribution references it, so the
  replacement is always a create, a distribution update, and then a delete.

Two things cost an outage or an abandoned build and are worth remembering:

- A wrong-architecture single-platform image **pulls successfully** and only
  fails when the container execs. The deployment helper wrote the tag and
  restarted before anything detected it, and could not roll back because the
  rollback tag is read from the tag file at the start of the deployment, which a
  previous bad deployment had already overwritten. `require_matching_platform`
  now refuses the image before the tag is written.
- Emulating the arm64 build with QEMU on an x86 runner was abandoned after nine
  minutes. The repository is public, so `ubuntu-24.04-arm` runners are free; the
  same build finishes in roughly 85 seconds natively.

Also changed: the host script outgrew the 16 KiB user-data limit during Version
3, so it is now supplied gzipped rather than pasted.

## Completed RDS decommission record

On September 11, 2026 the managed database was replaced by a PostgreSQL
container on the application host. RDS was costing roughly $20 per month —
$13.93 instance, $2.30 storage, $3.60 for the public IPv4 address, and $0.13
backups — against a dataset of a few megabytes on a single-household
application. The co-located container costs nothing beyond the existing
instance, taking the monthly bill from about $26.78 to about $9. The daily
snapshot policy added afterwards costs roughly $0.25 per month on top of that.

The existing production data was explicitly declared disposable, so there was no
dump, no restore, and no final snapshot. The new cluster started empty,
`migrate-production.mjs` created the schema, and the owner was recreated from
the secret.

Removed:

- RDS instance `better-budget-db` and its nine automated snapshots.
- The RDS-managed public IPv4 address and Elastic IP allocation
  `eipalloc-05d964a2c6fc3b885`, released with the instance.
- RDS security group `sg-0691f597eb48f57c1`, including its personal
  `108.198.40.10/32` ingress rule.
- The RDS network interface `eni-0bfaca485e025cae9`.
- The EC2 egress rule permitting TCP `5432` to the RDS security group.

Changed:

- The EC2 subnet's `::/0` route moved from egress-only gateway
  `eigw-0df0ec04a5bc336df` to internet gateway `igw-0f1a928227d93c855`, so the
  database port is reachable over IPv6.
- EC2 security group `sg-03e2360c7d24e5ae6` gained inbound TCP `5432` from
  `2600:1702:7489:ae10::/64` and lost its PostgreSQL egress rule.
- The production secret gained `postgres_password`, `postgres_server_cert`, and
  `postgres_server_key`, and its `database_url` and `database_ssl_ca` were
  replaced.
- Host swap grew from 1 GiB to 2 GiB.

Also removed in the same pass, after confirming each was orphaned:

- DB subnet group `default-vpc-014bc408e55f0fc9d`.
- Subnets `subnet-04a0a88ce2cbbc5a0` and `subnet-070941edb58234eab`, which held
  only the RDS network interface.
- Egress-only internet gateway `eigw-0df0ec04a5bc336df`, unreferenced by any
  route table once the EC2 subnet's `::/0` route moved to the internet gateway.
- CloudWatch log group `RDSOSMetrics` from RDS Enhanced Monitoring.
- IAM service-linked role `AWSServiceRoleForRDS`. AWS recreates this
  automatically if RDS is ever used again.

`rtb-05da4f6a04eeacb65` could not be deleted because it is the VPC's main route
table, so it was renamed from `better-budget-rds-public-route-table` to
`better-budget-vpc-main-route-table-unused`. It has no subnet associations. Its
`0.0.0.0/0` route to the internet gateway is inert today, but a new subnet
created without an explicit route-table association would inherit it and become
public. Always associate a new subnet explicitly.

Checked and deliberately left alone: no IAM policy granted any RDS permission,
so `ec2-runtime-policy.json` and `github-actions-deploy-policy.json` are
unchanged. Every KMS key in the account, `alias/aws/rds` included, is
AWS-managed, free, and not deletable. Secrets Manager holds one secret, still in
use. The default RDS parameter and option groups cannot be deleted and cost
nothing.

Retained and still required: ECR, Secrets Manager, the CloudWatch log group and
recovery alarm, both IAM roles, the internet gateway, and the VPC itself.
