# AWS EC2 and CloudFront migration

This runbook moves Better Budget from ECS Express to one private EC2 instance
behind a CloudFront VPC origin. It is written for the AWS web console in
`us-east-2`. Do not delete or modify the running ECS service until the explicit
cutover section.

The resulting request path is:

```text
Browser -> CloudFront HTTPS -> private EC2 port 80 -> container port 3000
                                                   -> private RDS port 5432
```

The EC2 instance has a private IPv4 address for RDS and CloudFront, plus IPv6
for outbound AWS service access. It has no public IPv4, SSH key, NAT gateway,
or load balancer.

## Existing production resources

This procedure preserves these resources:

| Resource                   | Existing value                                              |
| -------------------------- | ----------------------------------------------------------- |
| AWS account                | `563692880710`                                              |
| Region                     | `us-east-2`                                                 |
| VPC                        | `vpc-014bc408e55f0fc9d`                                     |
| RDS instance               | `better-budget-db`                                          |
| RDS endpoint               | `better-budget-db.czvyzz9gwvpl.us-east-2.rds.amazonaws.com` |
| RDS port/database          | `5432` / `better_budget`                                    |
| RDS security group         | `sg-0691f597eb48f57c1`                                      |
| ECR repository             | `better-budget/app`                                         |
| Production secret          | `better-budget/prod-zALPFC`                                 |
| Current ECS service        | `better-budget-zalpfc`                                      |
| Current ECS security group | `sg-02cd893c3e7783e5f`                                      |
| Current proven image       | `4b1c52b013af9ea23574f876a900489d78bc6286`                  |

The database and owner are not copied. Both remain in the existing RDS
database. Never run the owner-bootstrap, seed, reset, or a new database command
during this migration.

## Created Version 2 resources

The initial production migration created these resources on August 22, 2026:

| Resource                     | Value                                     |
| ---------------------------- | ----------------------------------------- |
| Second VPC IPv6 CIDR         | `2600:1f16:1049:6a00::/56`                |
| Private dual-stack subnet    | `subnet-0195a562e735ef996`                |
| Subnet IPv6 CIDR             | `2600:1f16:1049:6a00::/64`                |
| Egress-only internet gateway | `eigw-0df0ec04a5bc336df`                  |
| Private route table          | `rtb-0af2b29f9635f4c0f`                   |
| EC2 origin security group    | `sg-03e2360c7d24e5ae6`                    |
| CloudFront VPC origin group  | `sg-02cc3cd5ec4a45c3c`                    |
| Production EC2 instance      | `i-058062ec86ebb26ae`                     |
| EC2 private IPv4             | `172.31.32.120`                           |
| EC2 IPv6                     | `2600:1f16:1049:6a00:d18f:1b07:59a2:447e` |
| CloudFront VPC origin        | `vo_GKXJkQDSOGRChpUS3Ha7rz`               |
| CloudFront distribution      | `E13RII40P7L8EE`                          |
| CloudFront hostname          | `ddz00reob9ubc.cloudfront.net`            |
| EC2 recovery alarm           | `better-budget-ec2-system-recovery`       |

The EC2 inbound rule permits TCP port `80` only from the CloudFront VPC origin
security group. It does not permit public IPv4, public IPv6, or SSH traffic.

## Important push gate

Do not push the Version 2 workflow to `main` until all of the following are
true:

- The EC2 instance is healthy.
- The CloudFront distribution is deployed.
- The EC2 Better Auth URL is the CloudFront origin.
- The GitHub repository variable `PRODUCTION_URL` is set.
- The GitHub deployment role has the new SSM policy.

The current ECS service continues serving traffic if the new workflow is
accidentally run too early, but the GitHub deployment will fail because it will
not find a ready EC2 target.

## Phase 1: Create private dual-stack networking

### 1. Add a second IPv6 CIDR to the VPC

The existing VPC IPv6 `/56` is already assigned in full to an existing subnet.
Do not disassociate or resize it while ECS is running.

