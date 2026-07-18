# Tasks Review — iso-kb-content-depth

> **Reviewer:** Architect (Claude) — independent verification
> **Date:** 2026-07-18
> **Inputs:** design rev 2 @ 740adf4 (D-1'..D-4' + min_score pin verified folded, faithful),
> tasks.md @ d369676 (312 lines, 19 tasks / 6 phases, read in full)
> **Verdict:** APPROVED WITH ONE CORRECTION (T-1') + one probe-value fix (T-2') —
> fold both into tasks rev 2, then the [KIRO] wave (Tasks 1–9, 6, 11) may proceed.
> STOP before Phase 5. Task 10 (content spot-check) is the architect's gate between
> the wave and any deploy.

## Verified sound

- Design rev 2 fold faithful: D-1' loader + CDK assertion, D-2' counts 50/26/32/1 +
  golden-SET, D-3' `parsed.standard ?? (clauseRef ? GURU_STANDARD : undefined)` exact,
  D-4' deletion (no wrapper), min_score-absence pin present in test plan.
- Lanes correct; rule 7/8 contract stated; ACC-1..8 all mapped with live legs;
  dependency graph coherent incl. Task 6 gated on content existence; A/B decision
  tree matches §7.4 with escalation; Task 19 closes iso-kb-seeding Task 8 with
  cross-references (tick + appended log in same commit — rule 7/8 compliant).

## T-1' (M) — golden-SET fixture derivation is CIRCULAR as written

Task 6 NOTE says "The golden-SET fixture is derived from the content files." That
defeats D-2': if content authoring silently drops a clause, the fixture inherits the
drop and the set-equality test passes. The fixture MUST be authored independently of
the content files — it is the CURRENT live corpus ref set, fixed below (architect-
derived from the pre-migration source with the fixed chunker; cross-checked against
the live index aggregation 50/26/32 AND the clause-canon 108/108). Kiro copies this
list VERBATIM into the fixture file; any legitimate future change to the set requires
an architect-reviewed fixture amendment with justification.

**AUTHORITATIVE FIXTURE (108 refs — prefix each with 'ISO <std> '):**
ISO 9001 (50): 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.1.1, 7.1.2, 7.1.3, 7.1.4, 7.1.5, 7.1.6, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2.1, 8.2.2, 8.2.3, 8.2.4, 8.3.1, 8.3.2, 8.3.3, 8.3.4, 8.3.5, 8.3.6, 8.4.1, 8.4.2, 8.4.3, 8.5.1, 8.5.2, 8.5.3, 8.5.4, 8.5.5, 8.5.6, 8.6, 8.7, 9.1.1, 9.1.2, 9.1.3, 9.2, 9.3, 10.1, 10.2, 10.3
ISO 14001 (26): 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1.1, 6.1.2, 6.1.3, 6.1.4, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 9.1.1, 9.1.2, 9.2, 9.3, 10.1, 10.2, 10.3
ISO 45001 (32): 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1.1, 6.1.2.1, 6.1.2.2, 6.1.2.3, 6.1.3, 6.1.4, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1.1, 8.1.2, 8.1.3, 8.1.4, 8.2, 9.1.1, 9.1.2, 9.2, 9.3, 10.1, 10.2, 10.3

Plus 'Annex SL HLS' as the single non-ISO member (total set size 109).

## T-2' (S) — Task 12 expected live document count is 110, not 109

The AOSS index holds 109 chunks + 1 `_meta` doc (D-2 of iso-kb-seeding; live-witnessed
count 110 in iso-kb-seeding task-7.log). Task 12's readback expectation "document
count = 109" would fail a healthy seed. Fix to: total docs 110 (109 chunks + _meta);
per-tenant agg __ISO_CANON__=109 / __META__=1 is the precise assertion.

## Wave order

1. Fold T-1' (fixture list verbatim + derivation note) and T-2' into tasks rev 2
   (one commit).
2. [KIRO] wave: Tasks 1–5 (code) ∥ Tasks 7–9 (content), then Task 6 (chunker +
   golden-SET vs the FIXED fixture), then Task 11 (canon gate + property tests).
   Rule 7/8 per task; hermetic lane; full suite + tsc + synth green per evidence
   contract. Task 11 MAY run before Task 10 (canon gate is mechanical; the
   spot-check is editorial) — the graph's 10→11 edge is relaxed accordingly.
3. STOP at end of the wave. Task 10 (architect BC-2 + quality spot-check) gates
   Phase 5; content corrections, if any, fold before deploy. Tasks 12–18 architect
   lane; Task 19 returns to Kiro after 18.
