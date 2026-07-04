# Spec 1 — platform-foundation: Tasks

**Design approved:** 2026-07-03
**Closure rule:** All SecurityStack tasks REQUIRES-HUMAN. Every infra task
closes via Template F at D3 (deployed to dev + readback green).

---

## Dependency Wave 1 — CDK Skeleton + Bootstrap (human-gated)

### Task 1.1: CDK app skeleton + stage construct + pipeline definition
**Traces to:** AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-1.6, AC-1.7, AC-1.8, NFR-1
**D-rung:** D1 (compiles & synths — no deployment until bootstrap)
**Depends on:** nothing

**Deliverables:**
- [x] `infra/bin/cumplify.ts` — CDK app entrypoint. Instantiates PipelineStack
  (mgmt account) and CumplifyStage per environment.
- [x] `infra/lib/pipeline-stack.ts` — CodePipeline with crossAccountKeys,
  enableKeyRotation, selfMutation. Stages: Dev (no gate), Staging
  (ManualApprovalStep + SmokeTest post-deploy), Prod (ManualApprovalStep +
  LegalSignoffGuard + RollbackInitiator post-deploy). Synth: npm ci, test,
  audit, cdk synth --all.
- [x] `infra/lib/cumplify-stage.ts` — CumplifyStage accepting EnvConfig props
  (§1.2 table). Instantiates NetworkStack → SecurityStack → DataStack →
  IdentityStack with addDependency.
- [x] `infra/lib/env-config.ts` — EnvConfig interface + dev/staging/prod configs.
- [x] CodeStar Connection ARN parameterized in cdk.context.json.
- [x] AwsSolutionsChecks applied at App level with verbose:true.
- [x] CDK Nag: all warnings = failures.
- [x] aws-cdk-lib + constructs as dependencies in package.json.
- [x] `cdk synth --all -c env=dev` passes clean (empty stacks at this point).

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.1`.
Steps 1–5 PASS (TypeScript compiles, lint, synth with empty stacks + Nag clean).
**Closed D1:** .kiro/evidence/platform-foundation/1.1.log

---

### Task 1.2: NetworkStack
**Traces to:** AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5, §6 (flow-logs bucket)
**D-rung:** D1 (compiles & synths — no deployment until bootstrap)
**Depends on:** 1.1

**Deliverables:**
- [x] `infra/lib/network-stack.ts` — VPC with private isolated subnets only,
  minimum 2 AZs, zero NAT gateways.
- [x] VPC Interface Endpoints: AOSS, Secrets Manager, KMS, bedrock-runtime,
  execute-api.
- [x] VPC Gateway Endpoints: S3, DynamoDB.
- [x] Flow logs to S3 (dedicated flow-logs bucket, s3-general CMK, 90-day
  lifecycle expiry).
- [x] Exports: VPC, subnets, security groups via props (not stack outputs).
- [x] Note: ecr.api, ecr.dkr, logs endpoints deferred to ComputeStack.
  bedrock-agent-runtime deferred to spec 4 (AiStack).

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.2`.
Synth passes; CDK Nag clean; zero-NAT assertion in synth output.
**Closed D3:** .kiro/evidence/platform-foundation/2.1-closure.md (readback R-7..R-9, R-23)

---

### Task 1.3: SecurityStack (REQUIRES-HUMAN)
**Traces to:** AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5, NFR-1
**D-rung:** D1 (compiles & synths — deploy requires bootstrap)
**Depends on:** 1.1

**Deliverables:**
- [x] `infra/lib/security-stack.ts` — 10 KMS CMKs with aliases
  (cumplify/<env>/dynamodb, rds, elasticache, s3-general, secrets,
  cloudwatch-logs, sns, sqs, eventbridge, bedrock). All with key rotation
  enabled. Key policies per service principal (no wildcard).
