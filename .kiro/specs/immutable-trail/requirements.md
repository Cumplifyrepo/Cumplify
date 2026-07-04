# Immutable Audit Trail — Requirements (EARS Format)

**Spec:** `immutable-trail`
**Spine references:** C.2 (audit-event schema), E.1 (three-layer enforcement)
**Part 18.2 rows:** ES-3, ES-4, ES-5
**Source documents:**
- `.kiro/steering/04-immutability.md` — three-layer enforcement (the constitution for this spec)
- `.kiro/steering/02-aoss-rule.md` — 45-second cold-start budget
- `.kiro/steering/00-stack-facts.md` — verified stack constraints (verbatim)
- `contracts/events.md` — canonical queue-message contract `{detailType, detail}`
- `docs/architecture/cumplify-architecture.md` — Sections C.2, E.1
- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — Part 18.2

**Depends on:** Spec 1 (`platform-foundation`), Spec 2 (`eventing-backbone`)
**Revision:** R1 — initial draft for architect review

---

## 1. Constraints (from 00-stack-facts.md — verbatim, non-negotiable)

| ID | Constraint |
|----|-----------|
| C-1 | Region: us-east-1 primary. Dev account 697114252993. All resources deploy to the dev workload account; synth-time account boundary guardrail (env-config.ts) forbids mgmt — do not touch it. |
| C-2 | CDK Nag (`AwsSolutionsChecks`) warnings = build failures. Every resource must pass with zero warnings (suppressions require documented justification). |
| C-3 | TypeScript Lambdas MUST use `aws-cdk-lib/aws-lambda-nodejs` `NodejsFunction` (esbuild bundles .ts → .js). NEVER `lambda.Code.fromAsset()` on a raw .ts directory — the Node runtime cannot load TypeScript. |
| C-4 | Bundle AWS SDK v3 clients INLINE: `bundling.externalModules: []`. Set `memorySize >= 512` so cold start stays well under the consumer visibility timeout. Runtime `NODEJS_22_X`, esbuild target `node22`, architecture `ARM_64`. |
| C-5 | NO hardcoded physical resource names for Lambdas, DLQs, or new resources. CloudFormation auto-naming only, so rollbacks never collide. Resolve every name in readback from committed `cdk-outputs.json`. **Pre-existing exceptions:** `CumplifyCore` (DynamoDB table) and `cumplify-events` (EventBridge bus). |
| C-6 | Emit `CfnOutput` for everything readback needs: Lambda ARN, DLQ ARN/URL, S3 bucket name, schedule name, alarm names, stream ESM UUID. (F-9 contract.) |
| C-7 | Readback must EXERCISE behavior, not just assert resource existence: prove the end-to-end chain, prove tamper detection, prove IAM denial. Use the `requireOutput()` pattern — a missing output on a deployed env FAILS, never skips. |
| C-8 | Cold-start latency proven by direct invoke in the readback (memorySize >= 512 + inline SDK bundles). |
| C-9 | DynamoDB CumplifyCore: single table, PK/SK, on-demand, CMK (all 6 KMS actions required on Lambda exec roles). Tenant isolation: `dynamodb:LeadingKeys` + `ForAllValues:StringLike` on `aws:PrincipalTag/tenantId`. |
| C-10 | DynamoDB Streams on CumplifyCore are `NEW_AND_OLD_IMAGES` — already enabled by DataStack (spec 1). Do NOT recreate or alter the stream configuration. |
| C-11 | `enforceSSL: true` on any new SQS queue (AwsSolutions-SQS4). |
| C-12 | Any L1 escape hatch (property overrides, stream filters, IAM conditions) MUST have a template-assertion unit test proving the synthesized CloudFormation template contains the expected construct. (Spec-2 Lazy-token incident: silent no-op = the enemy.) |

---

## 2. Carry-Forward Build Constraints (from spec 2, binding)

