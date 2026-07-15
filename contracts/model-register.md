# Model Justification Register

> **Append-only.** Every later spec registers model assignments here BEFORE use.
> Do not alter existing entries except to mark EXPIRED or update re-validation dates.

**Owner policy (2026-07-05):** The default is the lowest-$/task model on Bedrock
that passes the seat's eval bar. The one-door rule (12-token-metering) and this
Register's discipline are unchanged.

**Anthropic status:** REMOVED from platform (owner decision 2026-07-06 — use-case
form declined + margin-fail at credit pricing).

---

## Seat Assignments

### Micro/Routing Tier

| Field | Value |
|-------|-------|
| **Seat** | Micro (classification, routing, triage) |
| **Assigned Model** | `us.amazon.nova-2-lite-v1:0` |
| **Status** | PROVISIONAL (bar-0.90 recalibration, owner ratifies at Task 10) |
| **Justification** | Highest F1 among candidates at 0.90 bar. Original bar 0.95 had zero passers across 10 models; architect recalibrated to 0.90 per routing-task difficulty. |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/micro-run5-20260706/report-rescored.md` |
| **$/task P50** | $0.00014 |
| **$/task P95** | $0.00029 |
| **Margin at credit pricing** | 93.1% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### Lightweight Tier (8 Lite-class agents)

| Field | Value |
|-------|-------|
| **Seat** | Lightweight (RecordsVault, ObjectiveTracker, ContextCartographer, SupplierScout, CompetenceKeeper, EmergencyPlanner, WorkerVoice, NCTriage) |
| **Assigned Model** | `us.amazon.nova-lite-v1:0` |
| **Status** | ASSIGNED |
| **Justification** | Quality 0.950 at bar 0.90. Lowest $/task among passers. Schema compliance validated with output-contract prompts (FINDING-J fix). |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/lightweight-run6-20260706/report-rescored.md` |
| **$/task P50** | $0.00004 |
| **$/task P95** | $0.00006 |
| **Margin at credit pricing** | 99.0% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### Snapshot Pipeline

| Field | Value |
|-------|-------|
| **Seat** | Snapshot (AI Readiness Assessment — unauthenticated, high-volume) |
| **Assigned Model** | `zai.glm-4.7-flash` |
| **Status** | ASSIGNED |
| **Justification** | Quality passer at lowest $/task. Cost-sensitive seat (~$0.03–0.08/run target). Schema compliance 1.00 with output contract. |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/snapshot-run6-20260706/report-rescored.md` |
| **$/task P50** | $0.00023 |
| **$/task P95** | $0.00031 |
| **Margin at credit pricing** | 97.1% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### Pain-Distiller

| Field | Value |
|-------|-------|
| **Seat** | Pain-distiller (customer feedback extraction + synthesis) |
| **Assigned Model** | `qwen.qwen3-next-80b-a3b` |
| **Status** | ASSIGNED |
| **Justification** | Quality 0.861 at bar 0.85. Lowest $/task among passers. Multi-label category classification (14-category taxonomy). |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/pain-distiller-run4-20260706/report-rescored.md` |
| **$/task P50** | $0.00026 |
| **$/task P95** | $0.00048 |
| **Margin at credit pricing** | 97.8% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### Guru — ISO 9001 Domain

| Field | Value |
|-------|-------|
| **Seat** | ISO 9001 Domain Guru (clause Q&A) |
| **Assigned Model** | `qwen.qwen3-next-80b-a3b` |
| **Status** | ASSIGNED |
| **Justification** | Quality 0.930 at bar 0.85. Lowest $/task among passers. glm-5 (0.960) documented as higher-quality alternative at 3× price. |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/guru-run7-20260706/report.md` |
| **$/task P50** | $0.00068 |
| **$/task P95** | $0.00151 |
| **Margin at credit pricing** | 96.6% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### Guru — ISO 14001 Domain

| Field | Value |
|-------|-------|
| **Seat** | ISO 14001 Domain Guru (clause Q&A) |
| **Assigned Model** | `qwen.qwen3-next-80b-a3b` |
| **Status** | ASSIGNED |
| **Justification** | Quality 0.920 at bar 0.85. Lowest $/task among passers. kimi-k2.5 (0.980) documented as highest-quality alternative at ~1.5× price. |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/guru-run7-14001/report.md` |
| **$/task P50** | $0.00050 |
| **$/task P95** | $0.00092 |
| **Margin at credit pricing** | 97.5% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### Guru — ISO 45001 Domain