- [x] Prod dynamodb CMK: `multiRegion: true` (for Global Table DR).
- [x] WAFv2 WebACLs: REGIONAL (CommonRuleSet, RateLimit 2000/5min,
  IpReputationList) + CLOUDFRONT scope in us-east-1.
- [x] Secrets Manager secret for RDS master credentials (30-day rotation
  configured). Prod-only: replica to us-west-2.
- [x] All outputs passed via props to consuming stacks.

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.3`.
Synth passes; CDK Nag clean; 10 CMKs in synth output.
**Closed D3:** .kiro/evidence/platform-foundation/2.1-closure.md (readback R-19, R-20)

---

### Task 1.4: DataStack
**Traces to:** AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5, AC-4.6, NFR-4
**D-rung:** D1 (compiles & synths — deploy requires bootstrap)
**Depends on:** 1.2, 1.3

**Deliverables:**
- [x] `infra/lib/data-stack.ts`:
  - DynamoDB CumplifyCore TableV2: PK/SK, on-demand, dynamodb CMK, PITR,
    streams NEW_AND_OLD_IMAGES, deletion protection, RETAIN, 9 GSIs.
    Prod-only: Global Table replica us-west-2 (using multi-Region key).
  - Aurora Serverless v2 PostgreSQL 16.x: writer + reader (scaleWithWriter),
    private subnets, rds CMK, Secrets Manager creds, deletion protection,
    RETAIN. Dev/staging: minCapacity 0, maxCapacity 4. Prod: minCapacity 0.5,
    maxCapacity via context. addRotationSingleUser (30-day, same VPC —
    secretsmanager endpoint for API calls, no NAT).
  - ElastiCache Redis: private subnets, at-rest + transit encryption,
    elasticache CMK. Dev: single cache.t4g.micro. Prod: multi-AZ.
  - AOSS collection: VECTORSEARCH, cumplify-iso-kb. Encryption policy
    (bedrock CMK), network policy (VPC endpoint, no public), data-access
    policy (CFN exec role as PLACEHOLDER principal, commented for specs 4/5).
    Dev/staging: standbyReplicas DISABLED. Prod: ENABLED.
    45-second cold-start rule restated in code comments.
  - S3 evidence vault: Object Lock COMPLIANCE 2555-day, versioned, s3-general
    CMK, block public, server access logs, RETAIN, eventBridge enabled.
    Prod-only: CRR to us-west-2.
  - S3 static/general bucket: versioned, CMK, block public, RETAIN.
- [x] All CMKs received via props from SecurityStack.
- [x] 6 KMS actions policy documented for any Lambda role touching DynamoDB.

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.4`.
Synth passes; CDK Nag clean.
**Closed D3:** .kiro/evidence/platform-foundation/2.1-closure.md (readback R-1..R-6, R-10..R-15)

---

### Task 1.5: IdentityStack
**Traces to:** AC-5.1, AC-5.2, AC-5.3, AC-5.4, AC-5.5, NFR-2
**D-rung:** D1 (compiles & synths — deploy requires bootstrap)
**Depends on:** 1.4 (PreTokenGen reads DynamoDB table name from DataStack props)

**Deliverables:**
- [x] `infra/lib/identity-stack.ts`:
  - Pool A (cumplify-internal): MFA REQUIRED, ESSENTIALS, groups
    (PlatformAdmin, SupportEngineer, FinanceOps, SecurityOps). COG4
    suppression with reason.
  - Pool B (cumplify-tenant-admin): MFA OPTIONAL, ESSENTIALS, groups
    (TopManagement, IMSLead, QualityManager, EHSManager, DocumentController).
    COG4 suppression.
  - Pool C (cumplify-tenant-user): MFA OPTIONAL, ESSENTIALS, groups
    (InternalAuditor, ExternalAuditor, ProcessOwner, Supervisor, Employee,
    Contractor, PartnerConsultant). COG4 suppression.
  - All: custom:tenantId immutable, PreTokenGeneration V1_0, sign-in email,
    self-signup disabled, EMAIL_ONLY recovery, deletion protection, RETAIN.
  - App clients: Pool A code flow (IdC federation deferred to task 3.2).
    Pool B/C code flow + SRP. Attributes restricted.
