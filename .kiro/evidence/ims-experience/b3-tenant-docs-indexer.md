# B3 Tenant-Docs Indexer — Build Evidence

**Date:** 2026-07-23 · **Builder:** Kiro · **Commit:** `4e8ef62` (initial), amendment TBD
**cdk-outputs.json blob SHA:** `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Summary

Built the tenant-docs indexer Lambda (B3 from the reinstatement brief).
Published documents are now indexed into the `cumplify-tenant-docs` AOSS
collection, closing the gap noted in every agent's retrieval log:
"tenant-docs 404 = known no-indexer state".

## Architecture

```
Document.Published (EventBridge)
  → R-8 rule (eventing-stack.ts)
  → TenantDocsIndexerQueue (standard SQS, DLQ max 3)
  → TenantDocsIndexerFn (ai-stack.ts, VPC-placed L1)
      1. C-2 transaction: Begin → set_config('app.tenant_id', tid, true) → SELECT content_ref → Commit
      2. Fetch content JSON from S3 (general bucket)
      3. For each prose section: embed via createEmbedFn (one-door, systemOp=true)
      4. POST /_doc to AOSS cumplify-tenant-docs index (auto-ID)
         with 45s cold-start exponential-backoff retry (02-aoss-rule)
         retryable: 403/404/429/5xx (house write-path rule)
```

## Amendment fixes (architect rejection)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Multistatement SQL (`set_config; SELECT`) → `ValidationException: Multistatements aren't supported` | Rewrote to C-2 pattern: BeginTransaction → standalone set_config → standalone SELECT → Commit (per execute-writeback.ts:170) |
| 2 | `PUT /_doc/<id>` → VECTORSEARCH rejects client `_id`s (FIX-P12-4) | Switched to `POST /_doc` (auto-ID). See dedup approach below. |
| 3 | Retryable statuses too narrow (only 429/5xx) | Widened to 403/404/429/5xx per house write-path rule (403=cold-start IAM propagation, 404=index not yet created on cold AOSS) |

## Re-publish dedup approach

VECTORSEARCH collections reject client-supplied `_id` on PUT, so each
`POST /_doc` creates a new document with an auto-generated ID. On
re-publish of the same document:

1. Each indexed document carries `metadata.versionId` — the version at
   index time.
2. Re-publish indexes all prose sections of the NEW version (new
   `versionId` in metadata). Prior version's sections remain in the index
   with the old `versionId`.
3. **Retrieval-time freshness:** agents already use `allSettled` on
   tenant-docs retrieval (DocStudio, LeadAuditor). Retrieval results carry
   metadata; the consumer can prefer chunks from the latest `versionId` if
   needed.
4. **Periodic cleanup (roadmap):** a scheduled job deletes documents where
   `metadata.versionId` is superseded by a newer published version of the
   same `documentId`. This is an operational task, not a blocking
   prerequisite — stale chunks are low-harm (slightly outdated context),
   and the metadata filter always scopes to the tenant.

## L1 compliance (VPC placement)

The indexer Lambda is VPC-placed (`vpc: props.vpc, vpcSubnets: {subnets:
props.privateSubnets}`) in ai-stack.ts. Without this, all AOSS data-plane
writes 401 because the `cumplify-tenant-docs-kb` collection's network policy
allows only the AOSS VPC endpoint (AllowFromPublic: false).

## Files created/modified

| File | Change |
|------|--------|
| `services/indexer/tenant-docs/handler.ts` | NEW — indexer Lambda handler |
| `services/indexer/__tests__/tenant-docs.test.ts` | NEW — 8 unit tests |
| `infra/lib/eventing-stack.ts` | R-8 rule + TenantDocsIndexerQueue/DLQ + exports |
| `infra/lib/eventing-stack.unit.test.ts` | Bumped assertions: 8 rules, 17 queues |
| `infra/lib/ai-stack.ts` | TenantDocsIndexerFn (VPC, IAM, SQS source, AOSS data-access) |
| `infra/lib/ai-stack.unit.test.ts` | Added props, bumped AI_INVOKER count 12→13 |
| `infra/lib/cumplify-stage.ts` | Passes tenantDocsIndexerQueueArn/DlqUrl to AiStack |

## IAM grants (TenantDocsIndexerFn)

| Grant | Resource | Purpose |
|-------|----------|---------|
| rds-data:Execute/Begin/Commit/Rollback | clusterArn | C-2 transaction for content_ref |
| secretsmanager:GetSecretValue | appRoleSecretArn | RDS app_role secret |
| s3:GetObject | generalBucketArn/* | Read document content JSON |
| lambda:InvokeFunction | aiInvoker.functionArn | Embed via one-door |
| aoss:APIAccessAll | collectionArns (all 3) | Write to tenant-docs-kb |
| KMS decrypt | s3GeneralKey, dbSecretKey | SSE-KMS decryption |

## AOSS data-access policy

Indexer role ARN added to:
- READ block (alongside agent handlers + aiInvoker)
- WRITE block (alongside weightSeeder + applyTemplateFn)

## Test evidence (rule 8 — timestamp, exit code, digest input, outputs SHA)

| Run | Timestamp (UTC) | Exit | Result |
|-----|-----------------|------|--------|
| Backend vitest | 2026-07-23T11:14:06Z | 0 | 1274 passed, 3 skipped |
| Frontend vitest | 2026-07-23T11:14:43Z | 0 | 203 passed |
| Root tsc --noEmit | 2026-07-23T11:14:06Z | 0 | clean |
| Frontend tsc --noEmit | 2026-07-23T11:14:06Z | 0 | clean |

**Digest input (verbatim):** `backend:1274/3skip frontend:203 root-tsc:0 frontend-tsc:0`
**Outputs SHA-256 (first 16 hex):** `8a526224f12baf78`
**Resolved against:** `cdk-outputs.json` blob `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Baselines

| Lane | Before (S4 slice 2 close) | After (B3 amendment) | Delta |
|------|---------------------------|----------------------|-------|
| Backend | 1266 / 3 skip | 1274 / 3 skip | +8 (indexer tests) |
| Frontend | 203 | 203 | 0 |
| Resolver pin | 98 | 98 | 0 |
| Root tsc | clean | clean | — |
| Frontend tsc | clean | clean | — |