1. Open **VPC** in `us-east-2`.
2. Select **Your VPCs**.
3. Select `vpc-014bc408e55f0fc9d`.
4. Choose **Actions**, then **Edit CIDRs**.
5. Under IPv6 CIDRs, choose **Add new IPv6 CIDR**.
6. Select **Amazon-provided IPv6 CIDR block**.
7. Accept the generated `/56` and save.
8. Record the newly assigned `/56`; it is different from
   `2600:1f16:665:8a00::/56`.

Also confirm that **DNS resolution** and **DNS hostnames** remain enabled for
the VPC.

### 2. Create the private subnet

1. Open **VPC**, then **Subnets**, and choose **Create subnet**.
2. Enter:
    - Name: `better-budget-private-dualstack`
    - VPC: `vpc-014bc408e55f0fc9d`
    - Availability Zone: `us-east-2a`
    - IPv4 CIDR: `172.31.32.0/24`
    - IPv6 CIDR: the first available `/64` from the new `/56`
3. Create the subnet.
4. Select it and choose **Actions**, then **Edit subnet settings**.
5. Disable automatic public IPv4 assignment.
6. Enable automatic IPv6 assignment.
7. Save.

Do not reuse either existing `/20` subnet. This dedicated subnet receives a
route table with no IPv4 internet route.

### 3. Add outbound-only IPv6

1. Open **VPC**, then **Egress only internet gateways**.
2. Choose **Create egress only internet gateway**.
3. Name it `better-budget-egress-only`.
4. Attach it to `vpc-014bc408e55f0fc9d`.
5. Record its `eigw-...` identifier.

The existing regular internet gateway
`igw-0f1a928227d93c855` must remain attached. CloudFront requires the VPC to
have it, but the private subnet will not route through it.

### 4. Create and associate the route table

1. Open **VPC**, then **Route tables**.
2. Choose **Create route table**.
3. Enter:
    - Name: `better-budget-private-ipv6-egress`
    - VPC: `vpc-014bc408e55f0fc9d`
4. Create it and open **Routes**, then **Edit routes**.
5. Add destination `::/0` targeting `better-budget-egress-only`.
6. Save.
7. Open **Subnet associations**, then **Edit subnet associations**.
8. Select only `better-budget-private-dualstack` and save.

Verify the finished table has:

- Local routes for the VPC IPv4 and IPv6 CIDRs.
- `::/0` to the egress-only internet gateway.
- No `0.0.0.0/0` route.

## Phase 2: Create the EC2 identity

### 1. Create the runtime policy

1. Open **IAM**, then **Policies**.
2. Choose **Create policy**, then the **JSON** editor.
3. Paste
   [`ec2-runtime-policy.json`](ec2-runtime-policy.json).
4. Name the policy `better-budget-ec2-runtime`.
5. Create it.

This policy can read only the existing Better Budget production secret, pull
only from the existing ECR repository, and write only to the production log
group.

### 2. Create the EC2 role and instance profile

1. Open **IAM**, then **Roles**, and choose **Create role**.
2. Select **AWS service** and **EC2**.
3. Attach the AWS-managed policy `AmazonSSMManagedInstanceCore`.
4. Attach the customer-managed policy `better-budget-ec2-runtime`.
5. Name the role `better-budget-ec2-runtime`.
6. Create it.
7. Open its **Trust relationships** and confirm it matches
   [`ec2-runtime-trust-policy.json`](ec2-runtime-trust-policy.json).

The console creates the matching instance profile automatically. Do not attach
the old ECS execution role to the instance.

## Phase 3: Create logs and security groups

### 1. Create the log group

1. Open **CloudWatch**, then **Log groups**.
2. Create `/better-budget/production` if it does not already exist.
3. Set retention to **14 days**.

The bootstrap also verifies the log group and retention. Creating it first
makes a missing IAM permission easier to identify before the application
starts.

### 2. Create the EC2 origin security group

1. Open **VPC**, then **Security groups**.
2. Create a group with:
    - Name: `better-budget-ec2-origin`
    - VPC: `vpc-014bc408e55f0fc9d`
    - Inbound rules: none
3. Remove the default unrestricted outbound rule.
4. Add outbound HTTPS TCP port `443` to IPv6 destination `::/0`.
5. Add outbound PostgreSQL TCP port `5432` to destination security group
   `sg-0691f597eb48f57c1`.
6. Save and record the new `sg-...` identifier.

