# B3 tenant-docs indexer — deployed readback: BLOCKED (new live-only blocker)

**Date:** 2026-07-23 · **Readback:** architect · **Deploy under test:**
`58054e2` via pipeline exec `87889610` (self-mutation restart of `de3ef638`,
new pipeline assets) — **Dev stage Succeeded 12:18Z**, cross-checked by
stage `latestExecution` id.

## What the readback PROVED WORKING (all timestamps UTC, exit 0 unless noted)

| Leg | Result | Evidence |
|---|---|---|
| Deployed indexer shape | ✓ | `TenantDocsIndexerFn…vFOtZ2EZE6Kf` LastModified 12:09:53Z, VPC 2 private subnets (L1), timeout 90s, AOSS endpoint env set, SQS source **Enabled** |
| Live AOSS data-access policy | ✓ | indexer role in READ block **and** WRITE block (CreateIndex/UpdateIndex/ReadDocument/WriteDocument) of `cumplify-ai-access-dev` |
| Document lifecycle (real UI) | partial | 12:18:50Z Playwright: "Leadership and commitment (5.1)" DRAFT → **Submit for approval** (admin) → IN_REVIEW; 12:21:02Z **Approve** clicked by `acc-aaa-imslead` — **BC-11 SoD leg witnessed, first live use of the second approver** |
| Publish | ✓ via API door | UI publish unreachable (defect LC-1 below) → `publishControlledDocument(v2 1f5594ef…)` fired via SRP-authenticated GraphQL as acc-aaa-admin, 12:23:40Z → doc `79ec9736…` status APPROVED |
| Event plumbing end-to-end | ✓ | publish 12:23:40Z → indexer "Processing event" **12:23:40.511Z** (sub-second: EventBridge → R-8 rule → SQS → Lambda), detailType Document.Published, eventId `01KY7EWX3SAQFJ77F01RR6ZWRZ` |

## THE BLOCKER — B3-VPC-1: no `rds-data` VPC endpoint in the zero-NAT VPC

Attempt 1 (12:23:40→12:24:30, 49.8 s) and attempt 2 (SQS redrive) both died
as "Transient processing failure" with **zero** progress logs: no "Indexing
document sections" (logged after RDS+S3), no ai-invoker invocation, no
"AOSS write retrying". The handler's first AWS call is
`BeginTransactionCommand` → RDS Data API.

- Live VPC endpoints (12:25Z): s3(gw), dynamodb(gw), kms, bedrock-runtime,
  secretsmanager, execute-api, aoss, lambda, states, sqs — **no rds-data**.
- `network-stack.ts` interface-endpoint list: same set on disk (zero `rds`
  mentions).
- Why never seen before: **L6** — no VPC-placed Lambda has ever touched the
  DB; resolvers read context and pass it in. The indexer is the FIRST, and
  the SDK call hangs against a service with no network path (~50 s of
  connect retries) → throw → retry ×3 → DLQ (TenantDocsIndexerDlqAlarm
  firing is readback fallout, expected).

**Architect recommendation (Kiro's design call): fix per L6, not per
endpoint.** `publishControlledDocument` already SELECTs `content_ref`
(m1.ts:404) at the emission point — add it to the Document.Published
payload and DELETE the indexer's whole RDS leg (+ its rds-data/secrets
IAM). Zero new endpoints, less IAM, matches the house law. Alternative
(NOT recommended): add an rds-data interface endpoint (~$15/mo dev, more
in prod).

## Additional live-found defects (backlog, not B3 amendment scope)

- **LC-1 (m1/UI lifecycle):** `approveDocumentVersion` only INSERTs the
  approval — nothing transitions doc status to APPROVED, and the UI's
  Publish button gates on `status === 'APPROVED'` → **publish is
  unreachable through the UI** (dev survey 12:22Z: 101 docs = 99 Draft,
  2 In review, 0 Approved). Needs a design ruling: approve flips status,
  or Publish shows on IN_REVIEW-with-approvals.
- **STD-1 (m1 emitter):** the publish event hardcodes `standard:'ISO9001'`
  / `clauseRef:'ISO 9001 7.5.3'` although `meta.standard` is SELECTed and
  in scope — same class as the completeAudit hardcode already backlogged.
  Consequence is worse here: the indexer stamps `metadata.standard` from
  the event, so non-9001 docs would be mis-tagged in AOSS and
  standard-filtered retrieval misses them. Fold into the B3 amendment
  (emitter change is already in scope for contentRef).
- **OBS-1 (eventing consumer):** `consumer.ts` logs "Transient processing
  failure" WITHOUT the error message — this readback needed VPC-endpoint
  archaeology to find a cause a single log line would have named. One-line
  fix, benefits every consumer.

## State left on dev (disclosed)

- Doc `79ec9736` (Leadership and commitment 5.1) is now **published**
  (status 'approved', v2 sealed to the evidence bucket) — done via the
  real mutation on real dev data as the readback vehicle.
- 1 message headed to `TenantDocsIndexerDlq` after 3rd receive (~12:36Z);
  its DLQ alarm firing is expected readback fallout. Redrive it after the
  amendment deploys (or let the re-publish of another doc re-exercise).
- `acc-aaa-admin` + `acc-aaa-imslead` passwords session-reset per standing
  procedure (scratchpad-only, never committed).

## Verdict

Amendment `58054e2` PASSED its scope (C-2 txn, POST auto-ID, house retry —
all validated on disk + deployed). The stage remains **OPEN**: the readback
surfaced B3-VPC-1, which no unit lane could catch (the mock suite is
green while the Lambda cannot reach its first dependency). Next amendment:
contentRef (+ real standard) in the publish payload, delete the RDS leg,
then re-run this readback end-to-end (indexer success log → agent
tenant-docs retrieval returning chunks).