| Field | Value |
|-------|-------|
| **Seat** | ISO 45001 Domain Guru (clause Q&A) |
| **Assigned Model** | `moonshotai.kimi-k2.5` |
| **Status** | ASSIGNED — retrieval-grounded re-eval PASSED 2026-07-10 (agents-existing-8 Task 13) |
| **Justification** | No bare passer at 0.85 bar (best: kimi-k2.5 at 0.843). Sub-clause precision is the failure mode. Production Gurus run retrieval-grounded on the KB — clause-tagged chunks target exactly this gap. Retrieval-grounded re-eval REQUIRED at spec-4 readback before any user-facing GO. RE-EVAL RESULT: grounded on clause-tagged AOSS corpus (Titan Embed v2, topK=5, production retrieve() path), mean clause-citation 0.9433 over 50 tasks ≥ 0.85 bar — the grounding hypothesis held (ungrounded 0.843 → grounded 0.9433; every residual error was a retrieval-breadth miss on multi-clause tasks, zero model mis-citations of retrieved clauses). Run-1 at 0.7533 was INVALIDATED for a grounding-corpus granularity defect (depth-3 docs vs depth-4 expected clauses), diagnosed mid-run and documented — not a model failure. |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/guru-run7-45001/report.md` (ungrounded); `.kiro/evidence/agents-existing-8/task-13-guru45001-reeval.log` + `runs/task13-kimi-run2-corpusv2/` (grounded) |
| **$/task P50** | $0.00101 (ungrounded); grounded run mean $0.00111 |
| **$/task P95** | $0.00184 |
| **Margin at credit pricing** | 94.9% (mandate: >50%) |
| **Expiry** | 2026-10-08 (90 days from grounded re-eval) |

---

### Workhorse Tier (10 Pro-class agents)

| Field | Value |
|-------|-------|
| **Seat** | Workhorse (ControlTower, DocStudio, LeadAuditor, CAPAGuru, RiskSentinel, AspectWarden, HazardScout, IncidentInvestigator, ReviewOrchestrator, ComplianceCopilot) |
| **Assigned Model** | `us.amazon.nova-pro-v1:0` |
| **Status** | PROVISIONAL — conditions apply |
| **Justification** | Corrected schema compliance 0.933 (28/30; harness extractJson under-counted 3 valid responses — 2 genuinely malformed). Content review mean 3.0 (adequate for long-form drafting). CONDITIONS: (a) schema-validate + one-retry production guard in ai-invoker, (b) per-agent prompt scaffolding for weak task families (agent specs own), (c) re-eval at each agent spec's readback. glm-4.7 (0.800) documented runner-up. |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/workhorse-run7-20260706/report.md` |
| **$/task P50** | $0.00062 |
| **$/task P95** | $0.00295 |
| **Margin at credit pricing** | 94.8% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days; conditions re-evaluated per agent spec) |

---

### Editor-AI

