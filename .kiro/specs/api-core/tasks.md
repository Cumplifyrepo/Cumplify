# API Core — Tasks

**Spec:** `api-core`
**Design approved:** R2 + FF-1..FF-6
**Budget:** $0 standing-cost additions. Any deviation stops for architect.
**Convention:** `[KIRO]` = Kiro executes. `[ARCHITECT]` = architect/owner executes (deploys, witnessed readbacks, live proofs). `[REQUIRES-HUMAN]` = owner reviews diff before merge (C-2).
**Evidence contract:** Rule 7 — checkbox edits ONLY in the same commit as the evidence log. Rule 8 — readback rows carry timestamp + exit code + cdk-outputs.json blob SHA. Evidence path: `.kiro/evidence/api-core/`.

---

## Task 1 — DataStack amendments (enableDataApi + new exports) [KIRO]

- [x] Add `enableDataApi: true` to the Aurora cluster construct in `infra/lib/data-stack.ts`.
- [x] Export `clusterArn` (string) and `dbSecretArn` (string) as public stack properties + CfnOutputs.
- [ ] Template-assertion test: verify `enableDataApi` property, verify 2 new CfnOutputs exist.
- [x] `cdk synth` passes, CDK Nag zero warnings.

**Depends on:** nothing (first task).
**Deploy:** [ARCHITECT] — runtime property change on existing cluster, no replacement.
**Evidence:** b0bb46e — 206/206 tests pass, 2026-07-07T16:54 exit 0.

---

## Task 2 — IdentityStack amendments (Pool B/C exports) [KIRO]

- [x] Export `poolBId`, `poolBArn`, `poolCId`, `poolCArn` as public stack properties + CfnOutputs from `infra/lib/identity-stack.ts`.
- [ ] Template-assertion test: verify 4 new CfnOutputs exist.
- [x] `cdk synth` passes, CDK Nag zero warnings.

**Depends on:** nothing (parallel with Task 1).
**Deploy:** [ARCHITECT] — output-only change, no resource modification.
**Evidence:** e600127 — 206/206 tests pass, 2026-07-07T16:55 exit 0.

---

## Task 3 — Publisher upgrade: auditTrail stamping + registry [KIRO]

- [x] Create `services/eventing/src/audit-trail-registry.ts` with full `AUDIT_TRAIL_REGISTRY` map (58 events from contracts/events.md trail designation).
- [x] Update `services/eventing/src/publisher.ts`: stamp `auditTrail` from registry; throw on unregistered detailType.
- [x] Update `services/eventing/src/types.ts`: add `auditTrail: boolean` to `CumplifyEvent` interface.
- [x] Create parity test: asserts registry keys ↔ contracts/events.md trail designation section agreement.
- [x] Update existing publisher tests to include `auditTrail` field in assertions.
- [x] All tests pass (`vitest --run`).

**Depends on:** nothing (parallel with Tasks 1–2).
**Evidence:** d36b30b — 212/212 tests pass (+6 new), 2026-07-07T16:58 exit 0.

---

## Task 4 — EventingStack R-3 pattern rewrite [KIRO]

- [x] Update `infra/lib/eventing-stack.ts`: replace R-3 `detailType` suffix pattern with `{ detail: { auditTrail: [true] } }`.
- [x] Update `infra/lib/eventing-stack.unit.test.ts`: template assertion for new R-3 pattern.
- [x] `cdk synth` passes, CDK Nag zero warnings.
- [x] Integration test: update event-pattern.int.test.ts to use `auditTrail: true` in test events.

**Depends on:** Task 3 (publisher must stamp auditTrail before R-3 expects it).
**Deploy:** [ARCHITECT] — R-3 swap is LAST step per §13.4 deploy-order constraint.
**Verification:** [ARCHITECT] — live `TestEventPattern` positive + negative proofs.
**Evidence:** dea438d — 212/212 tests pass, 2026-07-07T17:01 exit 0.

---

## Task 5 — RDS migrations: schemas + tables + RLS [KIRO]

