# Requirements Review — iso-kb-content-depth

> **Reviewer:** Architect (Claude) — independent verification
> **Date:** 2026-07-18
> **Input:** requirements.md @ 820877e (381 lines, committed — verified in git log)
> **Verdict:** APPROVED WITH OQ RESOLUTIONS — fold OQ-1/2/3 resolutions + notes N-1..N-6
> into requirements rev 2, then proceed DIRECTLY to design.md. STOP after design.

## Verification performed

- Commit 820877e exists on develop with the file (381 insertions) — properly committed.
- Problem statement cross-checked against task-8.log: all measured numbers accurate
  (0.54/1.0 perfect-retrieval grounding, flat ~0.39 clause-number scores, 0.522 topic
  rank-1, retry regression pairs).
- Invariants table faithful to owner-ratified conventions (prefix format, canon tenant,
  systemOp, threshold 0.85 immovable, seeder reuse, one-door).
- **Canon coverage PRE-VERIFIED (CONTENT-3a satisfiability):** architect diffed all
  corpus clauseRefs (chunker-pattern extraction, 108 ISO refs) against
  contracts/clause-corpus-map.md parsed tuples (152): **0 missing** — including
  ISO 45001 6.1.2.1/2/3 (canon rows 143–145; the canon never had the indentation
  blind spot). 44 canon-only tuples are parents/finer splits — expected; the gate
  direction is corpus → canon only.
- ACC-1/2 pin the exact Task-8 probe pair; ACC-8 closes iso-kb-seeding Task 8. Correct.
- Out-of-scope routing correct (L1-retry investigation, multi-clause, i18n, index swap).

## OQ Resolutions (BINDING for design)

**OQ-1 → (b) dedicated content files** under `docs/kb/` (per-standard files; HLS
placement is design's choice). `iso-requirements-map.md` remains an architecture
reference and is NO LONGER load-bearing for the KB. Design constraints:
- Source loading = STATIC esbuild text-loader imports, one per file. The OQ's
  "dynamic directory read at build time" option is STRUCK — the text loader has no
  glob/dynamic capability; anything dynamic reintroduces the D-1/prompt-library
  incident class.
- CDK re-seed trigger must fingerprint ALL content files (CDK `FileSystem.fingerprint`
  on the `docs/kb/` directory, or a stable hash-of-fingerprints).
- Chunker consumes explicit (source, standard) inputs; deterministic output preserved.

**OQ-2 → (a) one chunk per sub-clause.** The 1:1 clauseRef↔chunk mapping is
load-bearing for LEG-2 term retrieval; expected count stays 109 (108 ISO + 1 HLS)
unless design legitimately changes splits (then re-pin with justification).

**OQ-3 → middle path (as Kiro suggested):** parser is a pure function in
`services/agents/shared/` (own module); hybrid strategy implemented in the shared
retrieval layer (RETRIEVAL-2e); each guru passes its known `standard` as a parameter.

## Notes (design-binding)

- **N-1:** bare-number parsing ("4.1") will false-positive on non-clause numerics;
  RETRIEVAL-2f's zero-result→kNN fallback makes this safe. Design must include a unit
  test for a false-positive input (e.g., "improve efficiency by 4.1 percent").
- **N-2:** ANSWER-1a wording must apply the FIX-T29-3 lesson: prohibited-patterns-by-
  example outperforms abstract instruction (the first Grounded-Composition wording
  FAILED live). Design should budget a live A/B iteration for the quote-first wording.
- **N-3:** ACC-3's "top-5 all ISO9001" phrasing: under 1:1 term retrieval the filtered
  set is a single chunk — restate as "all returned chunks" in design/probe.
- **N-4:** ACC-1/2 "via AppSync": fixture-token AppSync path (proven live 2026-07-16)
  is primary; a direct-invoke probe in the resolver event shape is an acceptable
  equivalent if fixture auth is unavailable at probe time — transport is unchanged by
  this spec and separately proven.
- **N-5:** CONTENT-2c determinism + CONTENT-3c ≥200-char floor: floor applies to the
  chunk TEXT (prefix + title + guidance), asserted in the unit lane.
- **N-6:** NFR-3 cost arithmetic is order-of-magnitude correct and non-binding.

## Order

1. Fold OQ resolutions + N-1..N-5 into requirements rev 2 (one commit).
2. Proceed DIRECTLY to design.md (one commit): chunker/source format, fingerprint
   mechanism, hybrid query shape (bool must-kNN + filter incl. per-guru standard),
   parser module API, prompt fragment placement (guru prompts only, parity-test
   pattern per spec-35 L4), re-seed flow, testing strategy incl. golden count +
   false-positive parser test + content-canon validation.
3. STOP after design.md for architect review. No tasks.md, no build.