| Field | Value |
|-------|-------|
| **Seat** | Editor-AI (ISO document drafting/completion — policies, procedures, CAPA records, work instructions) |
| **Assigned Model** | `us.amazon.nova-pro-v1:0` |
| **Status** | ASSIGNED (with retry-guard condition) |
| **Justification** | Content quality 3.5/5 mean (human-reviewed 20% sample). 0 low scores. Schema 0.867 + retry guard addresses the remaining 13% formatting misses. nova-lite REJECTED despite 0.950 schema: human review found mean 1.25 quality with model-fabrication pattern (false self-claims of added content over verbatim copies). |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/editor-ai-run7-20260706/report.md` |
| **$/task P50** | $0.00116 |
| **$/task P95** | $0.00213 |
| **Margin at credit pricing** | 85.4% (mandate: >50%) |
| **Expiry** | 2026-10-06 (90 days) |

---

### LegalLedger (M8 — Compliance Obligations)

| Field | Value |
|-------|-------|
| **Seat** | LegalLedger (statutory/legal-text interpretation — 14001 6.1.3, 45001 6.1.3, 9.1.2) |
| **Assigned Model** | `zai.glm-5` |
| **Status** | ASSIGNED — retrieval-grounded re-eval PASSED 2026-07-10 (agents-existing-8 Task 14) |
| **Justification** | This is the highest-consequence seat. Human grading (90/90 blind, 3 candidates × 30 tasks) completed. Leading candidates: glm-5 and deepseek.v3.2. All candidates evaluated WITHOUT retrieval grounding (corpus maps only). Production LegalLedger runs retrieval-grounded on tenant-uploaded standards — the eval without grounding is not representative of production conditions. Assignment deferred until spec-4 (knowledge-base) deploys the retrieval path and a grounded re-eval executes. Monthly budget cap ($ TBD) attaches on assignment — enforcement via ai-invoker credit pre-check (ai-core spec CARRY). GROUNDED RE-EVAL RESULT (blind protocol, 60/60 architect-graded, seed commit 4218746, key sha 3bb85e21): glm-5 mean 4.34 ≥ 4.0 with ZERO catastrophic scores → QUALITY PASS. deepseek.v3.2 mean 4.22 but DISQUALIFIED — one catastrophic (accuracy=1, FM-1: fabricated concentration-tiered sulfuric-acid TPQ values + wrong Tier II conclusion on legal-ledger-015). Cheaper candidate rejected on the no-1s rule: fabricated regulatory thresholds are the exact failure mode this seat cannot tolerate. Shared weakness of both candidates (grader observation): completeness ~3.6-3.7 — scenario-planted obligations outside the grounding corpus were missed more often than mis-stated; grounding-corpus breadth is the production lever (obligations corpus must grow with tenant industries). |
| **Eval Evidence** | `.kiro/evidence/model-policy-evals/runs/legal-ledger-run7-20260706/report.md` + human grading at commit `645873e` (ungrounded); `.kiro/evidence/agents-existing-8/task-14-legalledger-reeval.log` + `runs/task14-grading/` (grounded, blind) |
| **$/task P50 (ungrounded)** | glm-5: $0.00582, deepseek.v3.2: $0.00335 |
| **$/task (grounded run mean)** | glm-5: $0.00490, deepseek.v3.2: $0.00295 |
| **Margin at credit pricing** | glm-5: 85.3% (ungrounded basis; grounded cost lower → margin holds, clears >50%) |
| **Monthly budget cap (COND-4)** | **RATIFIED $25/mo platform-wide, ALERT-ONLY** (owner 2026-07-10, in-session — option (a) of {(a) $25 alert-only / (b) other amount / (c) hard-block}, verbatim "a"). Never blocks serving (consistent with F-6 serve-&-bill). Enforcement live: `telemetry.credits.consumed` now carries `seat` → EventBridge rule → metric `Cumplify/AI · LegalLedgerCreditsConsumed` → daily-pace alarm (≥833 credits/day = 25,000/mo ÷ 30) + burn-rate alarm (≥250 credits/hr) → CMK-encrypted SNS → owner email. Evidence: `.kiro/evidence/agents-existing-8/cond4-cap-ratification.md` |
| **Expiry** | 2026-10-08 (90 days from grounded re-eval) |

---

### Doc-Composer (spec-40 QMS Document Engine)

| Field | Value |
|-------|-------|
| **Seat** | Doc-Composer (IMS manual + clause document generation — spec 40) |
| **Assigned Model** | `us.amazon.nova-pro-v1:0` |
| **Status** | PROVISIONAL (golden-set eval ≥4.0/5 at spec-40 Task 12 — owner ratifies there) |
| **Justification** | Same Pro-class model as Workhorse/Editor-AI, whose evals already cover fact-grounded prose + structured output at the quality bar. Output contract `{sentences:[{text,factRefs[]}]}` enforced twice: invoker schema-retry (shape) + ComposeSection deterministic checker (fact resolution, house style — code, not model). Routes to the dedicated DocGenGuardrail (BC-5, owner-approved 2026-07-14): NO PII anonymization — ACC-9 requires the tenant's own names unredacted in their manual; SSN/card BLOCK and PROMPT_ATTACK retained. All other seats keep the agent guardrail. |
| **Eval Evidence** | pending — spec-40 Task 12 golden set (`.kiro/evidence/qms-document-engine/task-12-quality.log`); seat provisioning evidence `task-4-seat.log` |
| **$/task P50** | measured from the live meter at spec-40 ACC readback (NFR-2 — meter-read, not estimated) |
| **Margin at credit pricing** | carries the workhorse weights row (same modelId — MODELWEIGHT# is keyed by model, not seat); seat-shape margin measured at Task 12 |
| **Expiry** | 2026-10-06 (nova-pro cohort re-validation date) |

---

## Campaign Summary

| Metric | Value |
|--------|-------|
| Total invocations (Tasks 7+8) | ~1,570 |
| Lifetime benchmark spend | ~$2.60 of $15 cap |
| Models evaluated | 13 (Anthropic removed pre-eval) |
| Seats assigned | 7 of 10 (3 provisional/contingent) |
| Seats unassigned | 1 (LegalLedger — retrieval-gated) |
| Quality bar recalibrations | 1 (micro: 0.95→0.90, owner ratifies) |
| Human-graded components | LegalLedger 90/90 blind, Guru spot-review, Workhorse 30%, Editor-AI 20% |

---

## Conditions and Carries

| ID | Seat | Condition | Owner |
|----|------|-----------|-------|
| COND-1 | Micro | Bar 0.90 recalibration requires owner ratification (Task 10) | Owner |
| COND-2 | Guru ISO 45001 | Retrieval-grounded re-eval at spec-4 readback before user-facing GO | spec-4 (knowledge-base) |
| COND-3 | Workhorse | (a) schema-validate + one-retry guard, (b) per-agent scaffolding, (c) re-eval per agent spec | ai-core + agent specs |
| COND-4 | LegalLedger | **SATISFIED 2026-07-10** — re-eval PASSED (Task 14, glm-5 4.34 blind); cap RATIFIED $25/mo alert-only, alarm enforcement deployed | spec-4 + ai-core |
| CARRY-AI-CORE | All seats | Invoke-time EXPIRED flag enforcement (REG-5 → ai-core) | api-core / ai-core |
