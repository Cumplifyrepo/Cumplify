# Model Policy Evals — Requirements (EARS Format)

**Spec:** `model-policy-evals`
**Spine references:** Part 30 (Model Policy, Register, eval gate 30.3), Part 27 (>50% net mandate), Part 22 (token metering/credit pricing)
**Source documents:**
- `.kiro/steering/15-model-policy.md` — to be AMENDED by this spec via the Register
- `.kiro/steering/12-token-metering.md` — one-door rule (unchanged)
- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — Parts 27, 30, 36
- `docs/architecture/agent-catalog.md` — 22 agents, seat assignments
- `.kiro/evidence/phase-0-gate/bedrock-access-probe*.log` — accessible models (2026-07-05)

**Owner policy amendment (2026-07-05, supersedes steering 15 where conflict):**
The model default is no longer "the Nova family" — it is THE LOWEST-$/TASK MODEL ON BEDROCK THAT PASSES THE SEAT'S EVAL BAR. Anthropic models only where the eval justifies the premium, always with a hard monthly budget cap. The one-door rule (12-token-metering) and the Register discipline are UNCHANGED.

**Revision:** R1 — initial draft for architect review

---

## 1. Constraints

| ID | Constraint |
|----|-----------|
| C-1 | The eval harness may call Bedrock Converse directly WITHIN `services/model-evals` ONLY — it is the measurement instrument. Product code retains the one-door rule; a direct bedrock-runtime call anywhere else fails review. |
| C-2 | Margin bar: every seat's measured $/task must clear the Part 27 >50% net mandate at planned credit pricing. A model that passes quality but fails margin is not eligible. |
| C-3 | Prices are NEVER hardcoded. The eval runner pulls live pricing from the Bedrock/Pricing API at run time and computes $/task from actual token usage × live price. |
| C-4 | Eval-set sizes and per-run token budgets require architect approval before any full benchmark run executes. Runs are architect-witnessed. |
| C-5 | All P0/P1 build rules carry forward: NodejsFunction node22/ARM64/512MB, no hardcoded names, CfnOutputs, Nag zero, template assertions for L1 details, evidence from executed commands only, rules 7-8, checkbox + evidence per task commit. |
| C-6 | The Register (`contracts/model-register.md`) is append-only. Amendments to steering 15 flow through the Register and are flagged REQUIRES-HUMAN for owner ratification. |
| C-7 | Nova Premier v1 is LEGACY + not invocable — removed from consideration for all seats. |

---

## 2. Accessible Models (architect-verified 2026-07-05)

| Model | Profile ID | Available |
|-------|-----------|-----------|
| Nova Micro v1 | `us.amazon.nova-micro-v1:0` | ✓ |
| Nova Lite v1 | `us.amazon.nova-lite-v1:0` | ✓ |
| Nova Pro v1 | `us.amazon.nova-pro-v1:0` | ✓ |
| Nova 2 Lite | `us.amazon.nova-2-lite-v1:0` | ✓ |
| Qwen3 Next 80B A3B | (cross-region) | ✓ |
| Qwen3 32B | (cross-region) | ✓ |
| GLM 5 | (cross-region) | ✓ |
| GLM 4.7 | (cross-region) | ✓ |
| GLM 4.7 Flash | (cross-region) | ✓ |
| DeepSeek v3.2 | (cross-region) | ✓ |
| MiniMax M2.5 | (cross-region) | ✓ |
| Kimi K2.5 | (cross-region) | ✓ |
| Claude Sonnet 4.6 | `us.anthropic.claude-sonnet-4-6` | ✓ (incumbent anchor) |

**Evidence:** `.kiro/evidence/phase-0-gate/bedrock-access-probe*.log`

---

## 3. Model Justification Register

| ID | Requirement (EARS) |
|----|-------------------|
| REG-1 | **The spec shall** produce `contracts/model-register.md` as an append-only Model Justification Register. |
| REG-2 | **Every seat entry in the Register shall** contain: model ID, seat/duty, justification narrative, eval evidence link (commit + file path), measured $/task (P50 and P95), margin headroom at credit pricing, expiry/review date (max 1 quarter). |
| REG-3 | **The Register shall** list ALL agent seats (22 agents from the catalog + Snapshot + editor-AI + pain-distiller), each with its assigned model and justification. |
| REG-4 | **No model assignment shall** be recorded without executed eval evidence (quality pass + cost measurement). |
| REG-5 | **The Register format shall** support quarterly re-validation: each entry carries an expiry date; an expired entry without re-validation blocks the seat from invoking until renewed. |

