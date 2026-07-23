# B3 Tenant-Docs Indexer — Build Evidence

**Date:** 2026-07-23 · **Builder:** Kiro
**Commits:** `4e8ef62` (initial) → `58054e2` (amendment 1: C-2/POST/retry) → this amendment (amendment 2)
**cdk-outputs.json blob SHA:** `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Summary

Built the tenant-docs indexer Lambda (B3 from the reinstatement brief).
Published documents are now indexed into the `cumplify-tenant-docs` AOSS
collection, closing the gap noted in every agent's retrieval log:
"tenant-docs 404 = known no-indexer state".

## Architecture (final, post-amendment-2)

```
Document.Published (EventBridge, emitted by m1.ts:528)
  payload carries: { versionId, documentId, contentRef }
  → R-8 rule (eventing-stack.ts)
  → TenantDocsIndexerQueue (standard SQS, DLQ max 3)
  → TenantDocsIndexerFn (ai-stack.ts, VPC-placed L1)
      1. Read contentRef from event payload (B3-VPC-1: no RDS from zero-NAT VPC)
      2. Fetch content JSON from S3 (general bucket)
      3. For each prose section: embed via createEmbedFn (one-door, systemOp=true)
      4. POST /_doc to AOSS cumplify-tenant-docs index (auto-ID)
         with 45s cold-start exponential-backoff retry (02-aoss-rule)
         retryable: 403/404/429/5xx (house write-path rule)
```

## Amendment 2 changes

| # | Change | File:line | Why |
|---|--------|-----------|-----|
| 1a | `payload` gains `contentRef: meta.contentRef` | `services/api/src/resolvers/m1.ts:531` | Indexer in zero-NAT VPC cannot reach RDS Data API |
| 1b | `standard: meta.standard` replaces hardcoded `'ISO9001'` | `services/api/src/resolvers/m1.ts:527` | STD-1: multi-standard IMS docs need correct envelope value |
| 2a | Entire RDS leg deleted from indexer | `services/indexer/tenant-docs/handler.ts:126` reads from payload | B3-VPC-1: zero-NAT VPC has no route to RDS Data API |
| 2b | Missing/empty `contentRef` → skip with warn | `services/indexer/tenant-docs/handler.ts:136` | Old-format events drain gracefully, never crashloop |
| 2c | IAM: removed rds-data + secretsmanager + CLUSTER_ARN/APP_ROLE_SECRET_ARN env | `infra/lib/ai-stack.ts` (TenantDocsIndexerFn env block) | Lambda no longer touches RDS |
| 3 | OBS-1: transient log carries `error.slice(0,300)` + `errorName` | `services/eventing/src/consumer.ts:62-63` (std), `:160-161` (FIFO) | Would have prevented 1h VPC archaeology on readback |

### Backlog note (not fixed this slice)

`clauseRef: 'ISO 9001 7.5.3'` in the Document.Published audit event
(m1.ts:526) is hardcoded to the 9001 clause. For 14001/45001 publishes the
trail clause should map per-standard. Flagged for next slice — fixing
requires design (evidence-first rule, 14-simplicity).

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
   metadata; the consumer can prefer chunks from the latest `versionId`.
4. **Periodic cleanup (roadmap):** a scheduled job deletes documents where
   `metadata.versionId` is superseded. Stale chunks are low-harm (slightly
   outdated context) and always tenant-scoped.

## L1 compliance (VPC placement)

The indexer Lambda is VPC-placed (`vpc: props.vpc, vpcSubnets: {subnets:
props.privateSubnets}`) in ai-stack.ts. Without this, all AOSS data-plane
writes 401 because the `cumplify-tenant-docs-kb` collection's network policy
allows only the AOSS VPC endpoint (AllowFromPublic: false).

## Files modified (amendment 2)

| File | Change |
|------|--------|
| `services/api/src/resolvers/m1.ts` | Emitter: +contentRef, meta.standard |
| `services/indexer/tenant-docs/handler.ts` | Rewritten: no RDS, payload-driven |
| `services/indexer/__tests__/tenant-docs.test.ts` | Rewritten: no RDS mocks, payload fixtures |
| `infra/lib/ai-stack.ts` | Removed RDS/secrets IAM + env vars |
| `services/eventing/src/consumer.ts` | OBS-1: error.slice(0,300) + errorName |
| `services/eventing/__tests__/consumer-obs1.test.ts` | NEW: OBS-1 log assertion test |

## IAM grants (TenantDocsIndexerFn — final, post-amendment-2)

| Grant | Resource | Purpose |
|-------|----------|---------|
| s3:GetObject | generalBucketArn/* | Read document content JSON |
| lambda:InvokeFunction | aiInvoker.functionArn | Embed via one-door |
| aoss:APIAccessAll | collectionArns (all 3) | Write to tenant-docs-kb |
| KMS decrypt | s3GeneralKey | SSE-KMS decryption |

(rds-data, secretsmanager, dbSecretKey — all REMOVED in this amendment)

## Test evidence (rule 8 — timestamp, exit code, digest input, outputs SHA)

| Run | Timestamp (UTC) | Exit | Result |
|-----|-----------------|------|--------|
| Backend vitest | 2026-07-23T15:55:09Z | 0 | 1282 passed, 3 skipped |
| Frontend vitest | 2026-07-23T15:55:47Z | 0 | 203 passed |
| Root tsc --noEmit | 2026-07-23T15:55:09Z | 0 | clean |
| Frontend tsc --noEmit | 2026-07-23T15:55:09Z | 0 | clean |

**Digest input (verbatim):** `backend:1282/3skip frontend:203 root-tsc:0 frontend-tsc:0`
**Outputs SHA-256 (first 16 hex):** `478af50340894476`
**Resolved against:** `cdk-outputs.json` blob `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Baselines

| Lane | Before (amendment 1 close) | After (amendment 2) | Delta |
|------|----------------------------|---------------------|-------|
| Backend | 1274 / 3 skip | 1282 / 3 skip | +8 (rewrote 8→9 indexer, +1 OBS-1) |
| Frontend | 203 | 203 | 0 |
| Resolver pin | 98 | 98 | 0 |
| Root tsc | clean | clean | — |
| Frontend tsc | clean | clean | — |
