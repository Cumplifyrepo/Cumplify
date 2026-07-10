# Task 14 Budget Estimate — LegalLedger Retrieval-Grounded Re-Eval

**Date:** 2026-07-09 · **Author:** architect · **Status:** OWNER GO 2026-07-09 (verbatim: "go", in-session, ceilings as stated)

## Scope (design §6.3)
30 tasks from `services/model-evals/data/eval-sets/legal-ledger.json` (verified on disk: 30),
candidates `zai.glm-5` and `deepseek.v3.2`, grounded on a tenant obligations corpus
(public-domain regulatory text per owner licensing decision) in TENANT-DOCS-KB.
100% human-graded blind per the spec-30 Task 8 runbook — bar: mean rubric ≥ 4.0, no criterion at 1.

## Cost model (live-verified prices)
| Component | Basis | Est. |
|---|---|---|
| glm-5 run | 30 × (~4.5K in @ $1.00/M + ~1.5K out @ $3.20/M) | $0.28 |
| deepseek.v3.2 run | 30 × (~4.5K in @ $0.62/M + ~1.5K out @ $1.85/M) | $0.17 |
| Obligations-corpus + query embeddings | Titan Embed v2 @ $0.02/M | <$0.01 |
| AOSS retrieval | marginal $0 (0.5-OCU floor already billed) | $0.00 |
| **Ceiling requested** | includes rerun headroom | **$1.00** |

## Non-dollar cost
60 outputs (2 candidates × 30) graded blind. CORRECTION vs first draft: per
legal-ledger-grading.md the ARCHITECT is the sole grader in P1 (as executed in
spec-30 Task 8) — not the owner. The open owner decision is only whether to add
external legal review for validation (REQUIRES-HUMAN, unchanged).

## Notes
- Price provenance: deepseek.v3.2 $0.62/$1.85 and glm-5 $1.00/$3.20 are the
  spec-30 live-API verified figures (task-8-benchmark-runs.log) — the fabricated
  deepseek 0.27/1.1 from incident #4 is NOT used.
- Outcome A: winner ASSIGNED + monthly budget cap attached (Register COND-4).
  Outcome B: seat stays UNASSIGNED, deferred to quarterly re-validation.
