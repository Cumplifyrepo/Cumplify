# agents-existing-8 Tasks 5 & 6 — Architect Validation

**Commits:** fe7bef1 (Task 5 AOSS retrieval), 78e1414 (Task 6 tool-loop + HITL)
**Method:** on-disk read + corpus cross-check (REQ-RET-1/2/3, design §2.5/§3/§4, D-2, T-1 correction, Titan 1024-dim). Architect re-ran vitest.
**Verdict:** **APPROVED** — all critical invariants correctly implemented. Residual notes are LOW/deferrable + two carries to the Task-4 IAM review. Proceed to Task 3.

## What is correct (verified, not assumed)
- **Tenant filter is IN the query** (retrieval.ts:162-189): `filter: { term: { 'metadata.tenantId': tenantId } }` inside the kNN clause — not merely a presence check. `retrieve()` also throws `TenantFilterMissingError` on empty tenantId (line 83). No unfiltered query path exists.
- **Titan Embed v2 = 1024 dims** (retrieval.ts:10,31; skeleton uses `Array(1024)`) — corpus-corrected value; the aws-bedrock skill's 1536 is stale (already flagged in corpus).
- **Backoff 45s ceiling** (retrieval.ts:95-112): base 500 × 2^n, jitter, `min(delay, ceiling-elapsed)`, `AossColdStartTimeoutError` on exhaustion.
- **HITL gate pauses before any write** (tool-loop.ts:106-126): a tool in `hitlTools` enters `enterHitlGate()` and RETURNS — the write is never executed inline; it flows through SFN → approval → ExecuteWriteback.
- **GSI PK = `TENANT#<tenantId>#HITL_PENDING`** (hitl.ts:83) — D-2 tenant-isolated, LeadingKeys-compatible; base item `PK=TENANT#<t>#HITL / SK=PENDING#<ulid>`.
- **Sparse-GSI resolve** (hitl.ts:128-130): `REMOVE gsiHitlPendingPk, gsiHitlPendingSk` + 30-day TTL — resolved items drop out of the pending query.
- **Loop guard** (tool-loop.ts:67,149): MAX_TURNS=10 → `LoopGuardError`; each turn metered inside invoke() (bounded, no leak).
- **Cross-tenant isolation test** (cross-tenant-isolation.test.ts): real bidirectional negative proof, identical query vector across tenants, `skipIf(!LIVE_AOSS_ENDPOINT)`, deferred to Task 12 (architect-executed). Verified present, not hollow.
- **Architect re-ran:** `vitest services/agents` → **15 pass + 3 skipped** (live-AOSS trio).

## Findings (all non-blocking; two are carries to Task 4)

### R6-F1 (LOW-MED) — inert HITL safety field
`tool-loop.ts:39` defines `ToolDispatchResult.requiresHitl?`, but the loop decides HITL solely from the static `hitlTools` Set *before* dispatch (line 106) and never consults `result.requiresHitl` *after* dispatch (line 129-137). A tool that can only know at runtime that it needs approval cannot trigger the gate, and the field's existence implies a safety net that isn't wired. **Fix:** either honor it (a directly-dispatched tool returning `requiresHitl=true` must route to the gate and discard its output) or remove the field. Primary gate (static set) + Task-4 read-only IAM still hold — not a live leak.

### R6-CARRY → Task 4 IAM review — direct-dispatch safety depends on read-only roles
The tool-loop dispatches non-HITL tools directly (tool-loop.ts:129). This is safe **only if** every mutating tool is in `hitlTools` AND the agent handler execution role physically cannot write. **Task-4 review must assert:** agent handler roles have NO RDS write and NO `dynamodb:PutItem/UpdateItem` on domain tables (the T-1 correction) — so a tool mistakenly omitted from `hitlTools` cannot bypass HITL. This is the IAM backstop the T-1 correction promised.

### R5-CARRY → Task 3/12 — term-filter isolation requires keyword mapping
The `term` filter isolates correctly **only if** the AOSS index maps `metadata.tenantId` as a `keyword` (non-analyzed) field. Carry to Task 3 (index/mapping setup) and prove at Task 12 (the deferred bidirectional negative test is the gate).

### R6-n1 (LOW) — SFN input truncation
hitl.ts:56-57 comment says "last 5 turns"; code slices last 10 (`slice(-10)`). Also a count-based slice doesn't guarantee the 256KB SFN input limit — one large toolResult could exceed it. Fix comment; consider a byte-size guard or DDB/S3 pointer for large context.

### R6-n2 (LOW) — non-transactional gate entry
hitl.ts starts SFN (line 60) then writes DDB (line 74). A DDB failure orphans a running SFN execution (invisible to the frontend until its 7-day timeout). Consider DDB-first `STARTING` → start SFN → update with ARN, or accept the bounded orphan.

### R5-n1 (LOW) — no query-vector dimension check
`retrieve()` trusts the caller's `queryVector`; a wrong-dimension vector (≠1024) yields an opaque AOSS error. Add `if (queryVector.length !== 1024) throw` for fail-fast.

### R5-n3 (LOW) — retry ceiling vs socket timeout
The 45s backoff ceiling bounds retry *scheduling*, but the final in-flight `search` has a 50s socket timeout — total latency can exceed 45s and risk a 60s Lambda timeout. Derive the socket timeout from remaining budget, or set the Lambda timeout with margin (≥120s).
