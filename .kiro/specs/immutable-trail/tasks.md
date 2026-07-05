# Immutable Audit Trail — Tasks

**Spec:** `immutable-trail`
**Design approved:** R2 (FIX-1..FIX-6 + minors applied)
**D-Rung floor:** D3 (deployed to dev + readback green)
**Closure rules:** 7 (checkbox edits only), 8 (timestamp + exit code + blob SHA)

---

## Task 1: services/audit-trail package scaffold + hash-chain + types

**D-Rung:** D1 (code compiles, unit tests pass)

### Deliverables
- [ ] `services/audit-trail/package.json` — `@cumplify/audit-trail` workspace package
- [ ] `services/audit-trail/tsconfig.json`
- [ ] `services/audit-trail/src/index.ts` — barrel export
- [ ] `services/audit-trail/src/types.ts` — `AuditItem`, `AppendResult`, `VerifierResult`
- [ ] `services/audit-trail/src/hash-chain.ts` — `computePrevHash`, `computePayloadHash`, `GENESIS_HASH` (REV-10: single source of truth)
- [ ] `services/audit-trail/__tests__/hash-chain.test.ts` — deterministic output, GENESIS case, round-trip verification

### Acceptance
- `npm run build` passes for the package
- Unit tests green: hash outputs are deterministic and match expected SHA-256 hex values

---

## Task 2: appendAuditEvent library (services/audit-trail/src/appender.ts)

**D-Rung:** D1 (code compiles, unit tests pass)

### Deliverables
- [ ] `services/audit-trail/src/appender.ts` — per design §7.2: TransactWriteItems (chain item + dedup marker), monotonic SK, itemType='AUDITLOG', 400KB guard, AUDITMETA on first event, ReplayDetectedError
- [ ] `services/audit-trail/__tests__/appender.test.ts` — unit tests:
  - Hash chain computation (prevHash from predecessor)
  - Monotonicity enforcement (newSK > latestSK)
  - 400KB item size guard → ItemSizeExceededError
  - Replay detection (TransactionCanceledException on dedup marker → ReplayDetectedError)
  - AUDITMETA written only when prevHash === GENESIS

### Acceptance
- Unit tests green with mocked DynamoDB client
- `ReplayDetectedError` and `ItemSizeExceededError` exported

---

## Task 3: services/eventing createFifoHandler extension

**D-Rung:** D1 (code compiles, unit tests pass)

### Deliverables
- [ ] `services/eventing/src/consumer.ts` — add `createFifoHandler` (design §7.3): FIFO batch ordering (fail-forward-all on first transient error), idempotentErrors set, FIX-3 FIFO DLQ poison send with MessageGroupId + MessageDeduplicationId
- [ ] `services/eventing/src/index.ts` — export `createFifoHandler`
- [ ] `services/eventing/__tests__/consumer.test.ts` — extended with:
  - (CON-7a) 5-message batch, #2 transient fail → batchItemFailures = [#2, #3, #4, #5]
  - (CON-7b) Poison to FIFO DLQ → SendMessage has MessageGroupId + MessageDeduplicationId
  - IdempotentError (ReplayDetectedError) → treated as success, batch continues

### Acceptance
- All existing consumer tests still pass (non-breaking extension)
- New FIFO-mode tests green

---

## Task 4: Lambda handlers (consumer, sealer, tripwire, verifier)

**D-Rung:** D1 (code compiles, unit tests pass)