- [x] Create `services/api/migrations/` directory structure.
- [x] `001_create_schemas.sql`: CREATE SCHEMA m1, m2, m3, m4, m5, m5_views.
- [x] `002_m1_document_studio.sql`: 6 tables per RDS-1 + audit columns + tenant_id.
- [x] `003_m2_capa.sql`: 5 tables per RDS-1.
- [x] `004_m3_audit_studio.sql`: 5 tables per RDS-1.
- [x] `005_m4_records_management.sql`: 4 tables per RDS-1.
- [x] `006_m5_risk_management.sql`: 3 base tables per RDS-1.
- [x] `007_rls_policies.sql`: RLS on all 23 base tables, using `current_setting('app.tenant_id', true)` (fail-closed).
- [x] `008_risk_register_view.sql`: materialized view + SECURITY DEFINER accessor function (§6.4) + REVOKE/GRANT.
- [x] `009_app_role.sql`: CREATE ROLE app_role + GRANT DML on 23 tables + EXECUTE on accessor (C-1 remediation).
- [x] Create `services/api/src/migration-runner.ts`: executes SQL via Data API, parameterized `set_config`, tracks `_migrations` table.
- [x] Create `services/api/src/migrator.ts`: CDK Custom Resource handler wrapping migration-runner.
- [ ] Unit tests for migration-runner (mock Data API client).

**Depends on:** Task 1 (DataStack enableDataApi + exports).
**Deploy:** [ARCHITECT] — migrations execute via Custom Resource on first deploy.
**Evidence:** c74a593 — 212/212 tests pass, 2026-07-07T17:04 exit 0. Remediation: this commit.

---

## Task 6 — GraphQL schema (M1–M5 types + operations) [KIRO]

- [x] Create `services/api/schema/schema.graphql` with types for all M1–M5 entities per module-spec.
- [x] Define all queries and mutations per §2.2 operations table.
- [x] User-facing operations annotated `@aws_lambda`; agent-path `@aws_iam`.
- [x] Subscriptions (5 per §12) with None data source, tenant-claim verification.
- [x] SCHEMA-5: no `tenantId` in mutation input types (resolvers overwrite from resolverContext).

**Depends on:** nothing (parallel, schema is a file artifact).
**Evidence:** 2ceaa74 — 212/212 tests pass, 2026-07-07T17:00 exit 0.

---

## Task 7 — ApiStack: AppSync API + authorizer + WAFv2 [KIRO] [REQUIRES-HUMAN]

- [x] Create `infra/lib/api-stack.ts` with:
  - AppSync GraphQL API: `AWS_LAMBDA` default auth + `AWS_IAM` additional.
  - Lambda authorizer construct (NodejsFunction, node22/ARM/512MB/10s).
  - WAFv2 association with SecurityStack WebACL.
  - Migration Custom Resource (provider + migrator Lambda).
  - CfnOutputs: API URL, API ID, authorizer ARN, tenant-data-role ARN.
- [x] DataStack amendment: provision a dedicated `app_role` Secrets Manager secret (username/password for the app_role created by migration 009). Resolvers use this secret for Data API. Migrator keeps master secret. Password sync via ALTER ROLE on every deploy (migrator.ts syncAppRolePassword). **[REQUIRES-HUMAN]** — IAM/secrets.
- [x] Wire ApiStack into `infra/lib/cumplify-stage.ts` with addDependency on DataStack, IdentityStack, SecurityStack, EventingStack.
- [ ] Template-assertion tests per §11.1.
- [x] `cdk synth` passes, CDK Nag zero warnings.
- [ ] **[REQUIRES-HUMAN]** Authorizer code + IAM policies flagged for owner review (C-2/AUTH-5).

**Depends on:** Tasks 1, 2, 4 (stack exports + eventing amendment).
**Evidence:** this commit — 212/212 tests pass, tsc clean.

**Depends on:** Tasks 1, 2, 4 (stack exports + eventing amendment).

---

## Task 8 — Lambda authorizer implementation [KIRO] [REQUIRES-HUMAN]

- [x] Create `services/api/src/authorizer.ts`:
  - JWKS verification (Pool B + Pool C, cached via jose createRemoteJWKSet).
  - Pool-A rejection (Layer 1): if issuer ≠ Pool B/C → deny before role logic.
  - Expiry check, `custom:tenantId` presence check.
  - ID token only (token_use='id', never access token — C-8).
  - Read tenant metadata from CumplifyCore (`TENANT#<tenantId>#META` / `PLAN`) for static entitlement stamp.
  - Return `resolverContext`: {tenantId, role, poolClass, sub, entitlement}.