| ID | Constraint |
|----|-----------|
| CF-1 | All Lambdas: `NodejsFunction`, `NODEJS_22_X`, `ARM_64`, `memorySize >= 512`, `bundling: { externalModules: [], target: 'node22' }`. |
| CF-2 | All new stacks join `CumplifyStage` (infra/lib/cumplify-stage.ts). |
| CF-3 | Evidence discipline (Process Incident #2): every resource identifier in evidence comes from an EXECUTED command's output, cited. Never type identifiers from imagination. |
| CF-4 | HITL flag: IAM policies and WORM sealer code are `REQUIRES-HUMAN` throughout — every such diff must be flagged for owner review before merge. The architect readback does not substitute for human review. |

---

## 3. Layer 1 — Append-Only Writes (`appendAuditEvent`)

### 3.1 Functional Requirements

| ID | Requirement (EARS) |
|----|-------------------|
| L1-1 | **When** a consumer Lambda receives a message from the `audit-sink` FIFO queue, **the system shall** call `appendAuditEvent` with the event data extracted from the canonical `{detailType, detail}` message body. |
| L1-2 | **The `appendAuditEvent` library function shall** write to the EXISTING `CumplifyCore` DynamoDB table using `PutItem` with condition `attribute_not_exists(pk)`, making overwrites impossible at the API level. |
| L1-3 | **The system shall** use the following item schema for every audit event:<br>PK = `TENANT#<tenantId>#AUDITLOG`<br>SK = `EVENT#<ISO8601>#<ulid>`<br>Attributes: `eventType`, `actor`, `module`, `clauseRef`, `standard`, `payloadHash` (sha256 of `{before, after}`), `prevHash` (sha256 of the previous event's item — hash chain), `docVersionHash` (present when the source event carries it — ES-3 future-proofing). |
| L1-4 | **The system shall** use the envelope `eventId` (ULID) from `detail.eventId` as the `<ulid>` component of SK, so that FIFO dedup (`MessageDeduplicationId = eventId`) and `attribute_not_exists(pk)` agree — replays are idempotent end-to-end. |
| L1-5 | **When** computing `prevHash`, **the system shall** query the most recent item for the tenant's `AUDITLOG` partition (SK descending, Limit 1) and compute sha256 over its `PK + SK + payloadHash`. For the first event in a partition (no predecessor), `prevHash` shall be the string `"GENESIS"`. |
| L1-6 | **The system shall** compute `payloadHash` as `sha256(JSON.stringify({before: detail.payload.before ?? null, after: detail.payload.after ?? null}))`. If `payload.before`/`payload.after` are absent, they default to `null`. |
| L1-7 | **The `appendAuditEvent` function shall** reside in `services/audit-trail/src/appender.ts` and be exported from the `@cumplify/audit-trail` workspace package for reuse by any future consumer. |

### 3.2 Audit-Sink Consumer Lambda

| ID | Requirement (EARS) |
|----|-------------------|
| CON-1 | **The audit-sink consumer Lambda shall** be triggered by an SQS Event Source Mapping (ESM) on spec 2's deployed `audit-sink` FIFO queue. |
| CON-2 | **The consumer shall** use `services/eventing` `createHandler` (poison → DLQ contract) to parse the canonical `{detailType, detail}` body, validate ET-4 envelope fields, and invoke `appendAuditEvent`. |
| CON-3 | **When** `appendAuditEvent` throws a `ConditionalCheckFailedException` (duplicate / replay), **the consumer shall** log the replay at WARN level and treat the message as successfully processed (no retry, no DLQ). |
| CON-4 | **When** `appendAuditEvent` throws any other error (transient DynamoDB failure), **the consumer shall** report a batch item failure so SQS retries via visibility timeout. |
| CON-5 | **The consumer Lambda shall** have `timeout >= 60s`, `memorySize >= 512`, and the 6 KMS actions on the CumplifyCore CMK in its execution role. |

---

## 4. Layer 2 — IAM (No Update/Delete)

| ID | Requirement (EARS) |
|----|-------------------|
| L2-1 | **The audit-sink consumer Lambda's execution role shall** have an explicit `Deny` statement for `dynamodb:UpdateItem` and `dynamodb:DeleteItem` on CumplifyCore table items where the partition key begins with any tenant's `AUDITLOG` prefix. |
| L2-2 | **The IAM Deny shall** use a condition: `StringLike` on `dynamodb:LeadingKeys` matching `TENANT#*#AUDITLOG` — this scopes the deny to AUDITLOG items only, not other CumplifyCore item types. |
| L2-3 | **No IAM role created by this spec shall** grant `UpdateItem` or `DeleteItem` on AUDITLOG items. This includes the WORM sealer and the chain-verification Lambda roles. |
| L2-4 | **A template-assertion unit test shall** prove the synthesized CloudFormation template contains the Deny statement with the correct condition keys and actions (C-12 enforcement). |
| L2-5 | **[REQUIRES-HUMAN]** All IAM policy definitions in this spec require owner review before merge (CF-4). |

---

## 5. Layer 3 — WORM Sealing (DynamoDB Streams → S3 Object Lock)

### 5.1 WORM Sealer Lambda

| ID | Requirement (EARS) |
|----|-------------------|
| L3-1 | **The WORM sealer Lambda shall** be triggered by a DynamoDB Streams ESM on the `CumplifyCore` table stream with `FilterCriteria` scoped to AUDITLOG items ONLY: filter on `dynamodb.NewImage.PK.S` matching pattern `TENANT#*#AUDITLOG`. |
| L3-2 | **The filter criteria shall** ensure the sealer processes ONLY audit-log items from the stream — the CumplifyCore stream carries EVERY table change (metadata, sessions, counters, etc.). An unfiltered sealer would process the entire table's write traffic. |
| L3-3 | **A template-assertion unit test shall** prove the synthesized CloudFormation template contains the `FilterCriteria` on the ESM (C-12). |
| L3-4 | **When** the sealer receives a stream record with `eventName = INSERT` for an AUDITLOG item, **it shall** serialize the full `NewImage` to JSON and write it to S3 with Object Lock COMPLIANCE retention using `PutObject` with `ObjectLockMode: COMPLIANCE` and `ObjectLockRetainUntilDate` set per `envConfig`. |
| L3-5 | **The S3 object key shall** follow the pattern: `audit-trail/<tenantId>/<YYYY>/<MM>/<DD>/<eventId>.json` — enabling per-tenant, per-day prefix listing for verification and export. |
| L3-6 | **The sealer shall** use `BisectBatchOnFunctionError: true` on the ESM so that a single poison record does not block the entire shard. |
| L3-7 | **The sealer ESM shall** have a `DestinationConfig.OnFailure` pointing to a dedicated DLQ (standard SQS, `enforceSSL: true`). This is mandatory: DynamoDB Streams records expire at 24 hours — an unmonitored failure means permanent data loss. |
| L3-8 | **A CloudWatch alarm shall** monitor the sealer DLQ (`ApproximateNumberOfMessagesVisible >= 1`, period 5m, evaluationPeriods 1). Any message in this DLQ is a critical incident — sealed records are at risk of 24h stream expiry. |
| L3-9 | **The sealer Lambda shall** have `timeout >= 60s`, `memorySize >= 512`, the 6 KMS actions on the CumplifyCore CMK (to decrypt stream records), and `s3:PutObject` + `s3:PutObjectRetention` on the target bucket. |
| L3-10 | **[REQUIRES-HUMAN]** The WORM sealer code and its IAM policy require owner review before merge (CF-4). |

### 5.2 S3 Target Bucket Decision

| ID | Requirement (EARS) |
|----|-------------------|
| L3-11 | **The WORM sealer shall** write to a DEDICATED `audit-archive` S3 bucket (not the existing EvidenceVault). |
| L3-12 | **The `audit-archive` bucket shall** have: Object Lock enabled, default retention mode COMPLIANCE, versioning enabled, `enforceSSL: true`, `blockPublicAccess: BLOCK_ALL`, CMK encryption (s3-general key from SecurityStack), server access logging, `removalPolicy: RETAIN`, `eventBridgeEnabled: true`. |
| L3-13 | **The Object Lock default retention period shall** be configurable via `envConfig`: dev/staging use a shorter period (e.g., 1 day) for testability; prod uses 2555 days (7 years). Sealed objects are physically undeletable until retention expiry regardless of environment. |

> **Open Question OQ-1 (RESOLVED — architect decision: dedicated bucket):**
> Reuse EvidenceVault vs. dedicated audit-archive bucket?
>
> **Analysis:** The EvidenceVault already has Object Lock COMPLIANCE with 2555-day retention.
> However: (a) the audit trail has distinct lifecycle/retention needs per environment —
> dev cannot have 2555-day retention on test data; (b) independent bucket = independent
> IAM boundary (sealer role needs write-only to audit-archive, never to EvidenceVault);
> (c) separate retention policies allow future regulatory tuning without cross-contamination;
> (d) blast radius: a misconfigured lifecycle rule on EvidenceVault cannot affect audit records.
>
> **Decision:** Dedicated `audit-archive` bucket. Shorter dev retention enables cleanup
> of test sealed objects after retention expiry (objects remain locked until then, but
> lifecycle can expire them after). Prod 2555d matches EvidenceVault.

---

## 6. Chain Verification (Detective Control — Layer 3 complement)

| ID | Requirement (EARS) |
|----|-------------------|
| VER-1 | **A daily EventBridge schedule shall** invoke a chain-verification Lambda at a fixed time (e.g., 02:00 UTC). |
| VER-2 | **The verification Lambda shall** iterate over all tenants with AUDITLOG partitions in CumplifyCore and, for each tenant, walk the hash chain from genesis to the most recent event, recomputing each `prevHash` and comparing against the stored value. |
| VER-3 | **When** any hash mismatch is detected (chain break), **the verification Lambda shall** emit a CloudWatch custom metric `AuditChainBroken` (dimension: tenantId) with value 1, and log the broken link (eventId, expected hash, actual hash) at ERROR level. |
| VER-4 | **A CloudWatch alarm shall** trigger on `AuditChainBroken` metric (`Sum >= 1`, period 5m, evaluationPeriods 1). |
| VER-5 | **The verification Lambda shall** also compare each chained DynamoDB item against its sealed S3 counterpart (same `eventId` → same object key). Any mismatch (missing S3 object, content divergence) is logged at ERROR level and contributes to the `AuditChainBroken` metric. |
| VER-6 | **The verification Lambda shall** have read-only access to CumplifyCore (Query on AUDITLOG partitions) and read-only access to the `audit-archive` bucket (`s3:GetObject`). It shall NOT have write access to either. |
| VER-7 | **The verification Lambda shall** have `timeout >= 900s` (15 minutes) to accommodate large tenants. If a single invocation cannot complete all tenants, it shall process tenants in paginated batches and record progress, resuming on next invocation. |
| VER-8 | **A manual invoke of the verification Lambda shall** succeed (exit 0) on an untampered chain. This is acceptance criterion (4). |

---

## 7. Audit-Trail Retrieval (AOSS)

| ID | Requirement (EARS) |
|----|-------------------|
| RET-1 | **The audit-trail retrieval Lambda shall** query the AOSS `audit-trail-retrieval` index to service investigation/search requests over the immutable audit log. |
| RET-2 | **The retrieval Lambda shall** implement the 45-second cold-start budget with exponential backoff retry (base 500ms, factor 2, jitter, ceiling 45s) per `02-aoss-rule.md`. An unwrapped AOSS call is a blocking defect. |
| RET-3 | **The retrieval Lambda shall** have `timeout >= 60s` (per 02-aoss-rule.md: any Lambda touching AOSS ≥ 60s). |
| RET-4 | **The retrieval Lambda shall** be VPC-attached — AOSS is endpoint-only; AZs already pinned in `envConfig.availabilityZones`. |
| RET-5 | **The retrieval Lambda shall** accept a tenant-scoped query (tenantId required) and enforce tenant isolation by filtering on the tenantId dimension in the AOSS index. |
| RET-6 | **The retrieval Lambda shall** NOT write to the audit trail or publish events to the bus. It is read-only. |

---

## 8. Loop Prevention (CRITICAL — architect-mandated)

| ID | Requirement (EARS) |
|----|-------------------|
| LOOP-1 | **The audit-sink consumer Lambda, the WORM sealer Lambda, the chain-verification Lambda, and the audit-trail retrieval Lambda shall** NEVER publish events to the `cumplify-events` EventBridge bus. |
| LOOP-2 | **Rationale / scenario:** `AuditEvent.Appended` is matched by spec 2's audit-sink rule (R-3). If the appender published `AuditEvent.Appended` after writing, R-3 would route it back to the audit-sink queue → the consumer would call `appendAuditEvent` again → which would write another event → which would trigger another `AuditEvent.Appended` → infinite loop. The hash chain would grow unboundedly and the FIFO queue would saturate. |
| LOOP-3 | **Enforcement:** No Lambda in this spec's CDK construct shall be granted `events:PutEvents` on any bus. A template-assertion unit test shall prove the absence of any `events:PutEvents` grant in the synthesized template. |
| LOOP-4 | **The DynamoDB Streams sealer DOES NOT create a loop** because it reacts to the DynamoDB stream (internal AWS plumbing), not to EventBridge. It writes to S3, which does not feed back into the audit-sink queue. This path is safe and requires no loop guard. |

---

## 9. Non-Functional Requirements

| ID | Requirement (EARS) |
|----|-------------------|
| NFR-1 | **The audit-sink consumer shall** process messages within the FIFO queue's visibility timeout (360s per spec 2 design). Single-message processing latency target: < 5s p99 (DynamoDB PutItem + prevHash query). |
| NFR-2 | **The WORM sealer shall** process stream records within the 24-hour stream retention window. Under normal operation, sealing latency from DynamoDB write to S3 object creation target: < 60s p99. |
| NFR-3 | **The chain-verification job shall** complete a full verification pass for up to 100 tenants with up to 10,000 events each within the 15-minute Lambda timeout. Tenants exceeding this budget are processed across multiple invocations. |
| NFR-4 | **All Lambdas in this spec shall** emit structured logs via `@aws-lambda-powertools/logger` with `serviceName`, `tenantId`, and `eventId` in every log entry. |
| NFR-5 | **The `audit-archive` bucket's Object Lock retention shall** make sealed objects physically undeletable (even by root/admin) until retention expiry — satisfying ES-4's "protected from alteration including by admins" requirement. |

---

## 10. Out of Scope

| Item | Reason |
|------|--------|
| Signature workflows (ES-3 signature events) | Come with document/HITL specs — but the schema carries `docVersionHash` now (L1-3) to future-proof. |
| Audit-trail export bundles (ES-5 UI path) | Later spec — retrieval Lambda provides the data layer. |
| AppSync/API surface for `appendAuditEvent` | No API layer exists yet — library + queue consumer only. |
| Consumer logic for any other queue | Each domain consumer is its own spec. |
| Marketplace events | Separate concern. |
| AOSS index creation/mapping | Managed by the knowledge-base spec (spec 4). This spec consumes the index. |

---

## 11. Acceptance Criteria (Template F — architect-witnessed in dev)

| # | Criterion | Evidence method |
|---|-----------|----------------|
| ACC-1 | **TAMPER DETECTED:** Architect modifies a chained item of a synthetic tenant using out-of-band admin credentials (direct `UpdateItem` bypassing app IAM) → the verification job flags the chain break (`AuditChainBroken` metric = 1, log entry with broken link details). | Manual invoke of verifier after tampering; CloudWatch metric query + log filter. |
| ACC-2 | **IAM DENIED:** `UpdateItem` on an AUDITLOG item under the audit-sink consumer's writer role returns `AccessDeniedException`. Error captured verbatim in readback evidence. | AWS CLI `aws dynamodb update-item` using the consumer role's credentials (assumed via role ARN from cdk-outputs). |
| ACC-3 | **END-TO-END:** A synthetic event published to `cumplify-events` → audit-sink FIFO queue (via R-3) → appender writes chained CumplifyCore item → WORM sealer writes S3 object with Object Lock COMPLIANCE retention. Each hop evidenced: (a) eventId in queue, (b) DynamoDB item with matching PK/SK and valid hash chain, (c) S3 object with `ObjectLockMode: COMPLIANCE` and `ObjectLockRetainUntilDate` confirmed via `HeadObject`. | Publish event via SDK → poll DynamoDB → poll S3; all identifiers from executed commands. |
| ACC-4 | **VERIFICATION GREEN:** The daily verification schedule exists (`DescribeSchedule`) and a manual invoke of the verifier runs green (exit 0, no `AuditChainBroken` emission) on an untampered synthetic tenant chain. | `events:DescribeSchedule` + Lambda `Invoke` + CloudWatch metric absence check. |

---

## 12. D-Rung / Closure

- **Infra floor:** D3 (deployed to dev + readback green).
- **Template F** applies: all acceptance criteria witnessed by architect in dev.
- **Rule 7:** Checkbox edits in closure commits only.
- **Rule 8:** Timestamp + exit code + `cdk-outputs.json` blob SHA in evidence.
- **Executed evidence only** (CF-3): no imagined identifiers.

---

## 13. Dependency Map

```
Spec 1 (platform-foundation)
  └─ DataStack: CumplifyCore table (PK/SK, streams NEW_AND_OLD_IMAGES)
  └─ DataStack: SecurityOutputs (CMKs)
  └─ NetworkStack: VPC, AOSS VPC endpoint, pinned AZs

Spec 2 (eventing-backbone)
  └─ EventingStack: cumplify-events bus
  └─ EventingStack: audit-sink FIFO queue (R-3 routes to it)
  └─ EventingStack: audit-sink-dlq FIFO (paired DLQ)
  └─ services/eventing: createHandler, types (QueueMessage, CumplifyEvent)

This spec (immutable-trail)
  └─ AuditTrailStack (new): consumer Lambda, sealer Lambda, verifier Lambda,
     retrieval Lambda, audit-archive bucket, DLQs, alarms, schedule
  └─ services/audit-trail (new): appendAuditEvent library, types
```