Do not add SSH, public IPv4, public IPv6, or a temporary `0.0.0.0/0` ingress
rule.

### 3. Permit the instance to reach RDS

1. Open security group `sg-0691f597eb48f57c1`.
2. Edit inbound rules.
3. Add PostgreSQL TCP `5432` with the new
   `better-budget-ec2-origin` security group as its source.
4. Keep the existing ECS security-group rule during the rollback window.

## Phase 4: Launch the private EC2 host

Open **EC2**, choose **Launch instance**, and use:

| Setting                  | Value                                      |
| ------------------------ | ------------------------------------------ |
| Name                     | `better-budget-production`                 |
| AMI                      | Latest Amazon Linux 2023 x86_64            |
| Instance type            | `t3a.micro`                                |
| Key pair                 | Proceed without a key pair                 |
| VPC                      | `vpc-014bc408e55f0fc9d`                    |
| Subnet                   | `better-budget-private-dualstack`          |
| Auto-assign public IPv4  | Disabled                                   |
| IPv6 address count       | `1`                                        |
| Security group           | `better-budget-ec2-origin`                 |
| Root storage             | 8 GiB encrypted gp3, delete on termination |
| IAM instance profile     | `better-budget-ec2-runtime`                |
| Metadata version         | Require IMDSv2                             |
| Detailed monitoring      | Disabled                                   |
| CPU credit specification | Standard                                   |
| Termination protection   | Enabled                                    |

Add these resource tags:

| Key           | Value           |
| ------------- | --------------- |
| `Application` | `better-budget` |
| `Environment` | `production`    |

Under **Advanced details**, paste the complete contents of
[`scripts/aws/bootstrap-ec2.sh`](../../scripts/aws/bootstrap-ec2.sh) into
**User data** as plain text. The script stays under EC2's raw 16 KiB user-data
limit. The original migration launch temporarily used the current ECS URL while
CloudFront was being created. The versioned script now uses the production
CloudFront URL and the proven image
`4b1c52b013af9ea23574f876a900489d78bc6286`, so replacement hosts start with the
final authentication origin.

Launch the instance. Do not push the repository changes yet.

### Confirm the bootstrap

Wait several minutes, then open **Systems Manager**, **Fleet Manager**, and
**Managed nodes**. The instance must show `Online`.

Use **Node actions**, **Start terminal session**, then run:

```bash
sudo systemctl status better-budget.service --no-pager
sudo systemctl status better-budget-healthcheck.timer --no-pager
sudo cat /etc/better-budget/image-tag
curl --fail http://127.0.0.1/api/live
curl --fail http://127.0.0.1/api/ready
```

The image-tag command must display the complete `4b1c52...` SHA. Both health
requests must return successfully. Review application output in CloudWatch log
group `/better-budget/production`.

If the node never becomes available in Systems Manager:

1. Use **EC2**, **Actions**, **Monitor and troubleshoot**, **Get system log**.
2. Verify the instance has an IPv6 address.
3. Verify `::/0` targets the egress-only gateway.
4. Verify outbound TCP 443 to `::/0`.
5. Confirm the correct IAM instance profile is attached.
6. Confirm the SSM agent configuration contains
   `"UseDualStackEndpoint": true`.

The bootstrap keeps ECR credentials and application secret files under `/run`,
which is memory-backed. Secret values are not placed in Docker arguments,
Docker environment metadata, the systemd unit, or persistent configuration.

## Phase 5: Put CloudFront in front of EC2

### 1. Create the VPC origin

1. Open **CloudFront** and select **VPC origins**.
2. Choose **Create VPC origin**.
3. Name it `better-budget-ec2-origin`.
4. Select the ARN of EC2 instance `better-budget-production`.
5. Use the instance's private DNS name as the origin domain if requested.
6. Select HTTP only and port `80`.
7. Create it and wait for status `Deployed`. This can take approximately 15
   minutes.

CloudFront creates a service-managed group named like
`CloudFront-VPCOrigins-Service-SG`. Do not edit that managed group.

Open `better-budget-ec2-origin` and add one inbound rule:

- Custom TCP port `80`.
- Source: the CloudFront service-managed security group.

