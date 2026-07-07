# model-policy-evals — ARCHITECT FINAL SPEC SIGN-OFF

**Date:** 2026-07-07 | **Closing commit chain:** e755499 (R1 req) → 4a80b26 (task-12)
**Architect verification at sign-off:** tasks.md 0 unticked boxes; 125/125 tests
independently re-run green; 20 evidence artifacts in directory; Register trace-verified
(db21990); owner ratification on record (9e578f9).

**VERDICT: SPEC CLOSED.** Max rung: eval/policy spec (no deployed infra — D-rung N/A per
C-1/NFR-4; the CLI harness + Register + runbooks + ACTIVE steering 15 are the deliverables).

**Standing carries out of this spec:**
1. ai-core: Register EXPIRED-flag invoke-time enforcement + LegalLedger budget-cap
   enforcement (credit pre-check).
2. spec-4 (knowledge-base): retrieval-grounded re-evals — guru-45001 (kimi-k2.5
   provisional → confirm or swap; test qwen+retrieval for consolidation) and
   LegalLedger staffing gate. Plus AOSS 45s proof (P0 CARRY-2).
3. Agent specs (workhorse family): per-agent prompt scaffolding for risk-assessment/
   audit-planning task families + schema retry-guard; re-eval at each readback.
4. Harness cleanup (non-blocking): extractJson under-count on long fenced responses
   (workhorse scoring corrected manually at task-8 closure — documented).