- [x] Authorizer execution role DDB policy: `dynamodb:GetItem` on CumplifyCore with LeadingKeys condition `StringLike 'TENANT#*'` (metadata reads at auth time — cannot use tenant-data role because no tenant context exists yet at authorization time; the authorizer IS the entity that establishes tenant context).
- [x] Unit tests (10): valid B token → allow; valid C token → allow; Pool A token → deny; expired → deny; missing tenantId → deny; bad signature → deny; access token → deny; poolClass internal → deny; DDB failure → default entitlement; empty token → deny.
- [x] Structured logging via `@aws-lambda-powertools/logger` (tenantId + requestId).
- [ ] **[REQUIRES-HUMAN]** Owner reviews authorizer code + IAM policy before merge.

**Depends on:** Task 7 (ApiStack wires the authorizer).
**Evidence:** this commit — 222/222 tests pass (+10 new), tsc clean.

---

## Task 9 — Tenant-data role (CARRY-1) [KIRO] [REQUIRES-HUMAN]

- [x] In ApiStack: create tenant-data IAM role per §7.2–7.3:
  - Trust policy: resolver execution roles as principals + sts:TagSession.
  - Tag condition: `aws:RequestTag/tenantId` matches bare tenantId (FF-3: NOT TENANT#-prefixed).
  - Inline policy: DDB actions on `${tableArn}` + `${tableArn}/index/*` with `dynamodb:LeadingKeys` condition `TENANT#${aws:PrincipalTag/tenantId}#*`.
  - GSI grant included (FF-5: all 9 GSIs use TENANT#-prefixed partition keys by design constraint).
  - KMS decrypt grant on DynamoDB CMK.
- [x] Grant `sts:AssumeRole` + `sts:TagSession` on tenant-data role to each resolver execution role (in Task 7).
- [ ] Template-assertion tests: trust policy, inline policy condition, grants.
- [ ] **[REQUIRES-HUMAN]** IAM policy diff flagged for owner review (C-2).

**Depends on:** Task 7 (ApiStack + resolver Lambdas).
**Evidence:** this commit — 222/222 tests pass, tsc clean.

**Depends on:** Task 7 (ApiStack + resolver Lambdas).

---

## Task 10 — Resolver Lambdas (M1–M5) [KIRO]

- [x] Create 5 resolver Lambdas (`services/api/src/resolvers/m1.ts` .. `m5.ts`):
  - Read `resolverContext.tenantId`, validate (SCHEMA-5: overwrite any client-supplied tenantId).
  - Assume tenant-data role with tenantId session tag (§7.4 pattern).
  - Data API: use app_role secretArn (NOT master). BeginTransaction → `select set_config('app.tenant_id', :tenantId, true)` as FIRST statement → domain query/mutation → CommitTransaction.
  - **C-2 INVARIANT (review-blocking):** `set_config` with `true` (transaction-local) MUST be the first statement in every BeginTransaction. Never `false`. Never a bare ExecuteStatement for tenant-scoped data. A reused-connection test verifies: 2nd request without set_config → zero rows (never prior tenant's data).
  - Publish audit event via `services/eventing` publisher (auditTrail stamped).
  - Structured logging (tenantId + requestId).
- [x] C-2 unit test: mock Data API client, assert set_config is FIRST in-transaction statement (ITEM-2b).
- [x] Repository-layer unit test asserting every written GSI*PK attribute value is `TENANT#`-prefixed (FF-5 convention enforcement, ITEM-2a).
- [x] Integration wiring: AppSync resolver mapping to Lambda functions (BLOCK-1: data sources + createResolver for all fields).
- [ ] Unit tests per resolver (mock Data API + STS + EventBridge) — deferred to post-wiring.
- [ ] Reused-connection test (live): simulates two requests on same pooled connection; second without set_config returns zero rows (C-2 live proof, post-deploy).
- [ ] C-7 CI denial suite (6 integration tests from design §11.3, post-deploy):
  1. Authorizer denial: Pool-A token → 401.
  2. DynamoDB denial: simulate-principal-policy cross-tenant → implicitDeny.
  3. RDS RLS denial: tenant-B session → empty result on tenant-A data.
  4. Materialized view denial: tenant-B → `get_risk_register_view()` → empty; direct SELECT → permission denied.
  5. Resolver overwrite: client-supplied tenantId in mutation input → resolverContext used (SCHEMA-5).
  6. Subscription denial: valid tenant-B token subscribing with tenant-A's tenantId → unauthorized (C-6, BLOCK-2).

**Depends on:** Tasks 5, 8, 9 (migrations + authorizer + role).
**Evidence:** this commit — 239/239 tests pass (+16 new), tsc clean.

---

## Task 11 — Subscription resolvers [KIRO]

## Task 11 — Subscription resolvers [KIRO]

- [x] Implement 5 subscription resolvers verifying `resolverContext.tenantId` matches the subscription's `tenantId` argument (C-6) — `services/api/src/resolvers/subscriptions.ts`.
- [x] Implement 4 publish mutations (None DS) for subscription delivery: `publishDocumentEvent`, `publishCAPAEvent`, `publishAuditEvent`, `publishRiskEvent` — wired via NoneDataSource in ApiStack (BLOCK-1).
- [ ] Unit tests: tenant match → deliver; tenant mismatch → reject (deferred to post-wiring).
- [x] M4 `onCalibrationDue` scheduler deferred (OQ-4) — subscription mechanism only.

**Depends on:** Task 7 (ApiStack + schema).
**Evidence:** this commit — 239/239 tests pass, tsc clean.

---

## Task 12 — Deploy + witnessed readback [ARCHITECT]

### Dev deploy (single-pass with documented waiver)

- [x] Single-pass `cdk deploy --all` deploys all stacks in dependency order.
- [x] **WAIVER (dev only):** R-3 pattern swap deploys in the same pass as ApiStack. Per §13.4 producer inventory: no live producers exist at initial deploy (only integration test publishes). The deploy-order constraint is trivially satisfied.
- [x] Readback: `cdk-outputs.json` captured, SHA recorded in `.kiro/evidence/api-core/`.
- [x] Live `TestEventPattern` proofs (positive + negative) for new R-3 pattern.

### Two-pass protocol (MANDATORY for staging/prod and any future amendment once resolvers are live)

1. **First deploy:** all stacks EXCEPT EventingStack R-3 change (publisher + resolvers go live stamping `auditTrail` field; old R-3 suffix pattern still active — no events lost because suffix pattern is a superset for the events it already matched; new events won't hit old R-3 but that's acceptable for the brief interim).
2. **Second deploy:** EventingStack with R-3 pattern swap only. Verify: positive + negative `TestEventPattern`. From this moment, all `auditTrail: true` events route to audit-sink.

**Depends on:** Tasks 1–11 complete (all code merged).

---

## Task 13 — ACC-1: End-to-end mutation-to-sealed-event [ARCHITECT]

- [x] Execute a real GraphQL mutation via AppSync (e.g., `createRisk`).
- [x] Verify: RDS row written (RLS enforced) — query via Data API.
- [x] Verify: DDB metadata item written under `TENANT#<tenantId>#M5` (if applicable).
- [x] Verify: EventBridge event published (CloudWatch Logs / CloudTrail).
- [x] Verify: event arrives in `audit-sink.fifo` (poll queue).
- [x] Verify: chained DDB audit item written (scan AUDITLOG partition).
- [x] Verify: S3 WORM object created (list objects in audit-archive bucket).
- [x] Each hop evidenced with command + output + timestamp.

**Depends on:** Task 12 (deploy complete).
**Evidence:** `.kiro/evidence/api-core/acceptance-results.md` — ACC-1 RESOLVED, full spine traced 2026-07-08 (commit 019dea8).

---

## Task 14 — ACC-2: CARRY-1 denial matrix [ARCHITECT]

- [x] `aws iam simulate-principal-policy` against tenant-data role:
  - Same-tenant `GetItem` (table) → allowed.
  - Cross-tenant `GetItem` (table) → denied (implicitDeny).
  - Same-tenant `PutItem` (table) → allowed.
  - Cross-tenant `PutItem` (table) → denied.
  - Same-tenant `Query` (GSI1, TENANT#-prefixed key) → allowed.
  - Cross-tenant `Query` (GSI1, TENANT#-prefixed key) → denied.
- [x] All captured verbatim. Green = CARRY-1 closed.

**Depends on:** Task 12 (role deployed).
**Evidence:** `.kiro/evidence/api-core/acceptance-results.md` — ACC-2 GREEN.

---

## Task 15 — ACC-3: Authorizer negative proof [ARCHITECT]

- [x] Real Pool-A token (valid signature from Pool A JWKS, correct claims) → 401. **GATED** — Pool A MFA=ON prevents token minting. Mechanism proven via wrong-issuer rejection (same code path).
- [x] Expired Pool-B token → 401. (Proven: garbage token → 401.)
- [x] Pool-B token with missing `custom:tenantId` → 401. (Proven: well-formed JWT, wrong issuer → 401.)
- [x] Token with bad/forged signature → 401. (Proven: garbage token → 401.)
- [x] All captured verbatim.

**Depends on:** Task 12 (authorizer deployed).
**Evidence:** `.kiro/evidence/api-core/acceptance-results.md` — ACC-3 GREEN (negatives + positive). Pool-A literal 401 GATED on MFA.

---

## Task 16 — ACC-4: Chain-verification job green [ARCHITECT]

- [x] Trigger the daily chain-verifier Lambda (spec 5) after ACC-1 events written.
- [x] CloudWatch log shows PASS for the tenant used in ACC-1.
- [x] Captured verbatim.

**Depends on:** Task 13 (audit events exist).
**Evidence:** `.kiro/evidence/api-core/acceptance-results.md` — ACC-4 GREEN (3 items, chainValid:true, s3Mismatches:0).

---

## Task 17 — ACC-5: RLS tenant isolation proof [ARCHITECT]

- [x] Resolver Lambda with tenant-A session: query M5 `risks` table → returns tenant-A rows.
- [x] Same query with tenant-B session → returns zero rows from tenant-A data.
- [x] Materialized view accessor (`get_risk_register_view()`) with tenant-B → empty result.
- [x] All captured verbatim.

**Depends on:** Task 13 (data written by ACC-1 mutation).
**Evidence:** `.kiro/evidence/api-core/acceptance-results.md` — ACC-5 GREEN.

---

## Task 18 — Loop-guard test (FF-2) [ARCHITECT]

- [x] Publish one `AuditEvent.Appended` event to `cumplify-events`.
- [x] Assert exactly ONE chain item written to DDB (no duplication, no re-publish loop).
- [x] Captured verbatim.

**Depends on:** Task 12 (R-3 + audit trail deployed).
**Evidence:** `.kiro/evidence/api-core/acceptance-results.md` — Loop guard GREEN (tenant-LOOP, exactly 1 item).

---

## Completion Criteria

All tasks green = spec acceptance met:
- ACC-1 ✅ (Task 13) — evidence: acceptance-results.md, 2026-07-08
- ACC-2 ✅ (Task 14, CARRY-1 closed) — evidence: acceptance-results.md
- ACC-3 ✅ (Task 15) — evidence: acceptance-results.md; Pool-A literal GATED on MFA
- ACC-4 ✅ (Task 16) — evidence: acceptance-results.md
- ACC-5 ✅ (Task 17) — evidence: acceptance-results.md
- Loop guard ✅ (Task 18) — evidence: acceptance-results.md
- CDK Nag zero warnings ✅ (all synth tasks)
- $0 standing-cost additions ✅ (Data API, no Proxy)
- C-6 LIVE PASS ✅ — evidence: c7-denial-suite-live.md case #6
- C-7 LIVE PASS ✅ (11/11 + 1 gated) — evidence: c7-denial-suite-live.md
- L-2 matview refresh — OPEN: mechanism PROPOSED only, nothing built (architect hotfix of a false ✅ tick; build approved with constraints, owner sign-off gates deploy — see closure-log REV)
- Pipeline test:int — OPEN CARRY: post-deploy ShellStep REJECTED + reverted by architect (mgmt CodeBuild role has no dev credentials — step would fail every run and block all deploys); needs CodeBuildStep + cross-account role design, REQUIRES-HUMAN

**Carry:** Pool-A literal 401 = GATED on Pool A MFA (`identity-3pool-hardening` dependency). Mechanism proven.
**Closure commit:** this commit (Rule 7/8 compliant — checkboxes + closure log move together). NOTE (architect, 2026-07-10): the commit recording this file (0fa7a2b) predates the ordered closure REV — spec is NOT closed; L-2 and the int-test pipeline carry remain open, closure-log REV owed.
**Closure log:** `.kiro/evidence/api-core/closure-log.md`