Do not use the broader CloudFront prefix list after the service-managed group
is available.

### 2. Create the distribution

1. Open **CloudFront**, then **Distributions**, and choose
   **Create distribution**.
2. Select **Pay as you go**. Do not select a flat-rate Free or Pro plan because
   those plans do not support private VPC origins.
3. Select `better-budget-ec2-origin` as the origin.
4. Configure the default behavior:
    - Viewer protocol: Redirect HTTP to HTTPS
    - Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    - Cache policy: managed `CachingDisabled`
    - Origin request policy: managed `AllViewer`
    - Compress objects automatically: Yes
5. Configure the distribution:
    - Alternate domain: none
    - Certificate: default CloudFront certificate
    - IPv6: enabled
    - Price class: Price Class 100
    - WAF: disabled
    - Origin Shield: disabled
    - Standard logging: disabled
6. Create the distribution and wait for status `Deployed`.

The production distribution created for this migration is:

```text
ddz00reob9ubc.cloudfront.net
```

Check the unauthenticated health endpoints first:

```text
https://ddz00reob9ubc.cloudfront.net/api/live
https://ddz00reob9ubc.cloudfront.net/api/ready
```

### 3. Change the authoritative authentication origin

Return to the Systems Manager terminal and run:

```bash
sudo better-budget-set-url https://ddz00reob9ubc.cloudfront.net
```

The helper restarts the application, waits for both health endpoints, and
restores the previous URL automatically if startup fails.

Open the CloudFront root URL in a private browser window and sign in. A new
sign-in is expected because authentication cookies belong to the old ECS
hostname. Do not change `BETTER_AUTH_SECRET` and do not rerun owner bootstrap.

## Phase 6: Activate GitHub-to-EC2 deployment

### 1. Add the public URL variable to GitHub

In GitHub:

1. Open the BetterBudget repository.
2. Choose **Settings**, **Secrets and variables**, **Actions**.
3. Select **Variables**, then **New repository variable**.
4. Name it `PRODUCTION_URL`.
5. Set it to the exact HTTPS CloudFront origin without a trailing slash.

This value is public configuration, not a secret.

### 2. Replace the GitHub deployment role policy

In IAM:

1. Open the policy attached to role `better-budget-github-deploy`.
2. Edit its JSON to match
   [`github-actions-deploy-policy.json`](github-actions-deploy-policy.json).
3. Save a new policy version and make it the default.
4. Leave the role trust policy unchanged.

The new policy retains ECR push access and replaces ECS permissions with:

- EC2 discovery.
- SSM command execution only on an instance carrying both production tags.
- SSM command-status reads.

It no longer permits ECS task registration, service updates, or passing the ECS
execution role.

### 3. Push Version 2

Commit and push the implementation to `main`. The first workflow will:

1. Verify formatting, TypeScript, and linting.
2. Build the x86 runtime image.
3. Push the immutable commit SHA to ECR.
4. Find exactly one running instance with the production tags.
5. Confirm the instance is online in Systems Manager.
6. Run `better-budget-deploy <sha>` through SSM.
7. Wait for the host deployment and rollback logic.
8. Check public CloudFront liveness and readiness.

The host pulls the candidate image before stopping the old container. A normal
deployment has only the container restart and migration-prestart interruption.

### Manual image rollback

1. Open the repository's **Actions** tab.
2. Select **Deploy production to Amazon EC2**.
3. Choose **Run workflow**.
4. Enter an existing full 40-character ECR commit SHA in `image_tag`.
5. Run the workflow.

Providing `image_tag` skips source verification and image building. It deploys
the already published image. Leaving it blank builds the selected Git commit.

Host rollback is also automatic: if the candidate fails liveness or readiness,
the helper restores the prior tag and returns a failed SSM/GitHub result.
Database migrations must remain backward-compatible because a migration cannot
be undone merely by changing the application image.

## Phase 7: Validate before cutover

Complete every check through the CloudFront URL:

- `/api/live` returns HTTP 200.
- `/api/ready` returns HTTP 200.
- Owner sign-in works.
- Existing household, budgets, transactions, and income appear.
- Change a month note and restore its original value.
- Password and session controls load.
- Static assets, manifest, and service worker load.
- Application messages reach `/better-budget/production` in CloudWatch.
- A push to `main` deploys successfully.
- A manual deployment of the preceding SHA succeeds.
- The EC2 instance has no public IPv4.
- Port 80 accepts traffic only from the CloudFront service-managed group.