---

## 4. Eval Harness (`services/model-evals`)

| ID | Requirement (EARS) |
|----|-------------------|
| EV-1 | **The eval harness shall** reside in `services/model-evals/` as a workspace package (`@cumplify/model-evals`). |
| EV-2 | **The runner shall** benchmark candidates via Bedrock Converse API, record exact token usage (input tokens, output tokens) per invocation, and compute $/task from `usage × live_price`. |
| EV-3 | **The runner shall** pull pricing from the AWS Pricing API (or Bedrock GetFoundationModelAvailability) at run time. Prices are NEVER hardcoded (C-3). |
| EV-4 | **The scoring pipeline shall** apply quality bar FIRST (pass/fail against the incumbent anchor), then rank passers by $/task (lowest wins). |
| EV-5 | **The eval harness shall** support per-seat eval sets with distinct scoring methodologies (see §5). |
| EV-6 | **Before a full benchmark run,** the harness shall output a cost estimate (eval-set size × estimated tokens/task × price) for architect approval (C-4). |
| EV-7 | **Each eval run shall** produce a scored report: per-candidate results (quality score, $/task P50/P95, token usage breakdown), ranking, and pass/fail verdict. Committed to `.kiro/evidence/model-policy-evals/`. |

---

## 5. Seat Eval Tiers & Grading

### 5.1 Guru Seats (ISO 9001/14001/45001 clause Q&A)

| ID | Requirement (EARS) |
|----|-------------------|
| GURU-1 | **The Guru eval set shall** consist of clause-grounded Q&A pairs (minimum 50 per standard, 150 total) with expected answers citing specific ISO clause numbers. |
| GURU-2 | **Candidates:** glm-5, deepseek.v3.2, qwen3-next-80b, kimi-k2.5, nova-pro. **Anchor:** sonnet-4-6. |
| GURU-3 | **Scoring shall** measure: (a) clause-citation accuracy (correct clause identified), (b) answer factual correctness (grounded in standard text), (c) hallucination rate (claims not supported by standard). |
| GURU-4 | **Grading methodology (design decides):** automated rubric scoring where measurable (clause-citation = exact match), with human spot-review for subjective correctness on a sampled subset. The design must declare which components are automated vs. human-graded. |

### 5.2 Workhorse Tier (10 Pro-class agents)

| ID | Requirement (EARS) |
|----|-------------------|
| WORK-1 | **The workhorse eval set shall** consist of agent-task scenarios representative of the 10 Pro-class agents' duties (document drafting, CAPA workflow, risk assessment, audit planning). Minimum 30 tasks. |
| WORK-2 | **Candidates:** nova-pro (incumbent), deepseek.v3.2, qwen3-next-80b, glm-4.7, minimax-m2.5. |
| WORK-3 | **Scoring shall** measure: (a) task completion correctness, (b) instruction following (structured output compliance), (c) $/task. |
| WORK-4 | **Grading methodology:** automated where structured output is verifiable (JSON schema compliance, required field presence); human-graded for quality of generated content (accuracy of drafted procedures, CAPA root-cause analysis depth). |

### 5.3 Lightweight Tier

| ID | Requirement (EARS) |
|----|-------------------|
| LITE-1 | **The lightweight eval set shall** cover the 7 Lite-class agent duties (record registration, objective tracking, context mapping). Minimum 20 tasks. |
| LITE-2 | **Candidates:** nova-lite (incumbent), nova-2-lite, glm-4.7-flash, qwen3-32b. |
| LITE-3 | **Scoring:** task correctness + $/task. Automated grading (structured output validation). |

### 5.4 Micro/Routing Tier

| ID | Requirement (EARS) |
|----|-------------------|
| MICRO-1 | **The micro eval set shall** cover classification and routing accuracy. Minimum 50 examples with ground-truth labels. |
| MICRO-2 | **Candidates:** nova-micro (incumbent), glm-4.7-flash. |
| MICRO-3 | **Scoring:** classification accuracy (F1 score), latency, $/task. Fully automated (exact-match grading). |

### 5.5 LegalLedger Seat (highest-consequence)