### Deliverables
- [ ] `services/audit-trail/handlers/consumer.ts` — per design §7.4: createFifoHandler wrapping appendAuditEvent, idempotentErrors: ['ReplayDetectedError'], ItemSizeExceeded → PoisonMessageError
- [ ] `services/audit-trail/handlers/sealer.ts` — per design §6.1 **[REQUIRES-HUMAN]**: DynamoDB Stream → S3 PutObject with Object Lock COMPLIANCE, ChecksumAlgorithm:'SHA256' (FIX-6), itemType guard
- [ ] `services/audit-trail/handlers/tripwire.ts` — per design §7.5: MODIFY/REMOVE → AuditTamperAttempt metric, OldImage itemType guard, image digests in log
- [ ] `services/audit-trail/handlers/verifier.ts` — per design §7.6: tenant discovery via AUDITMETA, chain walk (recompute prevHash + payloadHash), incremental S3 comparison with watermark, AuditChainBroken metric on break
- [ ] `services/audit-trail/__tests__/sealer.test.ts` — S3 key format, retention calc, itemType guard, ChecksumAlgorithm present
- [ ] `services/audit-trail/__tests__/tripwire.test.ts` — metric emission, MODIFY/REMOVE handling, non-AUDITLOG skip
- [ ] `services/audit-trail/__tests__/verifier.test.ts` — chain walk correctness, watermark logic, payloadHash recomputation

### Acceptance
- All handler unit tests green with mocked AWS clients
- Sealer and tripwire guards skip non-AUDITLOG items

---

## Task 5: AuditTrailStack CDK construct + template-assertion tests

**D-Rung:** D2 (synth succeeds, CDK Nag zero warnings, template assertions pass)

### Deliverables
- [ ] `infra/lib/audit-trail-stack.ts` — per design §9: audit-archive bucket, consumer Lambda + SQS ESM, sealer Lambda + DynamoDB ESM (native FilterCriteria, FIX-5), tripwire Lambda + DynamoDB ESM, verifier Lambda, EventBridge schedule, DLQs, alarms, IAM Deny policy **[REQUIRES-HUMAN]**, CfnOutputs
- [ ] `infra/lib/audit-trail-stack.unit.test.ts` — template assertions (C-12):
  - Sealer ESM FilterCriteria exact JSON (FIX-4: itemType='AUDITLOG' on NewImage)
  - Tripwire ESM FilterCriteria exact JSON (FIX-4: itemType='AUDITLOG' on OldImage)
  - IAM Deny policy: 5 actions (FIX-2), ForAnyValue:StringLike condition
  - Absence of events:PutEvents in entire template (LOOP-3)
- [ ] `infra/lib/env-config.ts` — add `auditArchiveRetentionDays` (dev: 1, staging: 1, prod: 2555)
- [ ] `infra/lib/data-stack.ts` — add `public readonly tableStreamArn` + CfnOutput
- [ ] `infra/lib/eventing-stack.ts` — add `public readonly auditSinkQueueArn`, `auditSinkDlqUrl`, `auditSinkDlqArn`
- [ ] `infra/lib/cumplify-stage.ts` — instantiate AuditTrailStack with cross-stack props (design §2.1)

### Acceptance
- `cdk synth` produces valid CloudFormation
- CDK Nag zero warnings (suppressions documented)
- All 4 template-assertion tests pass
- EnvConfig unit test updated and passing

---

## Task 6: HITL Review Checkpoint

**D-Rung:** — (gate, not code)

> **This task gates deployment.** Owner reviews the REQUIRES-HUMAN artifacts
> before any push-to-deploy proceeds.

### Review Artifacts
- [ ] **IAM Deny policy** (design §5.1 + §5.2) — 5-action Deny on AUDITLOG items, attached to all 4 roles
- [ ] **WORM sealer handler** (design §6.1) — S3 PutObject with COMPLIANCE retention, ChecksumAlgorithm:'SHA256'
- [ ] **Sealer IAM permissions** (design §6.2) — s3:PutObject, s3:PutObjectRetention, KMS decrypt/encrypt

### Mechanics (ADJ-3)
- There are no PRs in this flow — commits land directly on develop.
- HITL sign-off = owner's explicit approval message, recorded verbatim in `.kiro/evidence/immutable-trail/hitl-signoff.md` together with the commit hash reviewed.
- **No push-to-deploy until that file exists.**