- [x] `services/pre-token-gen/index.ts` — PreTokenGeneration Lambda stub.
  Node.js 22.x, arm64, 5s timeout. Stamps tenantId + poolClass into ID token.
  Falls back to Cognito group as role (logs fallback — no silent paths).
- [x] Property-based test: `services/pre-token-gen/handler.property.test.ts`
  (arbitrary tenantId/group inputs → valid token claims output).

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.5`.
Steps 1–5 PASS including property test execution and synth + Nag clean.
**Closed D3:** .kiro/evidence/platform-foundation/2.1-closure.md (readback R-16..R-18)

---

### Task 1.6: Readback assertions for all stacks
**Traces to:** §7 (R-1 through R-22), §3 readback target set
**D-rung:** D1 (compiles — readback runs after deploy)
**Depends on:** 1.2, 1.3, 1.4, 1.5

**Deliverables:**
- [x] `infra/readback/platform-foundation.test.ts` — all 22 assertions from
  design §7 using assertResource helper. Env-conditional assertions
  (R-21, R-22 prod-only) read envConfig from cdk-outputs.json.
- [x] R-11 (AOSS CollectionStatus=ACTIVE) waits up to 45s budget for
  collection to settle.
- [x] All assertions use ABSENT=FAIL semantics (post-deploy mode).
- [x] `cdk-outputs.json` loading utility for readback tests.

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.6`.
Compiles; readback framework reports SKIPPED (no deployed resources yet).
**Closed D1:** .kiro/evidence/platform-foundation/1.6.log

---

### Task 1.7: CDK bootstrap (REQUIRES-HUMAN)
**Traces to:** AC-1.9
**D-rung:** D3 (deployed & read back — bootstrap is a deployment)
**Depends on:** 1.1 (CDK app must exist for bootstrap to reference)
**REQUIRES-HUMAN**

**Deliverables:**
- [x] Dev (697114252993): re-bootstrap with `--trust 157082218687
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess`.
  Verify CDKToolkit version >= 21 and trust is correct after bootstrap.
- [x] Mgmt (157082218687): bootstrap.
- [x] Staging (889007427685): fresh bootstrap with same trust.
- [x] Prod (077405654066): fresh bootstrap us-east-1 AND us-west-2.
- [x] Readback: verify each account's CDKToolkit has correct trust principal.

**Completion evidence:** `3 accounts × bootstrap readback showing trust to 157082218687`.
Evidence captured manually (human-executed, readback of CDKToolkit stacks).
**Closed D3:** Human-executed bootstrap. CDKToolkit trust verified.

---

### Task 1.8: DrRegionStack + prod DR wiring
**Traces to:** AC-4.1 (Global Table replica), AC-4.5 (S3 CRR), AC-3.3 (secrets replica)
**D-rung:** D1 (`cdk synth --all -c env=prod` clean with Nag)
**Depends on:** 1.3 (CMKs), 1.4 (DataStack)
**D3 deferred:** to prod deployment (task 2.1 is dev-only; prod deploy is post-pipeline)

**Deliverables:**
- [x] `infra/lib/dr-region-stack.ts` — us-west-2 cross-region stack (prod-only):
  - KMS ReplicaKey from the multi-region dynamodb CMK (for Global Table DR).
  - S3 CRR destination bucket (Object Lock COMPLIANCE, CMK, for evidence vault).
- [x] Wire Global Table replica in DataStack using the ReplicaKey ARN
  (conditional on `envConfig.globalTableReplica`).
- [x] Wire S3 CRR replication configuration on evidence vault
  (conditional on `envConfig.s3Crr`).
- [x] Add R-24 readback assertion: S3 CRR replication status = ENABLED
  (prod-only, in `infra/readback/platform-foundation.test.ts`).
