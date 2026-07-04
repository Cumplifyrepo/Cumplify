# Spec 1 — platform-foundation

**Source:** Consolidated Parts 4, 9, 11, 32; cdk-guidance.md §1–§2
**Phase:** P0 (foundation — specs 2 and 5 depend on this)
**Out of scope:** Eventing (spec 2), audit-trail logic (spec 5), pool hardening
(identity-3pool-hardening), any application code, AiStack, ApiStack, EventingStack,
ComputeStack, EdgeStack.

**Imported constraints (verbatim):**
- `00-stack-facts.md` — regions, accounts (incl. mgmt 157082218687), model IDs, CMK rules, DynamoDB config
- `06-cdk-conventions.md` — CDK Nag = failure, crossAccountKeys, Graviton, zero NAT
- `02-aoss-rule.md` — 45-second cold-start + exponential-backoff on every AOSS path

**Closure rule:** All SecurityStack tasks are REQUIRES-HUMAN. Every infra task
closes via Template F at D3 (deployed to dev + readback green).

---

## 1. User Stories & Acceptance Criteria

### US-1: CDK App Skeleton + Pipeline

**As** the platform team,
**I want** a self-mutating CDK pipeline deploying into dev→staging→prod accounts,
**so that** all future infrastructure ships through a single auditable path.

**Acceptance criteria:**

- AC-1.1: A CDK app entrypoint exists at `infra/bin/cumplify.ts` that
  synthesizes a PipelineStack (mgmt account 157082218687) and a CumplifyStage
  per environment.

- AC-1.2: The pipeline construct uses `crossAccountKeys: true`,
  `enableKeyRotation: true`, `selfMutation: true`.

- AC-1.3: Pipeline stages:
  - Dev: no gate.
  - Staging: ManualApprovalStep (pre) + SmokeTest (post-deploy).
  - Prod: ManualApprovalStep + LegalSignoffGuard (pre) + RollbackInitiator
    (auto-rollback on alarm, post-deploy).

- AC-1.4: Synth step runs: `npm ci`, `npm run test`, `npm audit --audit-level=high`,
  `npx cdk synth --all`. CDK Nag runs as an Aspect during synth (failures block).

- AC-1.5 (REQUIRES-HUMAN): Source: `strivanallc-crypto/Cumplify@develop` via
  CodeStar Connection. Connection ARN parameterized via CDK context.
  Runbook (one-time): create GitHub remote, push develop branch, create
  CodeStar Connection in mgmt account, manually authorize (PENDING→AVAILABLE).
  Repo currently has no remote.

- AC-1.6: `AwsSolutionsChecks` applied at the App level with `verbose: true`.
  All Nag warnings = failures. Suppressions carry documented `reason`.

- AC-1.7: Environment config injected via CDK context per 00-stack-facts.md:
  mgmt=157082218687, dev=697114252993, staging=889007427685, prod=077405654066,
  all us-east-1.

- AC-1.8: WHERE a `fromLookup` call is needed, THEN it is pre-resolved into
  `cdk.context.json` (never live during synth in the pipeline — verified gotcha).

- AC-1.9 (REQUIRES-HUMAN): CDK bootstrap runbook (from live findings):
  - Dev (697114252993): re-bootstrap with `--trust 157082218687
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess`.
    Current CDKToolkit is v32 with correct trust but custom exec policies
    (CumplifyCDKExecPolicy-Core/-Ext) lack ec2, rds, elasticache — spec 1
    cannot deploy without AdministratorAccess exec policy.
  - Mgmt (157082218687): bootstrap (pipeline lives here, needs its own toolkit).
  - Staging (889007427685): fresh bootstrap with `--trust 157082218687
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess`.
  - Prod (077405654066): fresh bootstrap us-east-1 AND us-west-2 (DR —
    Global Table replica, Secrets replica) with same trust.

### US-2: NetworkStack

**As** the platform,
**I want** a VPC with private subnets, VPC endpoints, and zero NAT gateways,
**so that** all services communicate privately without the per-GB NAT tax.

**Acceptance criteria:**

- AC-2.1: VPC with private isolated subnets only (no public subnets, no NAT
  gateways). Minimum 2 AZs. Subnets sized for the full stack (RDS multi-AZ,
  ElastiCache, Fargate tasks, Lambda ENIs).

- AC-2.2: VPC Interface Endpoints: AOSS (`com.amazonaws.us-east-1.aoss`),
  Secrets Manager, KMS, Bedrock Runtime (`bedrock-runtime`), execute-api.
  VPC Gateway Endpoints: S3, DynamoDB.
  **Note:** ComputeStack (spec-deferred) will add ecr.api, ecr.dkr, logs
  endpoints. Bedrock Agent Runtime (`bedrock-agent-runtime`) deferred to
  spec 4 (AiStack).

