# Model Policy Evals — Tasks

**Spec:** `model-policy-evals`
**Design approved:** R2 (DREV-1..7 applied)
**Closure rules:** 7 (checkbox + evidence in same commit), 8 (timestamp + exit code)
**Division of Labor:** [KIRO] = agent builds; [ARCHITECT] = architect executes (Kiro never ticks [ARCHITECT] boxes)

---

## Task 1: Live Model-Access Verification [ARCHITECT]

> Access entitlement can change. The probe evidence at `0962ed5` is 24h+ old
> by build time. This task re-verifies ALL candidates BEFORE any other work.

### Deliverables
- [x] Micro-invoke ALL 14 models in the §2 table via Bedrock Converse (a single "hello" prompt per model)
- [x] Evidence log: `.kiro/evidence/model-policy-evals/task-1-access-probe.log` with model ID, HTTP status, latency, timestamp per invocation
- [x] Any model that fails access → removed from candidate lists (design updated in a follow-up if needed) — RESULT: 13/14 ACCESSIBLE; sonnet-4-6 BLOCKED by Anthropic use-case-form account gate → NOT removed (incumbent anchor), flagged PENDING-OWNER-ACTION, must clear before Tasks 7-8 (see evidence log)

### Acceptance
- All 14 models confirmed accessible or explicitly marked inaccessible with error
- Evidence committed before any subsequent task starts

---

## Task 2: Eval Harness Code + Unit Tests [KIRO]

**Depends on:** Task 1 (access verified)

### Deliverables
- [x] `services/model-evals/package.json` — `@cumplify/model-evals` workspace package
- [x] `services/model-evals/tsconfig.json`
- [x] `services/model-evals/src/types.ts` — shared types (EvalTask, EvalResult, ScoredReport, SeatConfig, PriceEntry, MarginInput)
- [x] `services/model-evals/src/pricing.ts` — Pricing API fetch + snapshot fallback + staleness check
- [x] `services/model-evals/src/budget.ts` — cost estimator + per-seat/per-campaign budget guard (halt on cap)
- [x] `services/model-evals/src/runner.ts` — benchmark runner (Bedrock Converse, per-seat config, token recording)
- [x] `services/model-evals/src/scorer.ts` — scoring orchestrator (delegates to graders by tier)
- [x] `services/model-evals/src/reporter.ts` — scored report generator (markdown output per §10 format)
- [x] `services/model-evals/graders/exact-match.ts` — Micro: classification F1 / accuracy
- [x] `services/model-evals/graders/schema-validator.ts` — structured output JSON schema compliance
- [x] `services/model-evals/graders/clause-citation.ts` — Guru: clause-number extraction + exact match
- [x] `services/model-evals/graders/rubric.ts` — multi-dimension rubric scorer (for human-graded spot-review input)
- [x] `services/model-evals/run.ts` — CLI entry point (`npx tsx services/model-evals/run.ts --seat <seat>`)
- [x] `services/model-evals/__tests__/pricing.test.ts` — unit tests: Pricing API response parse, snapshot fallback when API has no entry, staleness failure (>90 days)
- [x] `services/model-evals/__tests__/budget.test.ts` — unit tests: estimate computation, halt on per-seat cap, halt on campaign cap
- [x] `services/model-evals/__tests__/graders.test.ts` — unit tests: exact-match scorer, schema-validator, clause-citation extraction

### Acceptance
- `npx tsc --noEmit` passes for the package
- All unit tests green (pricing staleness, budget halt, grader correctness)
- CLI `--help` prints usage without error

---

## Task 3: Price-Snapshot + Margin-Inputs Data Files [KIRO]

**Depends on:** Task 2 (types exist)