- [x] `cdk synth --all -c env=prod` passes clean with CDK Nag.

**Completion evidence:** `npm run verify -- --spec platform-foundation --task 1.8`.
Synth passes for all env contexts (dev, staging, prod). Nag clean.
**Closed D1:** .kiro/evidence/platform-foundation/1.8.log (synth clean for dev + prod)

---

## Dependency Wave 2 — Direct Deploy + Readback (human-gated)

### Task 2.1: Direct CLI deploy to dev (REQUIRES-HUMAN)
**Traces to:** All AC-2.x through AC-5.x (deployed reality), NFR-5
**D-rung:** D3 (deployed & read back)
**Depends on:** Wave 1 complete (all stacks synth-passing + bootstrap done)
**REQUIRES-HUMAN**

**Deliverables:**
- [x] Human runs `cdk deploy --all --app 'npx tsx infra/bin/cumplify.ts'
  -c env=dev` with deploy credentials.
- [x] All 4 stacks deploy successfully to dev.
- [x] `cdk-outputs.json` committed to repo (declared-truth readback input).
- [x] Run `npm run readback` — all dev-applicable assertions (R-1 through
  R-20) PASS. (R-21, R-22 skipped — prod-only.)
- [x] Readback evidence captured as
  `.kiro/evidence/platform-foundation/2.1.log`.

**Completion evidence:** `.kiro/evidence/platform-foundation/2.1.log` shows
all 20 dev readback assertions PASS.
**Closed D3:** .kiro/evidence/platform-foundation/2.1-closure.md + 2.1-readback-architect-witness.log

---

## Dependency Wave 3 — Pipeline Adoption + Federation (human-gated)

### Task 3.1: GitHub remote + CodeStar Connection + pipeline deploy (REQUIRES-HUMAN)
**Traces to:** AC-1.5, AC-1.3
**D-rung:** D3 (pipeline deployed to mgmt + first run completes)
**Depends on:** 2.1 (dev already deployed — pipeline must be a no-op)
**REQUIRES-HUMAN**

**Deliverables:**
- [x] Create GitHub remote (`Cumplifyrepo/Cumplify`)
  (Re-homed 2026-07-03 by owner order: prior account unwired from all functional
  references; historical evidence logs retain old slug as immutable record.), push develop branch.
- [x] Create CodeStar Connection in mgmt account. Authorize (PENDING→AVAILABLE).
- [x] **Populate staging/prod availabilityZones** in `infra/lib/env-config.ts`:
  Run `aws ec2 describe-vpc-endpoint-services --service-names
  com.amazonaws.us-east-1.aoss com.amazonaws.us-east-1.secretsmanager
  com.amazonaws.us-east-1.kms com.amazonaws.us-east-1.bedrock-runtime
  com.amazonaws.us-east-1.execute-api --query 'ServiceDetails[].AvailabilityZones'`
  in each target account. Intersect the results → pick 2 AZs common to all
  five services. Commit the populated arrays before pipeline first run.
  (Resolved 2026-07-04 post-closure by architect: both accounts intersect to
  b/c/d with AOSS constraining; picked us-east-1b/c. Evidence:
  3.1-az-intersection.log. Gate approval now blocks only on owner cost sign-off.)
- [x] Deploy PipelineStack to mgmt account.
- [x] Pipeline self-mutates successfully.
- [x] **Pipeline first run completes as a no-op** against the already-deployed
  dev stacks (no resource changes, no drift).
- [x] Evidence: pipeline execution history showing successful no-op.

**Completion evidence:** Pipeline execution ID + "no changes" confirmation
from the dev stage. Captured in `.kiro/evidence/platform-foundation/3.1.log`.
**Closed D3:** .kiro/evidence/platform-foundation/3.1-closure.md + 3.1-pipeline-noop-architect-witness.log
**Carried condition:** staging/prod availabilityZones not yet populated (blocks gate approval).

---

