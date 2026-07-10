# Task 13 Budget Estimate — guru-45001 Retrieval-Grounded Re-Eval

**Date:** 2026-07-09 · **Author:** architect · **Status:** OWNER GO 2026-07-09 (verbatim: "go", in-session, ceilings as stated)

## Scope (design §6.2)
50 tasks from `services/model-evals/data/eval-sets/guru-iso45001.json` (verified on disk: 50),
grounded on architect-authored ISO 45001-consistent tenant content in ISO-KB
(NO verbatim ISO text — owner licensing decision 2026-07-05), scored on clause-citation
accuracy, bar ≥ 0.85. Seat: `moonshotai.kimi-k2.5` (PROVISIONAL at 0.843 ungrounded).

## Cost model (live-verified prices, seed capturedAt 2026-07-09)
| Component | Basis | Est. |
|---|---|---|
| kimi-k2.5 primary run | 50 × (~4.5K in @ $0.60/M + ~1K out @ $3.00/M) | $0.29 |
| Grounding-corpus embeddings | ~150 chunks × ~350 tok, Titan Embed v2 @ $0.02/M | <$0.01 |
| Query embeddings | 50 × ~30 tok | <$0.01 |
| Contingency: swap eval vs glm-5 ($1.00/$3.20 per M) if kimi fails bar | 50 × ~$0.0077 | $0.39 |
| AOSS retrieval | marginal $0 (0.5-OCU floor already billed) | $0.00 |
| **Ceiling requested** | includes rerun headroom | **$1.50** |

## Notes
- Embeddings for eval grounding are generated architect-side under the spec-30
  eval-boundary ruling (offline measurement instrument) — the production embed()
  door amendment is NOT on this task's critical path.
- Outcome A (≥0.85): Register → guru-45001 ASSIGNED. Outcome B: EXPIRED + swap
  eval (glm-5), outcome recorded either way.