| ID | Requirement (EARS) |
|----|-------------------|
| LEGAL-1 | **The LegalLedger eval set shall** cover statutory/legal-text interpretation across the three jurisdiction-heavy domains (14001 6.1.3, 45001 6.1.3, 9.1.2). Minimum 30 obligation-mapping scenarios. |
| LEGAL-2 | **Candidates:** sonnet-4-6 (incumbent) WITH monthly budget cap, glm-5, deepseek.v3.2, kimi-k2.5-thinking. |
| LEGAL-3 | **Grading:** HUMAN-REVIEWED for every response. This is the highest-consequence seat — a wrong obligation mapping is regulatory exposure. No automated grader pretends to measure legal reasoning. |
| LEGAL-4 | **The spec shall** produce a human-grading runbook (not a Lambda) for LegalLedger eval scoring. |
| LEGAL-5 | **The monthly budget cap for LegalLedger shall** be recorded in the Register with the dollar amount and enforcement mechanism (credit-balance pre-check in ai-invoker). |

---

## 6. Quarterly Re-Validation

| ID | Requirement (EARS) |
|----|-------------------|
| REVAL-1 | **A re-validation mechanism shall** exist to re-benchmark assigned models quarterly against new candidates. |
| REVAL-2 | **The mechanism shall** be either: (a) an EventBridge Scheduler job invoking the eval runner for automated-grading seats, OR (b) a committed runbook for human-graded seats — honest choice per grading design (do not automate what cannot be automated). |
| REVAL-3 | **Register entries past their expiry date without re-validation shall** be flagged as EXPIRED in the Register. |
| REVAL-4 | **The re-validation scope shall** include any newly accessible models on Bedrock (the candidate set is OPEN — new models are candidates by default). |

---

## 7. Steering 15 Amendment

| ID | Requirement (EARS) |
|----|-------------------|
| STEER-1 | **This spec shall** produce an amended `15-model-policy.md` reflecting: (a) the owner policy amendment (lowest-$/task that passes eval bar, not Nova-default), (b) the specific model assignments determined by evals (a)-(e), (c) the Register as the source of truth for all assignments. |
| STEER-2 | **The steering amendment shall** be flagged REQUIRES-HUMAN — the owner ratifies the new model ladder before merge. |
| STEER-3 | **The amended steering shall** preserve the one-door rule (12-token-metering) and the Register discipline unchanged. |
| STEER-4 | **Nova Premier v1 references shall** be removed (LEGACY, not invocable). |

---

## 8. Non-Functional Requirements

| ID | Requirement (EARS) |
|----|-------------------|
| NFR-1 | **The eval runner shall** execute within the dev account (697114252993) using Bedrock in us-east-1. |
| NFR-2 | **Each eval run shall** complete within the per-run token budget approved by the architect. Budget overruns halt the run with a clear error (never silently exceed). |
| NFR-3 | **Eval results shall** be deterministic where possible: temperature 0 for all candidates unless the seat requires creativity (design decides). |
| NFR-4 | **The eval harness shall** be runnable as a CLI tool (`npx tsx services/model-evals/run.ts --seat <seat>`) — not a deployed Lambda. It is a development-time benchmarking tool. |

---

## 9. Acceptance Criteria

| # | Criterion |
|---|-----------|
| ACC-1 | `contracts/model-register.md` exists with every seat justified: model, eval evidence, $/task, margin headroom, expiry. |
| ACC-2 | Seat evals (a)-(e) executed with real Bedrock invocations; scored reports committed to `.kiro/evidence/model-policy-evals/`. |
| ACC-3 | Steering 15 amended + owner-ratified (REQUIRES-HUMAN sign-off recorded). |
| ACC-4 | Re-validation mechanism in place (scheduler or runbook per seat, honest choice). |
| ACC-5 | LegalLedger monthly budget cap recorded in the Register with enforcement mechanism documented. |
| ACC-6 | Every model's $/task clears the >50% net margin mandate at credit pricing. |

---

## 10. Out of Scope

| Item | Reason |
|------|--------|
| Agent implementation | Agents are built in their own specs; this spec only benchmarks model candidates. |
| Product ai-invoker service | The one-door layer is a separate spec (ai-core). |
| Prompt engineering | Eval sets test model capability, not prompt optimization. |
| Guardrails configuration | CfnGuardrail is Part 35 / spec-specific. |
| Staging/prod deployment of eval infra | Eval harness is dev-only CLI tooling (NFR-4). |
| Model fine-tuning | Out of scope for P1; eval assumes base models as-is. |