### Task 3.2: Pool A IAM Identity Center federation (REQUIRES-HUMAN)
**Traces to:** AC-5.2 (Pool A IdC federation), AC-5.4 (Pool A code flow)
**D-rung:** D3 (deployed + federation working)
**Depends on:** 2.1 (Pool A must exist in dev first)
**REQUIRES-HUMAN**

**Deliverables:**
- [x] Create SAML application in IAM Identity Center (instance
  ssoins-7223ecc47a6f8a22) pointing to Pool A's SAML endpoint.
  (cumplify-pool-a-sso apl-7223d822671e7fe5 ENABLED; user assigned. 3.2.log)
- [x] Download IdC SAML metadata → configure Cognito SAML identity provider
  on Pool A. (CumplifyIdC deployed + read back; metadata HTTP 200 validated.)
- [x] Configure Cognito callback URLs in IdC app.
  (ACS/entityID trust proven: authorize → 302 to IdC with valid SAMLRequest.)
- [ ] Verify SSO login flow: IdC user → Pool A → ID token with tenantId +
  poolClass=internal. (PENDING 2 proven-irreducibly-human steps: IdC email
  attribute mapping [console-only, proven 4 ways] + interactive password login
  [no password API]. Cognito→IdC leg already proven. Details: 3.2.log.)
- [x] Readback: Pool A has SAML provider configured.
  (list-identity-providers: CumplifyIdC SAML; client supports it.)

**Completion evidence:** Successful SSO login captured + readback showing
SAML provider on Pool A. `.kiro/evidence/platform-foundation/3.2.log`.

---

## Sequencing Summary

```
Wave 1 (CDK code + bootstrap):
  1.1 (skeleton) → 1.2 (network), 1.3 (security) [parallel]
                 → 1.4 (data, needs 1.2+1.3) → 1.5 (identity, needs 1.4)
                 → 1.6 (readback assertions, needs all stacks)
  1.7 (bootstrap, REQUIRES-HUMAN, needs 1.1)
  1.8 (DR region stack + prod wiring, needs 1.3+1.4)

Wave 2 (direct deploy — after Wave 1 complete):
  2.1 (cdk deploy + readback, REQUIRES-HUMAN)

Wave 3 (pipeline + federation — after Wave 2):
  3.1 (GitHub + CodeStar + pipeline, REQUIRES-HUMAN)
  3.2 (IdC federation, REQUIRES-HUMAN, parallel with 3.1)
```

---

## Post-completion notes

- All SecurityStack code (task 1.3) is REQUIRES-HUMAN per closure rule —
  human reviews the diff before any deploy touches encryption keys/WAF/secrets.
- The direct CLI deploy (task 2.1) is the first D3 closure in this spec.
  The pipeline (task 3.1) takes over all subsequent deploys.
- Cost-check hook will fire on tasks 1.2–1.5 (infra changes). Each estimate
  must go through aws-pricing MCP per NFR-6.
- Prod deployment is NOT in scope for this spec's tasks (dev-only D3). Staging
  and prod deploy via the pipeline in later phases once the pipeline is proven.

## Closure semantics (what the dod-gate enforces)

- **Tasks 1.1, 1.6:** Close at D1 (code-only tasks). Their deployment proofs
  live in tasks 3.1 (pipeline no-op) and 2.1 (readback green) respectively.
  Checkboxes marked at D1 evidence-gate pass.
- **Tasks 1.2–1.5:** Produce D1 evidence at code-complete (synth + Nag clean),
  but **checkboxes are marked only when task 2.1's readback covers their
  resources** — the spec's D3 closure rule applies to final closure, not to
  interim evidence. The dod-gate will reject a close attempt on these tasks
  until 2.1's readback log shows their assertions green.
- **Task 1.7:** Closes at D3 (bootstrap is itself a deployment; readback =
  CDKToolkit trust verification).
- **Tasks 2.1, 3.1, 3.2:** Close at D3 per Template F (deployed + readback green).
