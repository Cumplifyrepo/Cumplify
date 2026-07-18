# Phase 1+2 Wave Validation — iso-kb-seeding (Tasks 1–6)

> **Validator:** Architect (Claude) — independent on-disk + re-executed verification
> **Date:** 2026-07-18 (UTC)
> **Wave commits:** 33ad786 (T1), 8bfc3a9 (T2), 2e032a9 (T3), 004ce69 (T4), 4300411 (T5), 3252a4e (T6)
> **Verdict:** ACCEPTED WITH FIX ORDER — two M-severity fixes (FIX-P12-1, FIX-P12-2)
> MUST land before push/deploy. **develop is intentionally HELD unpushed** — pushing
> triggers the pipeline auto-deploy, and F-2 makes the first live seed near-certain to
> fail the custom resource and roll back the Dev AiStack.

---

## Re-executed evidence (architect's own runs, not Kiro's report)

| Check | Result |
|-------|--------|
| Backend suite (`npx vitest run`) | 1066 passed / 3 skipped (100 files), exit 0 — matches claim |
| Frontend suite (via `npm run test` second leg) | 121 passed (17 files), exit 0 |
| `tsc --noEmit` | exit 0 |
| `cdk synth --all` | exit 0 (synth.log) |
| Rule 7/8 shape | all 6 commits carry tick + task-N.log + code together — verified via `git show --stat` |
| Push state | origin/develop = 9c44836; wave is LOCAL-ONLY (pipeline untriggered) — correct, deploy is Task 7 architect lane |

Per-file review executed on: chunker.ts, content-hash usage, meta-doc.ts, bulk-index.ts,
handler.ts, md.d.ts + vitest.config.ts plugin, embed.ts/metering.ts diffs (T2),
aoss-index-template.json + aoss-apply-template.ts diffs (T1), ai-stack.ts seeder
section (T5), guru-9001 handler diff (T6, representative of trio).

Verified correct: D-1 (build-time `.md` inline, no runtime fs anywhere in seeder),
D-2 (`__META__` + no embedding field, unit-asserted), D-4 (additive access policy),
T-1 (bare specifier both toolchains, no `?raw`), R-3 (provider timeout 10 min ≥ 300 s
seeder), systemOp threading end-to-end (EmbedRequest → `checkCreditBalance(tenantId,
systemOp)` SERVE-9 → telemetry Detail `systemOp` field — exactly the ratified Task 13
mechanism), guru trio passes ISO_CANON_TENANT_ID to retrieve() while user tenantId
still flows to invokeFn metering, seeder trigger fingerprint-keyed physicalResourceId
(ACC-4 mechanism), trigger dependency on applyTemplateTrigger.

---

## F-1 (M) — Chunker silently drops 3 ISO 45001 sub-clauses; golden count 106 is WRONG (true count 109)

Kiro re-pinned `EXPECTED_CHUNK_COUNT` from 79 → 106 in T3 with the log note "actual
count from the source". Architect independently re-derived the count from the raw
markdown with the design §2.1 rules (python, separate implementation): 50 + 26 + 29 + 1
= 106 — the re-pin matched the chunker. BUT a shared-blind-spot scan (all bold
clause-numbered lines matching NEITHER chunker pattern) found source lines 317–319:

```
  - **6.1.2.1 Hazard identification** — (b) …
  - **6.1.2.2 Assessment of OH&S risks and other risks** — (b) …
  - **6.1.2.3 Assessment of OH&S opportunities and other opportunities** — (b) …
```

These are INDENTED inline bullets (children of the 6.1.2 parent, line 316). Pattern 1
in chunker.ts anchors `^- \*\*` at column 0 → all three are silently skipped. These are
hazard identification and OH&S risk/opportunity assessment — core ISO 45001 content;
the KB would answer honest-miss on some of the most-asked 45001 questions. The 79→106
re-pin was legitimate in direction (79 was the architect's pre-implementation estimate,
now proven wrong) but 106 baked this bug into the golden test.

**FIX-P12-1:**
1. chunker.ts Pattern 1: allow leading whitespace — `/^\s*- \*\*(\d+(?:\.\d+)+)\s+(.+?)\*\*\s*—\s*\(b\)\s*(.+)/`.
   (Blind-spot scan confirms lines 317–319 are the ONLY orphaned content-bearing
   entries; parent 316 remains a correct parent-skip; 407–409 live inside the HLS chunk.)
2. Re-pin `EXPECTED_CHUNK_COUNT = 109`; expected distribution ISO9001=50, ISO14001=26,
   ISO45001=32, HLS=1. Update handler.unit.test.ts hardcoded 106.
3. Add a unit test pinning that chunk clauseRefs INCLUDE 'ISO 45001 6.1.2.1/2/3'
   (regression guard for the indent class).
4. Doc-code alignment in the SAME commit: design.md (§2.1 constant line 123 + §testing
   table line 607: 79 → 109 with a rev note) and tasks.md (Task 1 text 79 → 109).
   The current tree has design/tasks saying 79 while code says 106 — never leave the
   approved design contradicting the code.

