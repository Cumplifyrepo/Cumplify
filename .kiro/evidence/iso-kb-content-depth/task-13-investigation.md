# Task 13 Investigation — citation-format collision with the grounding checker

> Architect, 2026-07-19. Task 12 CLOSED same session (see task-12.log). Task 13 probe
> initially FAILED at grounding 0.18 — root cause isolated to a PROMPT-side defect,
> not content depth. Fix = FIX-CD-1 (below).

## Task 12 readback (CLOSED)
Re-seed witnessed 2026-07-18T16:24:14Z: chunksIndexed 109/109, NEW contentHash
b2f85106a6b2…, 35.0s, CFN SUCCESS 200; CR physical id iso-kb-seed-b2f85106a6b2;
old-physical-id Delete no-op witnessed 16:24:30 (designed lifecycle). Prover:
total docs 110 (109+_meta), agg 50/26/32/1+SYSTEM, tenants __ISO_CANON__=109/
__META__=1. Expanded 4.1 chunk live (807 chars). Pipeline 087fef8f (rev 9791f90).

## Task 13 first probe (14:17:57Z 2026-07-19): honest-miss, grounding 0.18 / relevance 1.0

Investigation chain (each step executed, not inferred):
1. Guru code freshness: Guru9001Fn LastModified 2026-07-18T16:23:31Z (C-1 deploy) ✓
2. Raw-answer replication (invoker direct, same system+messages, NO groundingContext):
   model produced a 153-char near-verbatim quote of the source's first sentence +
   citation "[ISO 9001:2015 clause 4.1]" — quote-first prompt WORKING as designed.
3. ApplyGuardrail A/B on guardrail yq8xe6y2iqbs (source = the live 807-char 4.1 chunk):

| Variant | Grounding | Relevance | Action |
|---------|-----------|-----------|--------|
| A: raw answer WITH "[ISO 9001:2015 clause 4.1]" | 0.18 | 1.0 | BLOCKED |
| B: identical, citation stripped | 0.99 | 0.99 | pass |
| C: plain restatement | 1.0 | 1.0 | pass |
| D: citation in CHUNK-PREFIX format "[ISO 9001 4.1]" | **0.99** | 0.96 | **pass** |
| E: bare-prefix-leading + feature-mapping sentence | 1.0 | **0.7** | BLOCKED (relevance) |

## Root cause
The guru BASE prompt's citation rule ("Cite clause numbers verbatim (e.g., 'ISO
9001:2015 clause 8.5.1')") mandates a phrasing that appears NOWHERE in the source
chunks — the checker scores the citation as an ungrounded claim segment and
worst-segment-min craters the whole answer (0.99→0.18). Same failure class as the
FIX-T29-3 synthesis closers. The rule also CONTRADICTS the L4 structural-honesty
block ("[ISO XXXXX X.X.X] — standard number, then clause number") and the frontend
ClauseChip citation regex — the chunk-prefix format was always the house format.
Secondary (variant E): feature-mapping commentary dilutes RELEVANCE below 0.75 —
substance-first composition with inline bracket citation (variant D) is the target.

## FIX-CD-1 (Kiro, pre-re-probe)
1. All three guru base prompts: citation rule becomes the bracket format exactly as
   in the source chunks — e.g., "Cite clauses with the exact bracket notation from
   the source: [ISO 9001 8.5.1]" — delete the ":2015 clause" example.
2. grounded-composition.md: add one rule line — "Cite clauses using the exact
   [ISO NNNN C.C] bracket notation as it appears in the source material; place the
   citation inline at the end of the sentence it supports." Keep the marker string
   'Grounded Composition Rules' UNCHANGED (parity tests).
3. No content changes (docs/kb/ untouched — NO re-seed; fingerprint stable).
4. Suite + tsc + synth green; rule 7/8 with fix-cd-1.log; COMMIT LOCALLY —
   architect push = redeploy (prompt-only, fast).

Filed under Task 18's iteration budget as v2 with root-cause (the §7.4 "<0.70 ⇒
content depth" heuristic was WRONG for this failure — content is fine; the
citation-format collision was invisible to the decision tree; tree updated by this
evidence).