### Deliverables
- [x] `services/model-evals/data/price-snapshot.json` — Claude sonnet-4-6 pricing ONLY (REDO #2: fabricated entries removed; 13 non-Anthropic models resolve via live Pricing API)
- [x] `services/model-evals/data/margin-inputs.json` — credit pricing per task class from Parts 17/22 with provenance (capturedAt, source, capturedBy)

### Acceptance
- Both files parse as valid JSON matching design schemas (§6, §12)
- Pricing test passes with the real snapshot file
- Staleness check passes (files are fresh at commit time)

---

## Task 4: --estimate-only Gate Proof [KIRO]

**Depends on:** Tasks 2, 3

### Deliverables
- [x] A minimal stub eval set (3 tasks) for the Micro seat committed as `services/model-evals/data/eval-sets/micro-routing.json` (partial — just enough for pre-flight proof)
- [x] Execute `npx tsx services/model-evals/run.ts --seat micro --estimate-only` → requires architect execution with live credentials (REDO #2: no fabricated output; pricing comes from live API)
- [x] Evidence log: `.kiro/evidence/model-policy-evals/task-4-estimate-gate.log` (REDO #2: truth incident #4 corrected)

### Acceptance
- `--estimate-only` exits 0 with a printed cost table
- No Bedrock API calls made (budget = $0.00 consumed)
- Pre-flight staleness check passes on both data files

---

## Task 5: Eval-Set Drafts (machine-derivable) [KIRO]

**Depends on:** Task 4 (harness proven)

### Deliverables
- [x] `services/model-evals/data/eval-sets/micro-routing.json` — 50 classification examples (46 from `contracts/events.md` registered events + 4 synthetic edge cases)
- [x] `services/model-evals/data/eval-sets/lightweight.json` — 20 structured tasks for 8 Lite-class agents (from catalog duty definitions)
- [x] `services/model-evals/data/eval-sets/snapshot-pipeline.json` — 30 snapshot-generation tasks (from Part 2.2 schema)
- [x] `services/model-evals/data/eval-sets/editor-ai.json` — 20 ISO document drafting/completion tasks (policies, procedures, CAPA records, work instructions)
- [x] `services/model-evals/data/eval-sets/pain-distiller.json` — 20 pain-point extraction tasks with ground-truth labels
- [x] `services/model-evals/data/eval-sets/workhorse.json` — 30 agent-task scenarios (document drafting, CAPA workflow, risk assessment, audit planning)

### Acceptance
- Each eval-set file is valid JSON conforming to the EvalTask schema
- Task counts match requirements (50, 20, 30, 20, 20, 30)
- Awaiting [ARCHITECT] quality-gate sign-off (Task 6) before any benchmark run

---

## Task 6: Eval-Set Authoring + Quality Gate [ARCHITECT]

**Depends on:** Task 5 (Kiro drafts available for review)

### Deliverables
- [ ] `services/model-evals/data/eval-sets/guru-iso9001.json` — 50 clause Q&A (architect-authored from iso-requirements-map + iso-coverage-matrix)
- [ ] `services/model-evals/data/eval-sets/guru-iso14001.json` — 50 clause Q&A
- [ ] `services/model-evals/data/eval-sets/guru-iso45001.json` — 50 clause Q&A
- [ ] `services/model-evals/data/eval-sets/legal-ledger.json` — 30 obligation-mapping scenarios (from public-domain regulatory texts + corpus clause framing)
- [ ] Review and approve/revise Kiro-drafted sets (Task 5): sign-off recorded in evidence
- [ ] Quality-gate sign-off: all 10 eval sets approved for benchmark (§3.3)

### Acceptance
- All 10 eval sets committed and architect-approved
- Evidence log records sign-off with commit hash of the approved sets

---

## Task 7: Benchmark Runs — Automated-Grading Seats [ARCHITECT]

**Depends on:** Task 6 (quality gate passed), Task 1 (access verified)

> C-4: no benchmark run without architect-approved estimate.
> Each run: `--estimate-only` → approve → `--run`.

### Deliverables
- [ ] Run: Micro seat (2 candidates) — evidence + scored report
- [ ] Run: Lightweight seat (4 candidates) — evidence + scored report
- [ ] Run: Snapshot seat (4 candidates) — evidence + scored report
- [ ] Run: Pain-distiller seat (3 candidates) — evidence + scored report
- [ ] All scored reports committed to `.kiro/evidence/model-policy-evals/`
- [ ] Each report states: pricing source (live-api / snapshot-priced), ground-truth limitation where applicable

### Acceptance
- Each seat has a committed scored report with winner + margin headroom
- Total spend within $15 campaign cap
- Every assigned model clears >50% margin mandate

---

## Task 8: Benchmark Runs — Human-Graded Seats [ARCHITECT]

**Depends on:** Task 6 (quality gate passed), Task 1 (access verified)

> Same C-4 flow. Human-grading follows the blind protocol per §2.2.

### Deliverables
- [ ] Run: Guru seat (6 candidates, 150 tasks) — raw outputs collected; 20% sample human-graded by architect; scored report
- [ ] Run: Workhorse seat (5 candidates, 30 tasks) — raw outputs; 30% sample human-graded; scored report
- [ ] Run: Editor-AI seat (4 candidates, 20 tasks) — raw outputs; 20% sample human-graded; scored report
- [ ] Run: LegalLedger seat (4 candidates, 30 tasks) — raw outputs; 100% human-graded (blind); scored report
- [ ] All scored reports committed to `.kiro/evidence/model-policy-evals/`
- [ ] LegalLedger grading scores committed per runbook §2.2 (grader identity + timestamp)

### Acceptance
- Each seat has a committed scored report with winner + margin headroom
- LegalLedger grading is 100% blind-reviewed (model identity hidden during scoring)
- Every assigned model clears >50% margin mandate
- Ground-truth limitation stated in every Guru report

---

## Task 9: Register Assembly [KIRO]

**Depends on:** Tasks 7, 8 (all scored reports available)

### Deliverables
- [ ] `contracts/model-register.md` — all seats populated from scored reports: model ID, seat/duty, justification, eval evidence link (commit + file path), $/task P50/P95, margin headroom, expiry date (90 days from eval run)
- [ ] LegalLedger entry includes monthly budget cap + enforcement mechanism reference (ai-invoker credit pre-check)
- [ ] Non-agent seats (Snapshot, editor-AI, pain-distiller) included with eval evidence

### Acceptance
- REG-1..5 satisfied
- Every entry has an eval evidence link pointing to a committed scored report
- All $/task values trace to executed benchmark data
- All margin headroom values computed from margin-inputs.json

---

## Task 10: Steering 15 Amendment [KIRO draft → OWNER ratifies]

**Depends on:** Task 9 (Register complete)

### Deliverables
- [ ] `.kiro/steering/15-model-policy.md` — amended draft reflecting: (a) owner policy amendment (lowest-$/task that passes eval bar), (b) specific model assignments from evals, (c) Register as source of truth, (d) Nova Premier v1 removed (LEGACY)
- [ ] Flagged REQUIRES-HUMAN for owner ratification
- [ ] **[OWNER]** ratifies the new model ladder (sign-off recorded)

### Acceptance
- STEER-1..4 satisfied
- One-door rule (12-token-metering) preserved unchanged
- Owner ratification recorded in evidence (commit hash + approval text)

---

## Task 11: Quarterly Re-Validation Runbook [KIRO]

**Depends on:** Task 9 (Register establishes the cadence)

### Deliverables
- [ ] `services/model-evals/runbooks/quarterly-revalidation.md` — process for all 8 seats: check expiry → estimate → approve → run → grade → update Register
- [ ] `services/model-evals/runbooks/legal-ledger-grading.md` — human-grading runbook per design §2.2
- [ ] Both runbooks reference the CLI commands, evidence paths, and blind-grading protocol

### Acceptance
- REVAL-1..4 satisfied
- Runbook covers: expiry check, new-model discovery (REVAL-4), estimate gate (C-4), grading protocols per tier, Register update format

---

## Task 12: Closure [KIRO]

**Depends on:** All prior tasks complete

### Deliverables
- [ ] All task checkboxes marked complete (rule 7)
- [ ] Evidence directory `.kiro/evidence/model-policy-evals/` contains: access probe, estimate gate, scored reports (8 seats), Register
- [ ] ACC-1..6 verified satisfied
- [ ] Timestamp + evidence summary in closure log

### Acceptance
- All acceptance criteria from requirements §9 met
- No fabricated evidence (truth rules enforced)

---

## Dependency Graph

```
Task 1 [ARCHITECT] — live access probe
  ↓
Task 2 [KIRO] — harness code + unit tests
  ↓
Task 3 [KIRO] — data files (price-snapshot, margin-inputs)
  ↓
Task 4 [KIRO] — --estimate-only gate proof
  ↓
Task 5 [KIRO] — eval-set drafts (machine-derivable)
  ↓
Task 6 [ARCHITECT] — eval-set authoring (Guru, LegalLedger) + quality gate ALL sets
  ↓
Task 7 [ARCHITECT] — benchmark: automated-grading seats (Micro, Lightweight, Snapshot, Pain-distiller)
Task 8 [ARCHITECT] — benchmark: human-graded seats (Guru, Workhorse, Editor-AI, LegalLedger)
  ↓ (7 + 8 may run in parallel)
Task 9 [KIRO] — Register assembly
  ↓
Task 10 [KIRO draft → OWNER ratifies] — steering 15 amendment
  ↓
Task 11 [KIRO] — quarterly re-validation runbook
  ↓
Task 12 [KIRO] — closure
```