### Acceptance
- Owner signs off on all three artifacts (approval message recorded)
- `.kiro/evidence/immutable-trail/hitl-signoff.md` committed with approval text + commit hash
- No deploy proceeds until this task is marked complete

---

## Task 7: Deploy to dev (pipeline) + readback green

**D-Rung:** D3 (deployed to dev + readback green)

**Deploy method (ADJ-2):** Push to `develop` triggers the CDK Pipeline — that IS the deploy path. Do NOT run `cdk deploy` (debugging fallback only). Adding AuditTrailStack to CumplifyStage changes the pipeline's own definition, so expect UpdatePipeline to self-mutate and RESTART the execution under a new ID (same as spec 2's deploy — normal, not a failure). Evidence records BOTH execution IDs.

### Deliverables
- [ ] Push to `develop` → pipeline deploys AuditTrailStack to dev (account 697114252993, us-east-1)
- [ ] `cdk-outputs.json` (repo root) committed with new stack outputs
- [ ] `infra/readback/immutable-trail.test.ts` — 13-test readback suite (design §8.2 + ADJ-4):

| # | Test | ACC | Asserts |
|---|------|-----|---------|
| 1 | Audit-archive bucket exists | — | HeadBucket, Object Lock COMPLIANCE + 1-day retention |
| 2 | Consumer Lambda cold start | — | Direct Invoke completes < 60s |
| 3 | Sealer Lambda cold start | — | Direct Invoke completes < 60s |
| 4 | Tripwire Lambda cold start | — | Direct Invoke completes < 30s |
| 5 | Verifier Lambda cold start | — | Direct Invoke completes < 900s |
| 6 | Schedule exists | ACC-4 | DescribeSchedule: ENABLED, cron(0 2 * * ? *) |
| 7 | All alarms exist (3) | — | treatMissingData: notBreaching |
| 8 | END-TO-END | ACC-3 | Publish → consumer log → DDB item → S3 sealed object |
| 9 | IAM DENIED | ACC-2 | simulate-principal-policy: all 5 actions explicitDeny |
| 10 | TAMPER — tripwire | ACC-1a | UpdateItem via admin → AuditTamperAttempt metric |
| 11 | TAMPER — verifier | ACC-1b | Manual invoke → AuditChainBroken metric |
| 12 | VERIFICATION GREEN | ACC-4 | Invoke on untampered tenant → exit 0, no metric |
| 13 | REPLAY IDEMPOTENCY (ADJ-4) | FIX-1 | Direct-invoke consumer TWICE with identical SQS payload (same eventId) → second invoke logs ReplayDetectedError, CumplifyCore contains EXACTLY ONE chain item for that eventId |

### Acceptance
- All 13 readback tests PASS
- Evidence table produced per §8.3 (timestamp, exit code, cdk-outputs.json blob SHA from repo root)
- All identifiers from executed commands only (CF-3)
- Both pipeline execution IDs recorded

---

## Task 8: Closure

**D-Rung:** D3 (final)

### Deliverables
- [ ] Evidence logs committed: `.kiro/evidence/immutable-trail/task-{n}.log` per spec-2 convention
- [ ] `cdk-outputs.json` (repo root) blob SHA recorded: `git hash-object cdk-outputs.json`
- [ ] All task checkboxes above marked complete (rule 7: checkbox edits in closure commits only)
- [ ] Timestamp + exit code of final readback run (rule 8)

### Acceptance
- Spec meets D3 floor: deployed to dev + readback green + Template F witnessed
- No open items remain

---

## Dependency Graph

```
Task 1 (hash-chain + types)
  ↓
Task 2 (appender) ← depends on Task 1
  ↓
Task 3 (createFifoHandler) — independent of Task 1/2
  ↓
Task 4 (handlers) ← depends on Tasks 1, 2, 3
  ↓
Task 5 (CDK stack) ← depends on Task 4
  ↓
Task 6 (HITL review) ← gates Task 7
  ↓
Task 7 (deploy + readback)
  ↓
Task 8 (closure)
```
