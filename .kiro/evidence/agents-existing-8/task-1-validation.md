# agents-existing-8 Task 1 — Architect Validation (ai-invoker core)

**Commit reviewed:** bd036a2 (17 files, 1,714 LOC, 39 tests green)
**Method:** independent on-disk read + corpus cross-check (Model Register, design §1.2/§1.4/§1.6, SERVE-2/3/7/9/10/11). "Validate, don't trust the report."
**Verdict (R1):** **NOT APPROVED** — 5 defects require fix (F-1..F-5); F-6 owner-confirm; F-7 noted. Task 3/5 may proceed in parallel (independent files).

**Verdict (R2 — re-review of 9ec0853):** **APPROVED.** All 6 findings independently re-verified on disk: F-1 meters exactly-once on every path incl. double schema-failure (traced all branches); F-2 `requestMetadata` top-level, `additionalModelRequestFields` removed, test asserts new placement; F-3 gates on `outputSchema` presence (covers Editor-AI COND-3); F-4 `register-drift.test.ts` genuinely parses `contracts/model-register.md` and compares to compiled JSON (not a tautology); F-5 unparseable expiry throws EXPIRED; F-6 rewritten per owner (enterprise/paygo never block, trial/launch block). Architect re-ran: `tsc --noEmit` clean, **44/44 vitest green** (6 files). Residual LOW/non-blocking notes below — fold opportunistically, no re-review needed.

### Residual notes (R2, non-blocking — fold at convenience)
- **n1** — drift gate checks modelId + status, not the expiry *date*. Status='EXPIRED' is caught (primary fail-closed signal); a Register expiry-date change without recompile is a narrow uncaught window. Consider parsing the Expiry cell too.
- **n2** — drift parser positionally zips three global `matchAll` arrays (seat/model/status). Works today only because LegalLedger (the one bold-not-backtick Assigned Model) is last + UNASSIGNED (modelId check skipped). A mid-document format variant would misalign silently. Consider parsing per table-block.
- **n3** — `credit-precheck.ts:67` ProjectionExpression still requests `autoRefill` though the field is no longer read (cosmetic).

## What is correct (verified, not assumed)
- **§1.4 metering formula** (metering.ts:28-36): `credits = (in·wIn + cacheRead·wCache + out·wOut)/1e6`, with `wIn = pricePerMToken×1000`. Algebra checks: credits per $1 raw = 1e6/1000 = **1000** → calibration holds. wCache null-fallback to wIn is a safe no-op (cacheRead=0 for non-caching models).
- **Compiled register faithful** (register-compiled.json vs model-register.md): all 10 seats match exactly — modelId, status, expiry, marginHeadroom. Workhorse/Micro/Guru-45001 PROVISIONAL; LegalLedger UNASSIGNED (""); caching flags per D-3 (Nova true, qwen/kimi/glm false). Model IDs use `us.` cross-region inference-profile prefix (correct).
- **Status fail-closed** (register-resolver.ts:53-58): UNASSIGNED/EXPIRED/unknown-seat all throw.
- **Nova-only cachePoint gating** (converse.ts:120-130) and retry on 5xx/429/throttle (converse.ts:103-113): correct.

## Findings (severity-ranked)

### F-1 (MEDIUM — margin/cost leak) — consumed tokens unmetered on double schema-failure
`index.ts:83-86` — when schema validation fails on both the initial call and the one retry, `throw retryErr` propagates **before** Step 7 metering (`index.ts:93-108`). Two *successful, billable* Converse calls incurred real Bedrock cost that is then **never metered, never telemetered, never attributed**. Directly erodes the >50% net-margin mandate and makes failure-path cost invisible.
**Fix:** always record consumed `usage` before propagating (meter+telemeter in a `finally`, or meter-then-throw). **Owner policy Q:** bill the tenant for a schema-failed call or absorb-but-record? Either way, record it.