Both users should open the new URL, sign in, remove the old home-screen PWA,
and install the PWA again. The installed old ECS origin cannot automatically
move to a different hostname.

## Phase 8: Make RDS private

After all CloudFront checks pass:

1. Open **RDS**, then **Databases**.
2. Select `better-budget-db` and choose **Modify**.
3. Under connectivity, set **Public access** to **No**.
4. Continue and choose **Apply immediately**.
5. Wait for the database to return to `Available`.
6. Recheck the CloudFront `/api/ready` endpoint and owner data.
7. Remove any RDS security-group ingress rules sourced from personal or public
   IP addresses.
8. Retain the EC2 and ECS security-group rules until ECS is deleted.

The RDS endpoint remains the same. Inside the VPC it resolves and routes to the
private database address.

### DBeaver through Systems Manager

Direct public DBeaver access stops after RDS becomes private. Install the local
AWS CLI and Session Manager plugin, then run:

```bash
aws ssm start-session \
    --target INSTANCE_ID \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":["better-budget-db.czvyzz9gwvpl.us-east-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}' \
    --region us-east-2
```

Keep that terminal open and configure DBeaver with:

- Host: `localhost`
- Port: `15432`
- Database: `better_budget`
- Username: `better_b_admin`
- Password: the current database password
- PostgreSQL CA: the RDS CA bundle
- SSL mode: `verify-ca` for the local tunnel

The tunnel is authenticated and encrypted by Systems Manager. The application
continues to use `verify-full` directly against the RDS hostname.

## Phase 9: Recovery alarm

1. Open **CloudWatch**, **Alarms**, then **Create alarm**.
2. Select EC2 per-instance metric `StatusCheckFailed_System` for
   `better-budget-production`.
3. Trigger when the maximum is at least `1` for two consecutive one-minute
   periods.
4. Treat missing data as not breaching.
5. Add the EC2 action **Recover this instance**.
6. Name it `better-budget-ec2-system-recovery`.

This recovers supported underlying-host failures. Application process failures
are handled separately by systemd and the liveness timer.

## Phase 10: Remove ECS after the rollback window

Keep ECS running for 24 hours after the first successful GitHub-to-EC2
deployment. Do not ship unrelated schema changes during that period.

After the window:

1. Confirm both users are using the CloudFront PWA.
2. Delete ECS Express service `better-budget-zalpfc`.
3. Confirm its Fargate tasks reach `Stopped`.
4. Confirm the managed application load balancer, listener, and target groups
   are deleted.
5. If an ALB component remains, verify it has no dependents and delete it.
6. Remove `sg-02cd893c3e7783e5f` from the RDS inbound rules.
7. Retain RDS, ECR, Secrets Manager, and their data.
8. The old ECS execution role and task definitions have no hourly cost and may
   be retained briefly for audit or deregistered later.
9. Check Cost Explorer the following day for no continuing ECS, ALB, or public
   IPv4 usage.

## Routine operations

Use the browser-based Systems Manager terminal for host administration. Useful
commands are:

```bash
sudo systemctl status better-budget.service --no-pager
sudo systemctl restart better-budget.service
sudo journalctl -u better-budget.service --since today --no-pager
sudo cat /etc/better-budget/image-tag
curl --fail http://127.0.0.1/api/live
curl --fail http://127.0.0.1/api/ready
```

Application output is in CloudWatch rather than the systemd journal. The
journal contains host startup, image pull, and service lifecycle messages.

The host is stateless. If it must be replaced:

1. Launch a replacement with the same subnet, security group, role, tags, and
   user data.
2. Confirm local liveness and readiness.
3. Change its Better Auth URL to the existing CloudFront URL.
4. Update the CloudFront VPC origin to the replacement instance ARN.
5. Wait for CloudFront deployment and verify the public endpoints.
6. Terminate the failed instance only after the replacement is healthy.

Replacing or redeploying EC2 never resets RDS and never recreates the owner.