## F-2 (M) — Design §5 retry strategy NOT implemented; first live seed will fail and roll back the Dev deploy

Design §5 (02-aoss-rule compliance) mandates ALL seeder AOSS operations run under
`withRetry` (base 250 ms ×2 exp, 20% jitter, 45 s ceiling, max 12 attempts; retryable
403 policy-propagation / 404 index-activation / 429 / 5xx). Implementation: NONE of it
exists. `signedAossFetch` has no built-in retry (verified by grep); bulk-index.ts,
meta-doc.ts and handler.ts call it bare.

Live consequence chain on FIRST deploy (the exact aoss-apply-template lesson the
design cites): IsoKbSeederAccessPolicy is created in the SAME stack update → AOSS
data-access policy propagation takes ~30–60 s → seeder's first AOSS call 403s →
handler throws → AwsCustomResource FAILS → CloudFormation rolls back Dev-AiStack.
Even past the 403: `createIndex` returns 200 but a fresh AOSS index is not immediately
addressable → first chunk PUT 404s → same rollback. Unit lane cannot catch this
(mocks don't model propagation/activation). Additionally the seeder trigger has NO
node dependency on either access policy (only on applyTemplateTrigger) — CFN may
invoke the seeder before its permissions exist at all.

**FIX-P12-2:**
1. Implement `withRetry` in the seeder per design §5 (mirror the proven
   aoss-apply-template.ts pattern) and wrap: readMetaHash GET, deleteIndex, createIndex,
   every chunk PUT, and writeMetaDoc PUT. Retryable: 403, 404, 429, 5xx + transport
   errors. NOTE: deleteIndexIfExists must treat 404 as SUCCESS (absent), not retry it;
   readMetaHash must treat 404 as absent → null. Retry-404 applies to the write path
   after createIndex (activation) — implement per-operation retryable sets, not one
   blanket set.
2. ai-stack.ts: `isoKbSeederTrigger.node.addDependency(<IsoKbSeederAccessPolicy>)`
   and on the main AiAossDataAccessPolicy (seeder role is in its write block too) —
   the policies must EXIST before the seeder is invoked; withRetry then absorbs
   propagation delay.
3. Unit tests: transient 403-then-200 sequence succeeds; per-operation 404 semantics
   (delete/meta-read treat as absent; indexing retries).

## Observations (no fix ordered)

- O-1: readMetaHash catches ALL errors → null → full re-seed instead of skip on a
  transient failure. Benign (idempotent full seed, pennies of embed cost) — but F-2's
  retry wrapper reduces the frequency.
- O-2: seeder role appears in BOTH the main data-access policy write block and the
  separate IsoKbSeederAccessPolicy — redundant but harmless under additive unions (D-4).
- O-3: handler ignores `event.action` — CR only ever sends 'seed'; acceptable.
- O-4: serial embedAllChunks ≈ 109 × ~250 ms ≈ 30 s — comfortably inside the 300 s
  timeout; no change needed.
- O-5: Kiro's report footer said "Task 13 awaits owner ratification" — stale; Task 13
  CLOSED at 9c44836 (owner ratified). No action.

## Gate

Tasks 1–6 ticks STAND (unit-lane evidence is genuine). FIX-P12-1 + FIX-P12-2 are
pre-deploy blockers gating Task 7. Architect holds the push until both land; the
combined push then triggers the pipeline as the Task 7 deploy.

---

## FIX validation (2026-07-18 UTC) — BOTH ACCEPTED, gate LIFTED

**FIX-P12-1 (c1045a5):** regex now `/^\s*- \*\*…/` (verified no new false matches —
orphan scan had already established lines 317–319 are the only content-bearing
indented entries); EXPECTED_CHUNK_COUNT=109; regression tests assert
ISO 45001 6.1.2.1/2/3 present + per-standard distribution 50/26/32/1; design.md
aligned in all four spots (constant, _meta example, §4.2 window estimate, testing
table) + tasks.md Task 1 text; handler.unit.test.ts 106→109.

**FIX-P12-2 (e247f15):** new aoss-retry.ts (base 500 ms ×2, ceiling 45 s, 12 attempts,
20% jitter — base differs from design §5's 250 ms; immaterial, noted); per-op
predicates exact (write: 403/404/429/5xx; read/delete: 200/404=success,
403/429/5xx retry); transport errors always retried; ALL call sites converted
(bulkIndex per-chunk PUT, createIndex, deleteIndexIfExists, readMetaHash,
writeMetaDoc); ai-stack.ts trigger now depends on BOTH IsoKbSeederAccessPolicy and
AiAossDataAccessPolicy; 14 retry tests reviewed (403→200, 404 activation, 429, 5xx,
non-retryable 400 break, transport errors, read/delete 404-as-success).

**Architect re-execution:** vitest 1080 passed / 3 skipped exit 0; tsc --noEmit
exit 0; cdk synth --all exit 0 (fixsuite.log). Push proceeds as the Task 7 deploy.
