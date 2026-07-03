# Spec 1 — platform-foundation

**Source:** Consolidated Parts 4, 9, 11, 32; cdk-guidance.md §1–§2
**Phase:** P0 (foundation — specs 2 and 5 depend on this)
**Out of scope:** Eventing (spec 2), audit-trail logic (spec 5), pool hardening
(identity-3pool-hardening), any application code, AiStack, ApiStack, EventingStack,
ComputeStack, EdgeStack.

**Imported constraints (verbatim):**
- `00-stack-facts.md` — regions, accounts, model IDs, CMK rules, DynamoDB config
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
  synthesizes a PipelineStack (mgmt account) and a CumplifyStage per environment.

- AC-1.2: The pipeline construct uses `crossAccountKeys: true`,
  `enableKeyRotation: true`, `selfMutation: true`.

- AC-1.3: Pipeline stages: Dev (no gate) → Staging (ManualApprovalStep +
  SmokeTest) → Prod (ManualApprovalStep + LegalSignoffGuard).

- AC-1.4: Synth step runs: `npm ci`, `npm run test`, `npm audit --audit-level=high`,
  `npx cdk synth --all`. CDK Nag runs as an Aspect during synth (failures block).

- AC-1.5: CodeStar Connection ARN is parameterized via CDK context (not
  hardcoded). Connection authorization is documented as a one-time REQUIRES-HUMAN
  runbook step.

- AC-1.6: `AwsSolutionsChecks` applied at the App level with `verbose: true`.
  All Nag warnings = failures. Suppressions carry documented `reason`.

- AC-1.7: Environment config (account IDs, regions) injected via CDK context
  per 00-stack-facts.md: dev=697114252993, staging=889007427685, prod=077405654066,
  all us-east-1.

- AC-1.8: WHERE a `fromLookup` call is needed, THEN it is pre-resolved into
  `cdk.context.json` (never live during synth in the pipeline — verified gotcha).

- AC-1.9 (REQUIRES-HUMAN): CDK bootstrap verified/executed for all three target
  accounts with `--trust MGMT_ACCOUNT --cloudformation-execution-policies
  arn:aws:iam::aws:policy/AdministratorAccess`. The existing CDKToolkit in dev
  must be verified for correct version and cross-account trust to the management
  account; re-bootstrap if needed. Staging and prod bootstrapped fresh.

### US-2: NetworkStack

**As** the platform,
**I want** a VPC with private subnets, VPC endpoints, and zero NAT gateways,
**so that** all services communicate privately without the per-GB NAT tax.

**Acceptance criteria:**

- AC-2.1: VPC with private isolated subnets (no public subnets, no NAT gateways).

- AC-2.2: VPC Interface Endpoints for: AOSS (`com.amazonaws.us-east-1.aoss`),
  Secrets Manager, KMS, Bedrock (`bedrock-runtime`), execute-api.
  VPC Gateway Endpoints for: S3, DynamoDB.

- AC-2.3: Flow logs enabled on the VPC (CloudWatch Logs destination).

- AC-2.4: Zero NAT gateways — verified by readback assertion (Part 25 cost lever).

- AC-2.5: Subnets sized for the full stack (RDS multi-AZ, ElastiCache,
  Fargate tasks, Lambda ENIs). Minimum 2 AZs.

### US-3: SecurityStack (REQUIRES-HUMAN — all tasks)

**As** the security team,
**I want** centralized encryption keys, WAF rules, and secrets management,
**so that** every downstream stack inherits defense-in-depth by construction.

**Acceptance criteria:**

- AC-3.1: 8 KMS CMKs created with descriptive aliases:
  `cumplify/<env>/dynamodb`, `cumplify/<env>/s3-general`,
  `cumplify/<env>/secrets`, `cumplify/<env>/cloudwatch-logs`,
  `cumplify/<env>/sns`, `cumplify/<env>/sqs`,
  `cumplify/<env>/eventbridge`, `cumplify/<env>/bedrock`.

- AC-3.2: WAFv2 WebACLs:
  - REGIONAL scope (for AppSync, to be associated in ApiStack spec 3).
  - CLOUDFRONT scope in us-east-1 (for CloudFront distribution, to be
    associated in EdgeStack).
  - Rules: AWS CommonRuleSet, RateLimitPerIP, IpReputationList.

- AC-3.3: Secrets Manager secrets created for RDS master credentials with
  30-day rotation configured (rotation Lambda wired by the RDS cluster
  construct in DataStack).

- AC-3.4: Each CMK has key rotation enabled. Key policies grant access to
  the specific service principals that need them (no wildcard key policies).

- AC-3.5: All CMKs, WAF ACLs, and secrets are exported as stack outputs or
  passed via props to consuming stacks.

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
  - Global Table replication to us-west-2 (DR).

- AC-4.2: Aurora Serverless v2 PostgreSQL cluster:
  - Engine: Aurora PostgreSQL 16.x.
  - Writer + 1 reader (scaleWithWriter).
  - Private isolated subnets (VPC from NetworkStack).
  - Storage encrypted with RDS CMK from SecurityStack.
  - Credentials from Secrets Manager (with 30-day rotation).
  - Deletion protection enabled. RemovalPolicy RETAIN.
  - Dev/staging: auto-pause to 0 ACU (minCapacity: 0, maxCapacity: 4).
  - Prod: minCapacity 0.5, maxCapacity configurable via context.

