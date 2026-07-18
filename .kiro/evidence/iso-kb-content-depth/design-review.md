# Design Review — iso-kb-content-depth

> **Reviewer:** Architect (Claude) — independent verification against repo + live evidence
> **Date:** 2026-07-18
> **Inputs:** requirements rev 2 @ 9390277 (verified faithful fold of OQ-1/2/3 + N-1..N-6),
> design.md @ e3bf23d (712 lines, read in full)
> **Verdict:** APPROVED WITH CORRECTIONS — fold D-1'..D-4' into design rev 2, then author
> tasks.md and STOP for architect review.

## Verified sound (checked against repo/live, not taken on faith)

- Hybrid query shape `knn.embedding.filter` — LIVE-PROVEN (architect's 2026-07-18
  ISO9001-filtered probe used exactly this shape successfully).
- **scoreThreshold interaction CLEAR:** retrieval.ts applies `min_score` ONLY when
  `scoreThreshold !== undefined` (line 207) and no guru handler passes one — the
  term-matched clause chunk (whose kNN score for a clause-number query is ~0.38, the
  motivating measurement) will NOT be dropped. Pin this: retrieval-hybrid unit tests
  must assert the hybrid query contains NO `min_score` key when scoreThreshold is
  undefined (guards against a future default-threshold regression re-breaking ACC-1).
- Parser regex traces: "ISO 9001:2015 clause 8.3.4" → priority 1 ✓; "clause 99.9" →
  priority 2 → composed ref → zero-hit → RETRIEVAL-2f fallback ✓; bare "4.1"
  false-positive acknowledged and fallback-safe (N-1) ✓.
- `FileSystem.fingerprint('docs/kb')` on a directory: valid CDK usage, covers all files.
- Unit-lane .md wiring already global: vitest md-as-text plugin (vitest.config.ts) +
  ambient `declare module '*.md'` (md.d.ts is program-global for tsc). ✓
- D-1 discipline upheld: four STATIC imports, no dynamic reads. §5 re-seed flow and
  degraded-window behavior match live-proven iso-kb-seeding behavior.
- §7.4 A/B budget with escalation path — correct application of N-2.

## D-1' (M) — guru Lambdas' bundling lacks the `.md` text loader → synth/deploy FAILS

§4.2 imports `prompts/shared/grounded-composition.md` in guru prompt.ts, but the guru
functions are bundled via the shared `createAgentHandler` factory whose bundling is
`{ externalModules: [], target: 'node22' }` — NO `loader: { '.md': 'text' }` (verified
in ai-stack.ts; only the seeder's bundling has the loader). esbuild will fail the
bundle loudly at synth. Fix: add `loader: { '.md': 'text' }` to the createAgentHandler
bundling config (applies to all agent handlers; harmless where unused). CDK assertion
test: guru bundling metadata includes the loader (or synth-level equivalent).

## D-2' (M) — §2.1 per-file entry counts are WRONG; gates as specced permit silent clause swaps

Design says iso-9001.md=44, iso-14001.md=34, iso-45001.md=30. The LIVE distribution
(architect-witnessed, prover terms agg 2026-07-18) is **ISO9001=50, ISO14001=26,
ISO45001=32** (+1 HLS = 109). Sum coincidentally matches, so the golden COUNT test
would pass content authored to the wrong split, and the canon gate (corpus→canon
membership) cannot catch MISSING clauses. Fix:
1. §2.1 counts corrected to 50/26/32/1.
2. Content files must cover EXACTLY the current 108 ISO clauseRef set — add a
   **golden-SET equality unit test**: `new Set(chunks.map(c => c.metadata.clauseRef))`
   equals a pinned 108-ref fixture (plus HLS). Set equality kills both silent drops
   and silent additions; per-standard count pins (50/26/32) as secondary assertion.
3. The pinned fixture is derived from the CURRENT live corpus refs (architect can
   supply; equivalently: extract from the seeded index or the old map with the fixed
   chunker before it is retired).

## D-3' (L) — explicit cross-standard references produce contradictory filters

§3.3 passes `standard: GURU_STANDARD` unconditionally. If a user asks ISO9001Guru
about "ISO 14001 4.1", priority-1 parsing yields clauseRef='ISO 14001 4.1' while the
handler pins standard='ISO9001' → contradictory filter → guaranteed zero-hit →
fallback (safe but wasteful and semantically wrong). Refine: when the parser returns
an explicit `standard` (priority-1 match), it WINS over GURU_STANDARD; the guru's
standard is used only when composing a ref from bare/labeled clauseNum. Unit test the
cross-standard case.

## D-4' (L) — retire `chunkIsoRequirementsMap` instead of keeping a compat wrapper

The old map is no longer KB authority (OQ-1b); a live wrapper that still chunks it
invites drift and dead-code confusion. Delete the function and migrate/retire its
tests with the chunker update. Keep only if a concrete consumer remains (none should).

## Order

1. Fold D-1'..D-4' into design rev 2 (one commit).
2. Author tasks.md (one commit): lanes marked ([KIRO]/[ARCHITECT]/[REQUIRES-HUMAN]),
   rule 7/8 evidence contract per task, hermetic unit lane, content-authoring tasks
   separated from code tasks (content is reviewable prose — the architect will
   spot-check BC-2 compliance and guidance quality per standard), ACC-1..8 mapped,
   deploy + live probes in the architect lane, A/B iteration task with its decision
   gate (§7.4). STOP after tasks.md.