- AC-2.3: VPC flow logs enabled, destination S3 (Part 25.2 cost lever — not
  CloudWatch Logs).

- AC-2.4: Zero NAT gateways — verified by readback assertion (Part 25 cost lever).

### US-3: SecurityStack (REQUIRES-HUMAN — all tasks)

**As** the security team,
**I want** centralized encryption keys, WAF rules, and secrets management,
**so that** every downstream stack inherits defense-in-depth by construction.

**Acceptance criteria:**

- AC-3.1: 10 KMS CMKs created with descriptive aliases:
  `cumplify/<env>/dynamodb`, `cumplify/<env>/rds`,
  `cumplify/<env>/elasticache`, `cumplify/<env>/s3-general`,
  `cumplify/<env>/secrets`, `cumplify/<env>/cloudwatch-logs`,
  `cumplify/<env>/sns`, `cumplify/<env>/sqs`,
  `cumplify/<env>/eventbridge`, `cumplify/<env>/bedrock`.

- AC-3.2: WAFv2 WebACLs:
  - REGIONAL scope (for AppSync, to be associated in ApiStack spec 3).
  - CLOUDFRONT scope in us-east-1 (for CloudFront distribution, to be
    associated in EdgeStack).
  - Rules: AWS CommonRuleSet, RateLimitPerIP (2000 req/5min), IpReputationList.

- AC-3.3: Secrets Manager secrets for RDS master credentials with 30-day
  rotation configured. Prod-only: Secrets replicated to us-west-2 (Part 10 DR).

- AC-3.4: Each CMK has key rotation enabled. Key policies grant access to
  the specific service principals that need them (no wildcard key policies).

- AC-3.5: All CMKs, WAF ACLs, and secrets passed via props to consuming
  stacks (no cross-stack Fn::ImportValue).

### US-4: DataStack

**As** the platform,
**I want** the polyglot data layer (DynamoDB, Aurora, ElastiCache, AOSS, S3 WORM)
deployed with full encryption and tenant isolation by construction,
**so that** every subsequent spec inherits a secure, proven data plane.

**Acceptance criteria:**

- AC-4.1: DynamoDB `CumplifyCore` TableV2 with:
  - PK (`pk`, String) + SK (`sk`, String), on-demand billing.
  - Customer-managed KMS encryption (dynamodb CMK from SecurityStack).
  - Point-in-time recovery enabled.
  - DynamoDB Streams (NEW_AND_OLD_IMAGES) — retained 24h.
  - Deletion protection enabled. RemovalPolicy RETAIN.
  - 9 GSIs (overloaded PK/SK pattern; names gsi1–gsi9).
  - Global Table replication to us-west-2: **prod-only** (Part 10 DR).
    Dev/staging: single-region. Design must handle the replica-region
    DynamoDB key (multi-Region key or us-west-2 replica key).

- AC-4.2: Aurora Serverless v2 PostgreSQL cluster:
  - Engine: Aurora PostgreSQL 16.x.
  - Writer + 1 reader (scaleWithWriter).
  - Private isolated subnets (VPC from NetworkStack).
  - Storage encrypted with **dedicated rds CMK** from SecurityStack.
  - Credentials from Secrets Manager (with 30-day rotation).
  - Deletion protection enabled. RemovalPolicy RETAIN.
  - Dev/staging: auto-pause to 0 ACU (minCapacity: 0, maxCapacity: 4).
  - Prod: minCapacity 0.5, maxCapacity configurable via context.

- AC-4.3: ElastiCache Redis replication group:
  - Private subnets. At-rest + in-transit encryption enabled.
  - **Dedicated elasticache CMK** from SecurityStack.
  - Dev: single-node. Prod: multi-AZ (chosen parameter).
  - Minimum 2 AZs for prod topology.

- AC-4.4: OpenSearch Serverless (AOSS) collection:
  - Type: VECTORSEARCH.
  - Name: `cumplify-iso-kb`.
  - Three required policies:
    - Encryption: uses the **bedrock CMK** from SecurityStack (per cdk-guidance:385).
    - Network: private via VPC endpoint, no public access.
    - Data-access: Bedrock KB role as Principal — placeholder role ARN
      until AiStack creates it (OQ-2: spec 4 updates the policy).
  - **45-second cold-start rule restated:** Every path accessing this
    collection MUST implement application-side retry with exponential backoff
    (base 500ms, factor 2, jitter, ceiling 45s) and a minimum 45-second
    cold-start timeout budget. Any Lambda touching AOSS: timeout >= 60s.
  - Dev/staging: standbyReplicas DISABLED (scale-to-zero for cost).
  - Prod: standbyReplicas ENABLED.

