# B2 Idempotent Finalize per harmonizationKey — Build Evidence

**Date:** 2026-07-23 · **Builder:** Kiro · **Commit:** TBD (this commit)
**cdk-outputs.json blob SHA:** `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Summary

Fixes the register duplicates issue (dev: 101 docs with 48 doubled titles
from two finalize runs). Ruling C: idempotent finalize per `harmonizationKey`.

## Root cause

`insertDocument` in `finalize-manual.ts` did a bare `INSERT INTO m1.documents`
with no conflict handling. Each generation run (state machine re-execution)
created a fresh set of documents for the same tenant, same sections — no
dedup at the document level. The existing `manual_document_id` guard only
prevented re-entry within a SINGLE run, not across runs.

## Fix

| Layer | Change | File:line |
|-------|--------|-----------|
| Schema | `harmonization_key TEXT NULL` column + partial unique index `(tenant_id, harmonization_key) WHERE harmonization_key IS NOT NULL` | `services/api/migrations/019_document_harmonization_key.sql` |
| Finalize | `insertDocument` uses `ON CONFLICT (tenant_id, harmonization_key) ... DO UPDATE SET title, clause_refs, standard, updated_at, version` | `services/qms-generation/src/finalize-manual.ts:85-93` |
| Manual | `harmonizationKey: '__MANUAL__'` | `finalize-manual.ts:270` |
| Clause docs | `harmonizationKey: section.sectionKey` | `finalize-manual.ts:308` |
| Correlation matrix | `harmonizationKey: '__CORRELATION_MATRIX__'` | `finalize-manual.ts:354` |
| Master list | `harmonizationKey: '__MASTER_LIST__'` | `finalize-manual.ts:382` |
| Backfill | Migration deduplicates existing rows (keeps latest per tenant+title+doc_type), then backfills `harmonization_key` from `clause_refs[1]` for generated docs | Migration 019 |

## Behavior

- **First finalize run:** INSERTs normally (ON CONFLICT finds no match).
- **Second+ finalize run for same tenant:** ON CONFLICT matches on
  `(tenant_id, harmonization_key)` → UPDATEs title/clause_refs/standard/
  updated_at/version. No new row created. Document ID stays stable.
- **Manually created documents:** `harmonization_key` is NULL → exempt from
  the partial unique index, no conflict possible.

## Carried backlog (not fixed in B2)

- Per-standard trail clauseRef on Document.Published (flagged B3 amendment 2)
- IMS retrieval semantics
- Stale-version AOSS cleanup job
- LC-1 (awaiting owner design ruling)

## Files modified

| File | Change |
|------|--------|
| `services/api/migrations/019_document_harmonization_key.sql` | NEW — migration |
| `services/qms-generation/src/finalize-manual.ts` | `insertDocument` ON CONFLICT + harmonizationKey params |
| `services/qms-generation/__tests__/derive-finalize.test.ts` | +1 test pinning ON CONFLICT + hk param presence |

## Test evidence (rule 8)

| Run | Timestamp (UTC) | Exit | Result |
|-----|-----------------|------|--------|
| Backend vitest | 2026-07-23T17:33:19Z | 0 | 1283 passed, 3 skipped |
| Frontend vitest | 2026-07-23T17:33:51Z | 0 | 203 passed |
| Root tsc --noEmit | 2026-07-23T17:33:19Z | 0 | clean |
| Frontend tsc --noEmit | 2026-07-23T17:33:19Z | 0 | clean |

**Digest input (verbatim):** `backend:1283/3skip frontend:203 root-tsc:0 frontend-tsc:0`
**Outputs SHA-256 (first 16 hex):** `f6566cac1b73c304`
**Resolved against:** `cdk-outputs.json` blob `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Baselines

| Lane | Before (B3 close) | After (B2) | Delta |
|------|-------------------|------------|-------|
| Backend | 1282 / 3 skip | 1283 / 3 skip | +1 (B2 idempotency test) |
| Frontend | 203 | 203 | 0 |
| Resolver pin | 98 | 98 | 0 |
| Root tsc | clean | clean | — |
| Frontend tsc | clean | clean | — |