- AC-4.3: ElastiCache Redis replication group:
  - Private subnets. At-rest + in-transit encryption.
  - Small replica group per environment (single node dev, multi-AZ prod).
  - CMK encryption (reuse secrets or dedicated CMK per key policy).

- AC-4.4: OpenSearch Serverless (AOSS) collection:
  - Type: VECTORSEARCH.
  - Name: `cumplify-iso-kb`.
  - Three required policies: encryption (CMK from SecurityStack), network
    (private via VPC endpoint, no public access), data-access (Bedrock KB
    role as Principal — placeholder role ARN until AiStack creates it).
  - **45-second cold-start rule restated:** Every path accessing this
    collection MUST implement application-side retry with exponential backoff
    (base 500ms, factor 2, jitter, ceiling 45s) and a minimum 45-second
    cold-start timeout budget. Any Lambda touching AOSS: timeout >= 60s.
  - Dev: standbyReplicas DISABLED (scale-to-zero for cost).
  - Prod: standbyReplicas ENABLED.

- AC-4.5: S3 buckets with Object Lock COMPLIANCE mode:
  - Evidence vault: `objectLockEnabled: true`, COMPLIANCE mode, 2555-day
    (7-year) default retention. Versioned. CMK encrypted (s3-general key).
    Block all public access. Server access logs enabled.
  - Static/general bucket: versioned, CMK encrypted, block public access.
  - Both: RemovalPolicy RETAIN, eventBridgeEnabled: true.

- AC-4.6: All data resources pass the SecurityStack CMKs via props (not
  cross-stack Fn::ImportValue). Every Lambda role touching DynamoDB gets the
  6 KMS actions (Encrypt, Decrypt, ReEncrypt*, GenerateDataKey*, DescribeKey,
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

- AC-5.2: Each pool configured with:
  - `custom:tenantId` as immutable custom attribute (mutable: false).
  - PreTokenGeneration V1_0 trigger (shared Lambda, ID token only).
  - FeaturePlan: PLUS (advanced security — CDK Nag COG4).
  - MFA: REQUIRED (OTP only, no SMS/email MFA).
  - Password policy: minLength 12, all complexity requirements.
  - Sign-in by email. Self-signup disabled.
  - Account recovery: EMAIL_ONLY.
  - Deletion protection. RemovalPolicy RETAIN.

- AC-5.3: PreTokenGeneration Lambda stub:
  - Runtime: Node.js 22.x, arm64 (Graviton).
  - Timeout: 5 seconds (Cognito hard cap).
  - Stamps `custom:tenantId` and `poolClass` (internal | tenant-admin |
    tenant-user) into the ID token claims.
  - DynamoDB read of role/tier for the user (placeholder until DataStack is
    wired — stub returns the Cognito group as role).

- AC-5.4: App clients per pool with:
  - Read attributes restricted (custom:tenantId readable but not writable
    post-signup).
  - OAuth flows configured for the use case (Pool A: SSO/code flow;
    Pool B/C: code flow + SRP).

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
- Expected VPC endpoints exist (AOSS, Secrets Manager, KMS, Bedrock, execute-api, S3, DynamoDB).
- AOSS collection exists with VECTORSEARCH type.
- Aurora cluster: encrypted, auto-pause 0 ACU (dev), multi-AZ.
- ElastiCache: at-rest + transit encryption enabled.
- 3 Cognito pools exist with correct names and MFA REQUIRED.
- 8 KMS keys exist with rotation enabled.

Assertions assume post-deploy mode: a resource expected but ABSENT = FAIL.

---

## 4. Open Questions

- OQ-1: **CDK bootstrap trust (carried from spec 38).** The dev account's
  existing CDKToolkit bootstrap predates the pipeline requirement. Must verify
  its version (>= 21, for modern pipeline support) and that it trusts the
  management account. If trust is missing or version is stale, re-bootstrap
  is REQUIRES-HUMAN. Staging and prod need fresh bootstraps.

- OQ-2: **AOSS data-access policy Principal placeholder.** The Bedrock KB
  role doesn't exist until AiStack (spec 4). The data-access policy must
  include a placeholder or be updated when spec 4 deploys. Design must decide:
  (a) create the KB role in DataStack with a narrow trust, or (b) update the
  policy in spec 4. Leaning (b) — the role's trust boundary belongs to AiStack.

- OQ-3: **Aurora Serverless v2 auto-pause 0 ACU.** AWS docs indicate
  `minCapacity: 0` enables auto-pause (pause after 5 minutes of inactivity).
  Verify via aws-docs MCP in design phase that this is supported on the
  current Aurora PostgreSQL 16.x engine version.

- OQ-4: **Global Table replication setup.** DynamoDB Global Tables require
  the replica region to be bootstrapped and the table created in both regions
  simultaneously (or added after). Design must specify whether the us-west-2
  replica is created at initial deploy or deferred to a DR-readiness task.

- OQ-5: **Pipeline management account ID.** The pipeline lives in the mgmt
  account — its account ID is not yet in 00-stack-facts.md. Must be added
  during design (or OQ resolved with the owner).