- AC-4.5: S3 buckets with Object Lock COMPLIANCE mode:
  - Evidence vault: `objectLockEnabled: true`, COMPLIANCE mode, 2555-day
    (7-year) default retention. Versioned. CMK encrypted (s3-general key).
    Block all public access. Server access logs enabled.
  - Static/general bucket: versioned, CMK encrypted, block public access.
  - Both: RemovalPolicy RETAIN, eventBridgeEnabled: true.
  - Prod-only: S3 WORM evidence vault CRR to us-west-2 (Part 10 DR).

- AC-4.6: All data resources receive SecurityStack CMKs via props (not
  Fn::ImportValue). Every Lambda role touching DynamoDB gets the 6 KMS
  actions (Encrypt, Decrypt, ReEncrypt*, GenerateDataKey*, DescribeKey,
  CreateGrant) on the dynamodb CMK.

### US-5: IdentityStack

**As** the platform,
**I want** three hard-separated Cognito User Pools with the PreTokenGeneration
stub and role groups,
**so that** the identity topology (Part 32) is enforced from day one.

**Acceptance criteria:**

- AC-5.1: Three Cognito User Pools created:
  - Pool A: `cumplify-internal` (SaaS Admin). Groups: PlatformAdmin,
    SupportEngineer, FinanceOps, SecurityOps.
  - Pool B: `cumplify-tenant-admin` (Tenant Admin). Groups: TopManagement,
    IMSLead, QualityManager, EHSManager, DocumentController.
  - Pool C: `cumplify-tenant-user` (Tenant User). Groups: InternalAuditor,
    ExternalAuditor, ProcessOwner, Supervisor, Employee, Contractor,
    PartnerConsultant.

