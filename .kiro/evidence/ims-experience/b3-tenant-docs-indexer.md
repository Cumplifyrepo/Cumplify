# B3 Tenant-Docs Indexer — Build Evidence

**Date:** 2026-07-23 · **Builder:** Kiro · **Base commit:** `6da6197`
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
      1. Read content_ref from RDS (Data API, app_role, RLS)
      2. Fetch content JSON from S3 (general bucket)
      3. For each prose section: embed via createEmbedFn (one-door, systemOp=true)
      4. Write to AOSS cumplify-tenant-docs index (PUT /_doc/<encoded-id>)
         with 45s cold-start exponential-backoff retry (02-aoss-rule)
```

## L1 compliance (VPC placement)

The indexer Lambda is VPC-placed (`vpc: props.vpc, vpcSubnets: {subnets:
props.privateSubnets}`) in ai-stack.ts. Without this, all AOSS data-plane
writes 401 because the `cumplify-tenant-docs-kb` collection's network policy
allows only the AOSS VPC endpoint (AllowFromPublic: false).

## Files created/modified

| File | Change |
|------|--------|
| `services/indexer/tenant-docs/handler.ts` | NEW — indexer Lambda handler |
| `services/indexer/__tests__/tenant-docs.test.ts` | NEW — 7 unit tests |
| `infra/lib/eventing-stack.ts` | R-8 rule + TenantDocsIndexerQueue/DLQ + exports |
| `infra/lib/eventing-stack.unit.test.ts` | Bumped assertions: 8 rules, 17 queues |
| `infra/lib/ai-stack.ts` | TenantDocsIndexerFn (VPC, IAM, SQS source, AOSS data-access) |
| `infra/lib/ai-stack.unit.test.ts` | Added props, bumped AI_INVOKER count 12→13 |
| `infra/lib/cumplify-stage.ts` | Passes tenantDocsIndexerQueueArn/DlqUrl to AiStack |

## IAM grants (TenantDocsIndexerFn)

| Grant | Resource | Purpose |
|-------|----------|---------|
| rds-data:Execute/Begin/Commit/Rollback | clusterArn | Read content_ref |
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
| Backend vitest | 2026-07-23T09:28:34Z | 0 | 1273 passed, 3 skipped |
| Frontend vitest | 2026-07-23T09:29:07Z | 0 | 203 passed |
| Root tsc --noEmit | 2026-07-23T09:29:42Z | 0 | clean |
| Frontend tsc --noEmit | 2026-07-23T09:29:46Z | 0 | clean |

**Digest input (verbatim):** `backend:1273/3skip frontend:203 root-tsc:0 frontend-tsc:0`
**Outputs SHA-256 (first 16 hex):** `1e12f091069b28e5`
**Resolved against:** `cdk-outputs.json` blob `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Baselines

| Lane | Before (S4 slice 2 close) | After (B3) | Delta |
|------|---------------------------|------------|-------|
| Backend | 1266 / 3 skip | 1273 / 3 skip | +7 (indexer tests) |
| Frontend | 203 | 203 | 0 |
| Resolver pin | 98 | 98 | 0 |
| Root tsc | clean | clean | — |
| Frontend tsc | clean | clean | — |