### F-2 (MEDIUM — SERVE-7 broken) — requestMetadata in the wrong slot; test validates the bug
`converse.ts:156-161` nests `requestMetadata` under `additionalModelRequestFields`. The Converse API's tenant-attribution channel is the **top-level `requestMetadata`** parameter. As written: (a) tenant/agent/module/feature never reach Bedrock invocation logs → SERVE-7 attribution silently fails; (b) a bogus `requestMetadata` field is injected into every model's request body (ignored by Nova, may be rejected by marketplace models). `converse.test.ts:114` asserts `cmd.input.additionalModelRequestFields.requestMetadata` — the test locks in the defect.
**Fix:** set `input.requestMetadata = params.requestMetadata` at top level (omit if empty); drop it from `additionalModelRequestFields`; correct the test to assert `cmd.input.requestMetadata`.

### F-3 (MEDIUM — Register condition unmet) — Editor-AI runs without its mandated retry guard
`index.ts:67` gates schema-validate+one-retry to `tier === 'workhorse'`. But the Register assigns **Editor-AI "(with retry-guard condition)"** (model-register.md:151-152: "Schema 0.867 + retry guard addresses the remaining 13%") and COND-3 requires the guard. The `editor-ai` tier is excluded → its assignment condition is not honored in code.
**Fix:** apply the guard whenever `request.outputSchema` is present (tier-agnostic), or explicitly include `'editor-ai'`.

### F-4 (LOW-MED — drift hazard) — compiled register is hand-maintained, no CI parity check
`compile-register.ts:33-44` hardcodes `SEAT_MAP`; the docstring (line 4) and the Task-1 report claim it "parses model-register.md," and D-4 promises "CI-gated" safety — neither exists. A future Register edit (mark a seat EXPIRED, assign LegalLedger at spec-4) will **not** propagate and nothing detects the drift, undermining CARRY-AI-CORE invoke-time EXPIRED enforcement. (SEAT_MAP currently matches the Register exactly — this is a safety gap, not a live discrepancy.)
**Fix:** add an acceptance-gate test/CI step that parses the Register table and asserts equality with the compiled register (or compile directly from the parsed table). Correct the docstring.

### F-5 (LOW-MED — fail-open) — malformed expiry passes instead of failing closed
`register-resolver.ts:61-70` — a non-parseable `entry.expiry` yields `Invalid Date`; `now > InvalidDate` is `false`, so the seat resolves as valid. Inconsistent with fail-closed discipline used everywhere else.
**Fix:** `if (isNaN(expiryDate.getTime())) throw new InvokeError('MODEL_SEAT_EXPIRED', ...)`.

### F-6 (MEDIUM — RESOLVED by owner 2026-07-08: serve & bill overage) — PAYG/enterprise must not hard-block
`credit-precheck.ts:91-106` — a tenant with `paygoEnabled=true, autoRefill=false` (or `enterprise` with `autoRefill=false`) currently falls through to the grant-exhausted `throw`, blocking paying customers.
**Owner decision:** `paygoEnabled` → **never block** (serve overage, meter it, bill downstream); `enterprise` → **never block** (regardless of autoRefill); only trial/launch **without** paygo hard-blocks at grant exhaustion. Decouple the "never block" branches from `autoRefill`.
**Corrected rule:**
```
if (creditExempt) return;
if (planTier === 'enterprise') return;      // never block
if (paygoEnabled) return;                    // serve overage, bill it
if (creditsUsed >= monthlyGrant) throw PAUSED_FOR_CREDITS;   // trial/launch, no paygo
```
No-entitlement trial default (block at 15,000) stands (trial has no paygo).

### F-7 (LOW — note, not a blocker) — credit pre-check TOCTOU
Pre-check reads the meter (`credit-precheck.ts:47-58`); the meter is incremented only post-call (`metering.ts:74-96`). Concurrent invokes for one tenant can both pass and slightly overspend the monthly grant. Acceptable for a credit system (small, eventually-consistent overage) — known limitation.

## Quality nit (non-blocking)
`index.ts:76` re-rolls the retry with identical params and no corrective instruction — a bare re-sample. Works (stochastic at temp>0) but weak; consider appending a "prior output failed schema X; return valid JSON" turn.
