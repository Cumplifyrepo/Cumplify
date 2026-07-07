# LegalLedger human grading — architect verdict (2026-07-07)
Protocol: 90 responses, blind (deterministic shuffle seed=96fe704, key sequestered until
all scores locked), 5-criterion rubric per design §2.2, first-pass scoring by three
architect-directed blind graders, architect adjudication of all criterion-1 items
(regulatory claims independently verified: sulfuric acid EHS Tier II 500 lb; chlorine
RMP TQ 2,500 lb; >1,000 kg/mo = LQG — graders correct in all cases).

Per-model (bar: mean >= 4.0 AND no criterion at 1):
  deepseek.v3.2             3.79  FAIL (2 catastrophic: B057 fabricated RMP threshold, B084 SQG/LQG inversion)
  zai.glm-5                 3.68  FAIL on mean (ZERO catastrophic items — safest failure profile)
  moonshot.kimi-k2-thinking 3.65  FAIL (B046 Tier II threshold error; B048 = empty truncated
                                  response, instrument noise — excluding it does not change the verdict)

RESULT: NO MODEL PASSES. Dominant failure mode across all three: confident fabrication of
numeric specifics (thresholds, section numbers, state programs) atop correctly-identified
core obligations.

ARCHITECT RULING for the Register (owner ratifies at Task 10):
1. LegalLedger seat = NO ASSIGNMENT in P1. The agent is Roadmap-status in the catalog;
   nothing ships unstaffed.
2. This eval measured BARE model capability — the production agent design includes KB
   retrieval grounding + mandatory HITL. Re-eval WITH retrieval grounding is REQUIRED
   before the seat is ever staffed (expected material lift: the failure mode is precisely
   what retrieval grounding targets).
3. Leading candidates on record: glm-5 on safety profile (zero catastrophics), deepseek
   on mean. Monthly budget cap requirement (LEGAL-5) attaches to whichever model is
   eventually assigned.
4. Failure-mode catalog (fabricated thresholds, jurisdiction misattribution, threshold
   collapse) feeds the future HITL reviewer checklist — the eval's most valuable output.
