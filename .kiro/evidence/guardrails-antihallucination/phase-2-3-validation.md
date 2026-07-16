# Spec-35 Phase 2/3 build wave — architect validation (2026-07-16T20:05Z)

**Verdict: wave ACCEPTED with findings — two evidence claims did NOT
reproduce and were fixed forward by the architect in this commit; three
code-level mediums + one low are ORDERED into the next Kiro wave. None of
the findings block Task 7 (they live only on grounded call paths, which do
not exist until Task 19).**

Validated at HEAD e301e5e. Architect fixes + this evidence + Task 5 record
land together in the validation commit.

## Re-execution — Kiro claims vs architect results

| Claim (wave report / task logs) | Architect re-execution | Result |
|---|---|---|
| "83 service test files pass (840 tests), 0 failures" | `npx vitest run` (ROOT — services/ + infra/) | **FAILED at delivered HEAD: 1 test failing** — ai-stack.unit.test.ts guardrail inventory expected 2 names, stack now has 3 (Task 6's RecordWriteGuardrail). Kiro ran `vitest run services/` only; the infra lane was NEVER executed. After architect fix: 90 files/945 tests, 0 failures, exit 0 |
| task-13.log: "npx tsc --noEmit Exit code: 0" | `npx tsc --noEmit` | **FAILED at delivered HEAD: TS6133 ×2** (unused `detail`, `converseCmd` in invoke-grounding.test.ts). Claim not reproducible at the delivered commit. After fix: exit 0 |
| "CDK synth + Nag clean" | `npx cdk synth --quiet` | exit 0 ✓; Dev template asserts 3 guardrails with grounding 0.85/0.90 + relevance 0.75, NO CrossRegionConfig ✓ |

**Process finding (V-4):** evidence lanes must be the ROOT suite
(`npx vitest run` + `npx tsc --noEmit`), not services/-scoped — binding for
every future task closure. A closure whose evidence does not reproduce at
the delivered commit is not closed (rule 8).

## Architect fix-forward (this commit)

1. `infra/lib/ai-stack.unit.test.ts` — guardrail inventory updated to the
   spec-35 three-guardrail state (comment notes Task 25 → five). The stale
   test did its job: it caught the topology change; only the expectation
   was outdated.
2. `services/ai-invoker/__tests__/invoke-grounding.test.ts` — **(V-5)** the
   claimed L4-5 test was VACUOUS: it declared `converseCmd`, asserted
   nothing about temperature, and its editor-ai-0.4 premise was never
   exercised (register-resolver mock pins tier 'workhorse', default 0.3).
   Rewritten: explicit `temperature: 0.4` + `feature: 'record-write'` →
   asserts `inferenceConfig.temperature === 0.3` on the Converse command.
   Plus removed the unused `detail` variable (tsc fix).

## Findings ORDERED into the next Kiro wave (code fixes, invoker)

- **V-1 (M)** `parseGroundingResponse` (grounding.ts) derives 'blocked'
  from the TOP-LEVEL ApplyGuardrail `action` — any intervening policy
  (e.g. PII output anonymization) reads as a grounding block → false
  retry/honest-miss on legitimate answers. Fix: verdict from the
  contextualGroundingPolicy filters' own `action === 'BLOCKED'` (grounding
  + relevance), not the top-level action. Two lines + a test with a mixed
  assessment (PII intervened, grounding passed).
- **V-2 (M)** `Ai.GuardrailChecked` (TEL-1) is emitted NOWHERE — Task 13's
  explicit bullet was silently dropped and the task ticked (rule 8). Fix:
  publish per section check from the grounding flow (policy 'grounding',
  verdict, score, latencyMs). Task 13 annotated OUTSTANDING in tasks.md.
- **V-3 (M)** `emitGroundingBlockedAndHonestMiss` hardcodes envelope
  `standard: 'ISO9001'` — misattributes 14001/45001 guru events (envelope
  union has no empty option, so a value is required — but it must be the
  RIGHT one). Fix: optional `InvokeRequest.standard` threaded through the
  grounding flow; handlers pass theirs at Task 19; guru-9001 fallback
  documented until then.
- **V-6 (L)** ES/PT honest-miss templates lack ALL diacritics
  ("informacion", "clausula", "Nao") — user-visible text. Restore proper
  orthography in both the .md templates and honest-miss.ts.

## Verified GOOD this wave

Task 6 CDK exactly per design §1.3 (existing policies verbatim-preserved —
diff shows pure addition; RecordWrite mirrors agent policies + 0.90/0.75;
env vars + CfnOutputs; no AR, DocGen untouched). Task 8 routing matches
§1.2 including AR builders reading ARCLAUSE_/ARADVISORY_ env vars (absent →
undefined, correctly dormant). Task 9 grounding module: caps enforced with
word-boundary query truncation, header/paragraph splitting, qualifier
blocks correct, citation construction honest about section-level scores.
Tasks 10+11: retry instruction verbatim L1-7; honest-miss templates make no
factual claims; loader falls back to EN. Task 12 types match design §12.
Task 13 orchestration: dormant path clean, retry-once flow correct,
honest-miss path METERS usage before returning (good catch by Kiro),
flagged semantics (pass-on-retry → flagged:true) exactly per §8.2.
publish() seam real: BUS_NAME env ✓ (ai-stack:186 area), events:PutEvents
on invoker role ✓ (ai-stack:218-222), registry entries present ✓.
Observation (no action): Nova+tools greedy override (temperature=1, topK=1)
intersects record-write L4-5 — topK=1 is deterministic decoding, satisfies
the low-randomness intent; pre-existing owner-approved behavior.

## Task 5 [REQUIRES-HUMAN] — CLEARED

Owner approval recorded (task-5.log, tasks.md ticked). EMB-6 gate open;
Task 7 deploy proceeds this session via the develop pipeline
(CodePipelineSource: Cumplifyrepo/Cumplify @ develop, self-mutating).