- AC-5.2: Pool-specific configuration:
  - All pools: `custom:tenantId` immutable (mutable: false).
    PreTokenGeneration V1_0 trigger (shared Lambda, ID token only).
    Password policy: minLength 12, all complexity requirements.
    Sign-in by email. Self-signup disabled. Account recovery: EMAIL_ONLY.
    Deletion protection. RemovalPolicy RETAIN.
  - **Pool A:** MFA REQUIRED (OTP only). FeaturePlan ESSENTIALS with
    documented CDK Nag COG4 suppression (reason: "Part 25.2 — ESSENTIALS
    sufficient for internal pool; PLUS deferred to hardening spec if
    advanced-security required").
    IAM Identity Center federation required (SSO for internal staff).
  - **Pool B/C:** MFA OPTIONAL (tenant enforcement policy per Part 14 —
    tenants choose MFA enforcement level in Settings → Security).
    FeaturePlan ESSENTIALS with same COG4 suppression.
    External Auditor (Pool C) forced-MFA is a seat-level setting (deferred
    to identity-3pool-hardening spec).

- AC-5.3: PreTokenGeneration Lambda stub:
  - Runtime: Node.js 22.x, arm64 (Graviton).
  - Timeout: 5 seconds (Cognito hard cap).
  - Stamps `custom:tenantId` and `poolClass` (internal | tenant-admin |
    tenant-user) into the ID token claims.
  - DynamoDB read of role/tier for the user (placeholder until DataStack is
    wired — stub returns the Cognito group as role).

- AC-5.4: App clients per pool:
  - Pool A: code flow, IAM Identity Center federation. Partner app-client
    deferred to spec 6 (Part 16.3).
  - Pool B/C: code flow + SRP.
  - All: read attributes restricted (custom:tenantId readable but not
    writable post-signup).

- AC-5.5: Pools A, B, C have zero shared app clients, zero shared identities,
  zero shared tokens (Part 32 rule). An email may exist in at most one pool
  per environment (provisioning logic — stub for now; full enforcement in
  tenant-lifecycle spec 6).

---

## 2. Non-functional requirements

- NFR-1: CDK Nag (AwsSolutionsChecks) clean on all stacks. No suppression
  without documented reason.
- NFR-2: All Lambda functions: Node.js 22.x, arm64 (Graviton), 14-simplicity.
- NFR-3: No AWS service outside tech.md and Appendices A–H.
- NFR-4: Every AOSS-touching requirement restates the 45-second rule.
- NFR-5: All stacks pass `cdk synth` with the dev context. Stacks deploy to
  dev without manual intervention (except SecurityStack = REQUIRES-HUMAN and
  bootstrap = REQUIRES-HUMAN).
- NFR-6: Cost-check hook will fire on this spec's infra changes — every
  estimate goes through the aws-pricing MCP, no memory pricing.

---

## 3. Readback assertions (design.md §7 will deliver these)

This spec's deployed infrastructure must pass readback assertions for:
- CumplifyCore table: SSE=CMK with expected ARN, 9 GSIs, PITR enabled.
- S3 evidence bucket: ObjectLockConfiguration.Mode = COMPLIANCE, retention set.
- Zero NAT gateways in the VPC.
- Expected VPC endpoints exist (AOSS, Secrets Manager, KMS, Bedrock Runtime, execute-api, S3 gateway, DynamoDB gateway).
- AOSS collection exists with VECTORSEARCH type.
- Aurora cluster: encrypted with rds CMK, auto-pause 0 ACU (dev).
- ElastiCache: at-rest + transit encryption enabled, dedicated CMK.
- 3 Cognito pools exist with correct names and correct MFA settings.
- 10 KMS keys exist with rotation enabled.
- Prod-only: Secrets replicated to us-west-2; S3 WORM CRR configured.

Assertions assume post-deploy mode: a resource expected but ABSENT = FAIL.

---

## 4. Open Questions

- OQ-1: **Resolved (from live findings).** See AC-1.9 — bootstrap runbook
  with exact commands. Dev CDKToolkit is v32 with correct trust to
  157082218687 but needs exec-policy upgrade; mgmt/staging/prod need fresh
  bootstraps. Prod needs us-west-2 as well (DR).

- OQ-2: **AOSS data-access policy Principal placeholder.** The Bedrock KB
  role doesn't exist until AiStack (spec 4). Design decision: spec 4 updates
  the data-access policy when it creates the KB role. Spec 1 creates the
  policy with a placeholder comment and the searchLambdaRole only.

- OQ-3: **Aurora Serverless v2 auto-pause 0 ACU.** Verify via aws-docs MCP
  in design phase that minCapacity: 0 (auto-pause) is supported on Aurora
  PostgreSQL 16.x engine version.

- OQ-4: **Resolved.** Global Table replication is prod-only (Part 10 DR).
  Dev/staging are single-region. Design must handle the replica-region
  DynamoDB key (multi-Region key or dedicated us-west-2 key).

- OQ-5: **Resolved.** Mgmt account = 157082218687 (verified via Organizations).
  00-stack-facts.md updated.

---

## 5. Spec-Drift Notes (implementation deviations from original ACs)

These notes document where the implementation diverged from the original AC
text due to technical constraints discovered during development. Each carries
a rationale and forward-fix reference.

### AC-3.3: RDS secret relocated to DataStack

**Original:** "Secrets Manager secrets for RDS master credentials" in SecurityStack.
**Actual:** The `rdsSecret` (Secrets Manager) is created in **DataStack**, not
SecurityStack.
**Rationale:** Cross-stack circular dependency. The Aurora cluster in DataStack
references the secret (Credentials.fromSecret), and `addRotationSingleUser()`
creates a rotation Lambda that references the cluster. If the secret lives in
SecurityStack and the cluster in DataStack, CloudFormation requires a cyclic
cross-stack reference (Security→Data for rotation, Data→Security for the secret).
Moving the secret to DataStack co-locates it with the cluster, eliminating the cycle.
**Forward fix:** None needed — the secret is encrypted with `secretsKey` from
SecurityStack (passed via props). Rotation, VPC placement, and replica behavior
are unchanged. The SecurityOutputs interface no longer exports `rdsSecret`.

### AC-4.1 / AC-4.5: DR code delivered by task 1.8

**Original:** AC-4.1 specifies "Global Table replication to us-west-2: prod-only"
and AC-4.5 specifies "Prod-only: S3 WORM evidence vault CRR to us-west-2."
**Actual:** Task 1.4 (DataStack) creates the table and bucket WITHOUT the DR
wiring. The Global Table replica and S3 CRR replication configuration are
delivered by **task 1.8 (DrRegionStack + prod DR wiring)**.
**Rationale:** Global Table replica requires a KMS ReplicaKey in us-west-2.
S3 CRR requires a destination bucket in us-west-2. Both require a cross-region
stack (`DrRegionStack`) that didn't exist in the original task decomposition.
The dynamodb CMK is created with `multiRegion: true` in prod (ready for
replication); the wiring is deferred to task 1.8.
**Forward fix:** Task 1.8 implements DrRegionStack (us-west-2), wires the
Global Table replica with ReplicaKey ARN, and configures S3 CRR. R-21, R-22,
and R-24 readback assertions verify at D3 (prod deployment).

### AC-2.1 / AC-2.5: AZ pinning for AOSS endpoint availability

**Original:** "Minimum 2 AZs" (AC-2.1), no explicit AZ selection guidance.
**Actual:** VPC uses **exactly 2 pinned AZs** from the AOSS-supported
intersection, specified per-account in `envConfig.availabilityZones`.
**Rationale:** Deploy attempt #1 to dev failed: `com.amazonaws.us-east-1.aoss`
VPC endpoint service is only available in us-east-1b/1c/1d in account
697114252993. CDK's default AZ selection (1a+1b) included an unsupported AZ,
causing the AOSS interface endpoint creation to fail with
`InvalidParameter: The VPC endpoint service ... is not supported in the
availability zone of the subnet`. All other endpoint services (secretsmanager,
kms, bedrock-runtime, execute-api) support all six AZs.
**Forward fix:** `envConfig.availabilityZones` is populated per-account from
`describe-vpc-endpoint-services` intersection query. Dev = `['us-east-1b',
'us-east-1c']`. Staging/prod values populated as a task 3.1 runbook step
before first pipeline deploy to those accounts.

### Design §6 / AC-4.5: Bucket names removed (auto-generated)

**Original:** Design §6 specifies `cumplify-<env>-vpc-flow-logs` named bucket.
AC-4.5 implies named evidence/general buckets.
**Actual:** All S3 buckets use CloudFormation auto-generated names (no
`bucketName` prop).
**Rationale:** Hardcoded bucket names cause rollback collisions — if a stack
CREATE_FAILED and was rolled back, the bucket may have been created before the
failure. On the next deploy attempt, CloudFormation tries to create the same
named bucket and fails with "BucketAlreadyExists". Auto-generated names make
rollback collisions structurally impossible. Readback reads bucket names from
`cdk-outputs.json` (declared-truth input), not from hardcoded constants.
**Forward fix:** None needed. Bucket ARNs/names are exported via stack outputs
and consumed by readback assertions from `cdk-outputs.json`.

### AC-5.3: Pool-class-map moved to SSM (circular dependency break)

**Original:** Lambda environment variable `POOL_CLASS_MAP` contains JSON
mapping pool IDs to pool class names.
**Actual:** Lambda reads the pool-class-map from an SSM StringParameter at
`/cumplify/<env>/identity/pool-class-map` on cold start (cached). The Lambda's
env carries only the static parameter path string — no pool ID references.
**Rationale:** CloudFormation circular dependency. Pools declare the Lambda as
`lambdaTriggers.preTokenGeneration` (Pool → Lambda permission). If the
Lambda env references pool IDs, that creates Lambda → Pool → Lambda cycle.
Moving the map to SSM breaks the cycle: Lambda → SSM param path (static
string); Pools created independently; SSM param depends on pools (stores their
IDs). Nothing depends on the SSM param. Graph: Lambda ← Pools ← SSM param.
**Forward fix:** None needed. The Lambda reads SSM on cold start with ~50ms
overhead (well within the 5s Cognito trigger budget). ssm:GetParameter granted
on the static ARN pattern.

### AC-3.3 / AC-4.2: RDS secret name removed (auto-generated)

**Original:** Secret with `secretName: cumplify/<env>/rds-master`.
**Actual:** No hardcoded `secretName` — CloudFormation auto-generates.
**Rationale:** Secrets Manager recovery window (7–30 days) makes hardcoded
names the worst rollback collision offender. After a failed stack create, the
orphaned secret blocks the next attempt with "A resource with the ID
already exists." Auto-naming eliminates this class of failure permanently.
Secret ARN flows via stack outputs for consuming stacks.


### AC-5.1: Pool names are env-prefixed

**Original:** Part 32 specifies pool names as `cumplify-internal`,
`cumplify-tenant-admin`, `cumplify-tenant-user`.
**Actual:** Pool names are env-prefixed: `cumplify-dev-internal`,
`cumplify-dev-tenant-admin`, `cumplify-dev-tenant-user`.
**Rationale:** Multi-environment deployment into the same region requires
unique pool names. Without env-prefix, deploying staging alongside dev would
fail with "A user pool with the specified name already exists." The env-prefix
is consistent with all other named resources (KMS aliases, SSM params, etc.).
**Forward fix:** None needed. Pool name is an internal label; the pool ID
(auto-generated, unique) is the external contract.
