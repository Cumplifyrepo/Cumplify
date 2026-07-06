# Model Policy Evals — Design

**Spec:** `model-policy-evals`
**Requirements approved:** R2 (REV-1..7 applied)
**Steering rules exercised:** `00-stack-facts.md`, `12-token-metering.md`, `15-model-policy.md`, `19-kiro-truth.md`
**Revision:** R3 — owner decision 2026-07-06: Anthropic removed; absolute quality bars defined

---

## 1. Architecture Overview

```
services/model-evals/
├── package.json              # @cumplify/model-evals
├── tsconfig.json
├── data/
│   ├── price-snapshot.json   # Fallback pricing (Claude 4.x)
│   └── eval-sets/
│       ├── guru-iso9001.json
│       ├── guru-iso14001.json
│       ├── guru-iso45001.json
│       ├── workhorse.json
│       ├── lightweight.json
│       ├── micro-routing.json
│       ├── snapshot-pipeline.json
│       ├── editor-ai.json
│       ├── pain-distiller.json
│       └── legal-ledger.json
├── src/
│   ├── runner.ts             # Benchmark runner (Bedrock Converse)
│   ├── pricing.ts            # Pricing API + snapshot fallback
│   ├── scorer.ts             # Quality scoring (per-tier strategy)
│   ├── reporter.ts           # Scored report generator
│   ├── budget.ts             # Cost estimator + budget guard
│   └── types.ts              # Shared types
├── graders/
│   ├── exact-match.ts        # Micro tier: F1 / accuracy
│   ├── schema-validator.ts   # Structured output compliance
│   ├── clause-citation.ts    # Guru: clause-number extraction + match
│   └── rubric.ts             # Multi-dimension rubric scorer
├── run.ts                    # CLI entry: npx tsx services/model-evals/run.ts --seat <seat>
├── runbooks/
│   └── legal-ledger-grading.md  # Human-grading runbook
└── __tests__/
    ├── pricing.test.ts
    ├── scorer.test.ts
    └── budget.test.ts
```

**The eval harness is a CLI tool (NFR-4), not deployed infrastructure.** It runs in the dev account via `npx tsx` with Bedrock access. No Lambda, no stack, no CfnOutputs for the harness itself.

---

## 2. Grading Design (Decision 1)

### 2.1 Per-Tier Grading Methodology

| Tier | Automated Components | Human Components | Rationale |
|------|---------------------|-----------------|-----------|
| **Guru** (§5.1) | Clause-citation accuracy (exact-match on clause number), structured-output compliance | Factual-correctness spot-review (20% sample by architect) | Clause numbers are objective; answer quality in context requires domain judgment |
| **Workhorse** (§5.2) | JSON schema compliance, required-field presence, instruction-following checklist | Content quality assessment (CAPA root-cause depth, procedure accuracy) on 30% sample | Structured output is verifiable; reasoning quality is not |
| **Lightweight** (§5.3) | Fully automated: schema validation, task-completion flag, expected-output match | None | Tasks are simple, structured, deterministic |
| **Micro** (§5.4) | Fully automated: classification F1, exact-match labels | None | Ground-truth labels make this trivially automatable |
| **Snapshot** (§5.5) | Automated: structured output schema validation | Factual grounding spot-review (20% sample by architect — same pattern as editor-ai) | High-volume, cost-sensitive; grounding check NOT automatable as drafted (design delta R3) |
| **Editor-AI** (§5.5) | Schema compliance, required-section presence | Quality spot-review (20% sample) for ISO document drafting accuracy | Inline suggestions for policies/procedures need domain judgment |
| **Pain-distiller** (§5.5) | Schema compliance, extraction completeness (key pain-points identified vs ground-truth) | None | Extraction tasks with ground-truth labels |
| **LegalLedger** (§5.6) | NONE — fully human-graded | Every response reviewed by domain-qualified human (architect or legal counsel) | Highest-consequence seat: obligation-mapping errors = regulatory exposure. No automated grader can measure legal reasoning quality. |

### 2.2 LegalLedger Human-Grading Runbook Structure

File: `services/model-evals/runbooks/legal-ledger-grading.md`

```markdown
# LegalLedger Eval Grading Runbook

## Grader Qualifications
- Architect (sole grader in P1) — must understand ISO 14001 6.1.3 / 45001 6.1.3 / 9001 9.1.2 obligation structures
- OWNER DECISION (REQUIRES-HUMAN): whether to engage external legal review for grading validation is an owner decision recorded in the Register; no legal counsel exists on staff

## Per-Response Grading Criteria (1-5 scale each)
1. **Obligation identification:** correct obligations extracted from scenario
2. **Regulatory mapping:** correct standard/clause cited for each obligation
3. **Risk classification:** appropriate severity/priority assigned
4. **Completeness:** no material obligations missed
5. **Accuracy:** no fabricated or misattributed obligations

## Pass Threshold
- Mean score >= 4.0 across all criteria
- No individual response scores 1 on any criterion (catastrophic failure)

## Process
1. Runner produces raw model outputs (committed)
2. Grader reviews BLIND (model identity hidden — outputs shuffled)
3. Grader scores each response on the 5 criteria
4. Scores committed to evidence with grader identity + timestamp
5. Scoring aggregated by runner post-grading → final pass/fail + $/task
```

### 2.3 Absolute Quality Bars (R3 — no anchor)

With Anthropic removed, quality bars are ABSOLUTE per tier (not relative to an incumbent):

| Tier | Quality Bar | Rationale |
|------|------------|-----------|
| **Guru** | Clause-citation mean >= 85% + architect spot-review confirms on human sample | Clause accuracy is measurable; 85% = 128/150 clauses correctly cited |
| **Workhorse** | Schema compliance 100% AND task-correctness >= 85% | Structured output must be perfect; content quality threshold 85% |
| **Lightweight** | Task correctness >= 90% | Simple structured tasks; high bar appropriate |
| **Micro** | Multi-label set-F1 >= 0.95 | Classification must be near-perfect for routing |
| **Snapshot** | Schema compliance 100% + architect spot-review (20% sample) for factual grounding | Output structure must be valid; grounding check is NOT automatable — requires human judgment on whether claims trace to input (design delta, truth incident #7 lesson) |
| **Editor-AI** | Schema compliance 100% + architect spot-review confirms quality on 20% sample | Document drafting quality requires human judgment |
| **Pain-distiller** | Label coverage >= 85% (ground-truth pain-points identified) | Extraction completeness is the key metric |
| **LegalLedger** | Rubric mean >= 4.0, no criterion at 1 (unchanged — already anchor-free) | Human-graded; catastrophic failure = disqualification |

---

## 3. Eval-Set Construction (Decision 2)

### 3.1 Ground-Truth Sources

| Tier | Source | Authoring Method | Quality Validation |
|------|--------|-----------------|-------------------|
| **Guru** (150 Q&A) | Ground truth = the COMMITTED corpus artifacts: `docs/architecture/iso-requirements-map.md`, `iso-coverage-matrix.md`, `agent-catalog.md` clause coverage sections. Contains clause numbers + paraphrased requirements. **Limitation (stated in every scored report):** grading measures consistency with OUR corpus maps, not verification against official standard text. Valid for seat selection because all candidates face identical ground truth (relative ranking). | Architect authors Q&A pairs: question phrased as a practitioner query, expected answer cites specific clause number with paraphrased requirements from the corpus maps. NO verbatim ISO standard text committed. | Architect reviews; cross-checked against the committed corpus maps |
| **Workhorse** (30 tasks) | Agent-catalog duty definitions + module-spec scenario descriptions | Architect authors representative task prompts (draft a procedure, analyze a CAPA, assess a risk) with expected output structure | Architect validates outputs against module-spec requirements |
| **Lightweight** (20 tasks) | Catalog duties for the 8 Lite-class agents | Architect authors structured-input/output pairs (register a record, track an objective) | Schema validation against expected output shape |
| **Micro** (50 examples) | Labeled routing/classification corpus: event detail-type → target queue/agent | Generated from `contracts/events.md` taxonomy (46 events) + 4 synthetic edge cases | Labels verified against routing table (spec 2 design §4) |
| **Snapshot** (30 tasks) | Pain-picker inputs → snapshot output schema (Part 2.2) | Representative industry/size/pain combinations with expected output conforming to snapshot schema | Schema + factual grounding (claims traceable to input) |
| **Editor-AI** (20 tasks) | ISO document templates: policies, procedures, CAPA records, work instructions | Input = partial document + instruction (complete section X, suggest improvement); expected output = structurally valid completion | Architect reviews structural + ISO-alignment quality |
| **Pain-distiller** (20 tasks) | Sample customer feedback + support transcripts → expected pain-point extractions | Synthetic inputs with ground-truth pain-point labels | Label coverage check (all material pain-points identified) |
| **LegalLedger** (30 scenarios) | Obligation-mapping scenarios sourced from PUBLIC-DOMAIN regulatory texts (OSHA/EPA regulations, statutes) + the corpus clause framing for 14001 6.1.3 / 45001 6.1.3 / 9.1.2. NO licensed ISO text required — scenarios use regulatory obligations that map TO ISO clause structures. | Architect authors scenarios: regulatory text context (public-domain) + jurisdiction + expected obligation register entries mapped to ISO clause numbers | Architect domain review before benchmark. OWNER DECISION (REQUIRES-HUMAN): whether to engage external legal review for grading validation. |

### 3.2 Non-Agent Seat Candidate Lists (DREV-3)

| Seat | Incumbent | Candidates | Count | Notes |
|------|-----------|-----------|-------|-------|
| **Snapshot pipeline** | nova-pro | nova-lite, nova-2-lite, glm-4.7-flash | 4 | Most cost-sensitive seat (~$0.03–0.08/run); lightweight models preferred |
| **Editor-AI** | nova-pro | nova-lite, deepseek.v3.2, glm-4.7 | 4 | Document drafting needs quality; Pro-class challengers appropriate |
| **Pain-distiller** | nova-pro | deepseek.v3.2, qwen.qwen3-next-80b-a3b | 3 | Extraction + synthesis; Pro-class |

These counts match the §4.2 budget table (Snapshot 4, Editor-AI 4, Pain-distiller 3).

### 3.3 Set Quality Gate

No benchmark run executes until:
1. Eval set committed to `services/model-evals/data/eval-sets/`
2. Architect sign-off on set quality (review comment on the committing PR/commit)
3. Token budget approved (§4)

### 3.4 Ground-Truth Limitations & Carries (DREV-2)

**Owner ruling (2026-07-05):** NO licensed ISO standard copies will be purchased for the build. In the product, tenants upload their OWN licensed standards (tenant responsibility).

**Consequence for evals:** Guru ground-truth is the committed corpus (iso-requirements-map, iso-coverage-matrix) — clause numbers + architect-paraphrased requirements. Every scored report states this limitation: "Grading measures consistency with Cumplify corpus maps, not verification against official ISO standard text. Valid for model selection because all candidates face identical ground truth (relative ranking)."

**NAMED CARRY to spec 4 (knowledge-base):** `iso-standards-kb` becomes a tenant-upload-based per-tenant index (corpus v7 amendment). The Snapshot pipeline (pre-auth, tenant-less) grounds on model knowledge + Cumplify's own authored baselines, never ISO text.

**Snapshot grounding:** The Snapshot eval set tests model ability to produce a structured readiness assessment from industry/pain inputs using general ISO knowledge. No standard text is provided as context — the model relies on its training knowledge of ISO frameworks (same as the product experience for unauthenticated Snapshot users who haven't uploaded standards yet).

---

## 4. Token Budget + Cost Estimate (Decision 3)

### 4.1 Assumptions

- Average input tokens/task: ~800 (prompt + context + eval question)
- Average output tokens/task: ~400 (model response)
- Guru: longer context (clause text) → ~1200 input, ~600 output
- LegalLedger: complex scenarios → ~1500 input, ~800 output
- Micro: short classification → ~200 input, ~50 output

### 4.2 Budget Table (full benchmark campaign)

| Tier | Tasks | Candidates | Invocations | Est. Input Tokens | Est. Output Tokens | Est. Total Tokens | Est. Cost (worst-case) |
|------|-------|-----------|-------------|-------------------|--------------------|--------------------|----------------------|
| Guru | 150 | 5 | 750 | 900,000 | 450,000 | 1,350,000 | ~$3.75 |
| Workhorse | 30 | 5 | 150 | 120,000 | 60,000 | 180,000 | ~$0.60 |
| Lightweight | 20 | 4 | 80 | 64,000 | 32,000 | 96,000 | ~$0.15 |
| Micro | 50 | 2 | 100 | 20,000 | 5,000 | 25,000 | ~$0.03 |
| Snapshot | 30 | 4 | 120 | 96,000 | 48,000 | 144,000 | ~$0.25 |
| Editor-AI | 20 | 4 | 80 | 64,000 | 32,000 | 96,000 | ~$0.15 |
| Pain-distiller | 20 | 3 | 60 | 48,000 | 24,000 | 72,000 | ~$0.12 |
| LegalLedger | 30 | 3 | 90 | 135,000 | 72,000 | 207,000 | ~$1.50 |
| **TOTAL** | **350** | — | **1,370** | **1,427,000** | **717,000** | **2,144,000** | **~$6.55** |

**Worst-case estimate:** ~$6.55 for the entire campaign (using highest per-token rates across candidates). Actual will be lower because cheaper models dominate the candidate set.

**Budget cap (hard halt):** $15.00 per full campaign run (2× worst-case margin for retries/reruns). The runner halts with error if cumulative spend exceeds this.

**Per-seat cap:** $3.00 (any single seat exceeding this halts with error for investigation).

### 4.3 Cost Estimate Validation

The runner outputs this table BEFORE executing (EV-6). Architect must approve the estimate (confirmed in evidence log) before the run proceeds.

---

## 5. Temperature Policy (Decision 4)

| Tier | Temperature | Justification |
|------|-------------|---------------|
| Guru | 0 | Factual Q&A — determinism required for reproducible scoring |
| Workhorse | 0 | Structured output — consistency for schema validation |
| Lightweight | 0 | Deterministic tasks |
| Micro | 0 | Classification — must be reproducible |
| Snapshot | 0 | Structured output schema |
| Editor-AI | 0.3 | Document drafting benefits from mild variation; scored on structure not exact wording |
| Pain-distiller | 0 | Extraction — deterministic |
| LegalLedger | 0 | Legal reasoning — determinism required; any non-determinism would compromise grading |

**Exception:** Editor-AI uses temperature 0.3 because document-drafting tasks (completing a policy section, suggesting procedure improvements) produce unnaturally repetitive output at temperature 0. The grading rubric scores structural compliance, not exact wording, so mild variation does not affect scoring validity.

---

## 6. Price-Snapshot Mechanics (Decision 5)

### 6.1 File Schema (`services/model-evals/data/price-snapshot.json`)

```json
{
  "capturedAt": "2026-07-05T00:00:00Z",
  "sourceUrl": "https://aws.amazon.com/bedrock/pricing/",
  "capturedBy": "architect",
  "stalenessLimitDays": 90,
  "models": {
    "us.anthropic.claude-sonnet-4-6": {
      "inputPricePerMToken": 3.00,
      "outputPricePerMToken": 15.00,
      "unit": "USD per 1M tokens",
      "notes": "Not available in Pricing API (only Claude 2/3-era entries exist)"
    }
  }
}
```

### 6.2 Provenance Fields (required)

- `capturedAt`: ISO 8601 timestamp of price capture
- `sourceUrl`: public pricing page URL
- `capturedBy`: identity of the person who verified the price
- `stalenessLimitDays`: max days before the snapshot is considered stale (default: 90 — aligns with quarterly re-validation)

### 6.3 Staleness Rule

A snapshot older than `stalenessLimitDays` from the current run date **fails the run** with:
```
ERROR: Price snapshot for us.anthropic.claude-sonnet-4-6 is stale
       (captured 2026-07-05, limit 90 days, today 2026-10-15).
       Update price-snapshot.json before running.
```

The runner checks staleness BEFORE any invocations (part of the pre-flight budget estimate step).

---

## 7. Re-Validation Mechanism (Decision 6)

**ARCHITECT RULING (DREV-1):** ALL 8 seats are runbook-initiated in P1. No scheduled Lambda or Step Function — that would violate C-4 (unattended Bedrock spend without architect-approved estimate) and NFR-4/§1 (harness is CLI, not deployed infra).

### 7.1 Quarterly Cadence

A single re-validation runbook (`services/model-evals/runbooks/quarterly-revalidation.md`) documents the quarterly process for ALL seats:

1. Architect checks Register for entries approaching expiry (< 30 days remaining)
2. Architect runs `--estimate-only` for each expiring seat
3. Architect approves budget (evidence logged)
4. Architect runs `--run` for automated-grading seats; initiates human-grading process for human-graded seats
5. Scored reports committed; Register entries updated with new expiry
6. Any newly accessible Bedrock models added to candidate lists (REVAL-4)

### 7.2 Staleness Visibility

Register expiry dates + REVAL-3's EXPIRED flag provide staleness visibility with zero infrastructure. An EXPIRED entry is a standing process signal — the quarterly runbook catches it.

### 7.3 Future Option (not built in P1)

Automation (Scheduler → Lambda → harness) is contingent on a standing-approval mechanism: a pre-approved quarterly budget recorded in the Register per seat. Until that mechanism is designed (future spec), all runs require explicit architect approval per C-4.

| Tier | Grading Type | Re-Validation Process |
|------|-------------|----------------------|
| Guru | Mixed (automated + 20% human spot-review) | Runbook: architect initiates, reviews human-graded sample |
| Workhorse | Mixed (automated + 30% human review) | Runbook: architect initiates, reviews content quality |
| Lightweight | Fully automated | Runbook: architect approves budget, runs CLI, commits results |
| Micro | Fully automated | Runbook: architect approves budget, runs CLI, commits results |
| Snapshot | Fully automated | Runbook: architect approves budget, runs CLI, commits results |
| Editor-AI | Mixed (automated + 20% human review) | Runbook: architect initiates, reviews document quality |
| Pain-distiller | Fully automated | Runbook: architect approves budget, runs CLI, commits results |
| LegalLedger | 100% human-graded | Runbook: architect initiates, performs blind grading, scores |

---

## 8. Division of Labor (DREV-5)

| Work Item | Executor | Rationale |
|-----------|----------|-----------|
| Guru eval set (150 Q&A) | **[ARCHITECT]** | Requires domain expertise + committed corpus maps (iso-requirements-map, iso-coverage-matrix) |
| LegalLedger eval set (30 scenarios) | **[ARCHITECT]** | Requires domain expertise + public-domain regulatory texts + corpus clause framing |
| Micro eval set (50 examples) | **[KIRO]** — draft from `contracts/events.md` (46 registered events + 4 synthetic edge cases at authoring time) | Machine-derivable from committed taxonomy |
| Lightweight eval set (20 tasks) | **[KIRO]** — draft from catalog duty definitions + module-spec schemas | Structured tasks derivable from committed specs |
| Snapshot eval set (30 tasks) | **[KIRO]** — draft from Part 2.2 snapshot schema (no ISO text context — model general knowledge) | Structured I/O derivable from committed schema |
| Pain-distiller eval set (20 tasks) | **[KIRO]** — draft synthetic inputs with ground-truth labels | Pattern-based extraction tasks |
| Editor-AI eval set (20 tasks) | **[KIRO]** — draft from document templates/schemas | Structured completion tasks |
| Workhorse eval set (30 tasks) | **[KIRO]** — draft from catalog duty definitions | Representative scenarios from committed specs |
| ALL eval-set validation | **[ARCHITECT]** | §3.3 quality gate: no run without architect sign-off |
| ALL benchmark runs | **[ARCHITECT]**-witnessed | C-4: no unattended Bedrock spend |
| Human grading (Guru spot-review, Workhorse, Editor-AI, LegalLedger) | **[ARCHITECT]** | Domain judgment required |
| Eval harness code (`services/model-evals/`) | **[KIRO]** | Standard TypeScript implementation |
| Register assembly | **[KIRO]** — post-eval, from scored reports | Mechanical assembly from evidence |
| Steering 15 amendment | **[KIRO]** — draft; **[OWNER]** ratifies (REQUIRES-HUMAN) | Owner policy change |

**tasks.md must tag each task [KIRO] or [ARCHITECT] accordingly.**

---

## 9. Runner Implementation

### 9.1 CLI Interface

```bash
# Estimate cost (pre-flight, no invocations)
npx tsx services/model-evals/run.ts --seat guru --estimate-only

# Execute benchmark (requires architect approval of estimate)
npx tsx services/model-evals/run.ts --seat guru --run --approved-budget 3.00

# Single candidate (for debugging)
npx tsx services/model-evals/run.ts --seat guru --run --candidate "zai.glm-5" --approved-budget 1.00
```

### 9.2 Runner Flow

```
1. Load eval set for seat
2. Load pricing (Pricing API → fallback to snapshot; check staleness)
3. Compute cost estimate → display table (EV-6)
4. If --estimate-only: exit 0
5. If --run: check --approved-budget >= estimate; halt if insufficient
6. For each candidate:
   a. For each task in eval set:
      - Call Bedrock Converse (temperature per §5)
      - Record: response, input_tokens, output_tokens, latency_ms
      - Accumulate cost; halt if per-seat cap exceeded
   b. Score responses (automated grader per tier)
   c. Compute $/task (P50, P95) from actual token usage × price
7. Rank candidates: quality-pass first, then by $/task
8. Generate scored report → stdout + file
9. Exit 0 (success) or exit 1 (budget exceeded / error)
```

### 9.3 Bedrock Converse Call

```typescript
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

const response = await client.send(new ConverseCommand({
  modelId: candidate.modelId,
  messages: [{ role: 'user', content: [{ text: task.prompt }] }],
  inferenceConfig: { temperature: seatConfig.temperature, maxTokens: seatConfig.maxTokens },
}));

// Extract token usage from response.usage
const usage = {
  inputTokens: response.usage?.inputTokens ?? 0,
  outputTokens: response.usage?.outputTokens ?? 0,
};
```

### 9.4 Per-Seat maxTokens Configuration (DREV-7)

| Seat | maxTokens | Rationale |
|------|-----------|-----------|
| Guru | 2048 | Clause Q&A answers are focused; 600 tokens typical |
| Workhorse | 4096 | Document drafts, CAPA analysis can be lengthy |
| Lightweight | 1024 | Short structured outputs |
| Micro | 256 | Classification labels only |
| Snapshot | 2048 | Structured snapshot output |
| Editor-AI | 4096 | Document section completion |
| Pain-distiller | 2048 | Extraction summaries |
| LegalLedger | 8192 | Complex obligation mapping; `moonshot.kimi-k2-thinking` emits reasoning tokens as output — actual generation may exceed the 800-token estimate significantly |

**Note on reasoning models:** `moonshot.kimi-k2-thinking` (LegalLedger candidate) emits chain-of-thought reasoning tokens as part of its output. This means LegalLedger per-task output may far exceed the 800-token average estimate. The per-seat budget cap ($3.00) halts overruns, but the §4.2 estimate should be read as a planning figure, not a ceiling. Actual LegalLedger cost will be determined by the first run's real token consumption.

---

## 10. Scored Report Format

```markdown
# Eval Report: <seat> — <timestamp>

## Summary
| Candidate | Quality Pass | $/task P50 | $/task P95 | Margin Headroom | Rank |
|-----------|-------------|-----------|-----------|-----------------|------|

## Winner: <model> (lowest $/task among quality-passers)

## Per-Candidate Details
### <model>
- Quality score: X/Y (Z%)
- Token usage: input P50/P95, output P50/P95
- $/task: P50 $X.XXXX, P95 $X.XXXX
- Margin at credit pricing: XX% (>50% mandate: PASS/FAIL)
- Pricing source: live-api | snapshot-priced (captured <date>)

## Methodology
- Eval set: <path>, <N> tasks
- Grading: <automated|human-reviewed|mixed>
- Temperature: <value>
- Budget consumed: $X.XX of $Y.YY approved
```

---

## 11. NONAG-3 Correction (architect directive)

Editor-AI eval examples cover **inline suggestions for ISO document drafting/completion** — policies, procedures, CAPA records, work instructions. NOT code. The eval set tests the model's ability to complete document sections, suggest improvements to procedures, and draft ISO-aligned content.

---

## 12. Margin-Inputs Data File (DREV-6)

### 12.1 Schema (`services/model-evals/data/margin-inputs.json`)

```json
{
  "capturedAt": "2026-07-05T00:00:00Z",
  "source": "cumplify-CONSOLIDATED-master-architecture-v7-full.md Parts 17/22",
  "capturedBy": "architect",
  "creditPricingPerTask": {
    "guru": { "creditsPerTask": 5, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.0198 },
    "workhorse": { "creditsPerTask": 3, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.01188 },
    "lightweight": { "creditsPerTask": 1, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.00396 },
    "micro": { "creditsPerTask": 0.5, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.00198 },
    "snapshot": { "creditsPerTask": 2, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.00792 },
    "editor-ai": { "creditsPerTask": 2, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.00792 },
    "pain-distiller": { "creditsPerTask": 3, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.01188 },
    "legal-ledger": { "creditsPerTask": 10, "pricePerCredit": 0.00396, "effectivePricePerTask": 0.0396 }
  },
  "marginMandate": 0.50,
  "notes": "Credit pricing from Part 22 (25,000 credits = $99 → $0.00396/credit). Credits per task are ESTIMATES pending product pricing finalization — the architect updates this file when pricing is confirmed."
}
```

### 12.2 Margin Computation in Reports

The scored report's "Margin at credit pricing" line computes:

```
margin = 1 - (model_cost_per_task / effective_price_per_task)
```

Where `model_cost_per_task` = actual measured $/task from the eval, and `effective_price_per_task` comes from `margin-inputs.json`. A margin < 50% means the model FAILS the margin bar and is not eligible for assignment.

### 12.3 Provenance

Same provenance discipline as `price-snapshot.json`: `capturedAt`, `source`, `capturedBy`. Updated when credit pricing changes (owner decision).

---

## 13. Contracts Produced / Updated

| Artifact | Action |
|----------|--------|
| `contracts/model-register.md` | **Created** — all seats, post-eval |
| `services/model-evals/` | **Created** — eval harness package |
| `services/model-evals/data/price-snapshot.json` | **Created** — Claude 4.x pricing |
| `services/model-evals/data/margin-inputs.json` | **Created** — credit pricing per task class (Parts 17/22) |
| `services/model-evals/data/eval-sets/*.json` | **Created** — per-seat eval sets |
| `services/model-evals/runbooks/legal-ledger-grading.md` | **Created** — human-grading runbook |
| `services/model-evals/runbooks/quarterly-revalidation.md` | **Created** — re-validation process for all 8 seats |
| `.kiro/steering/15-model-policy.md` | **Modified** — owner-ratified amendment (REQUIRES-HUMAN) |
| `.kiro/evidence/model-policy-evals/` | **Created** — scored reports per seat eval |

---

## 14. Accepted Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LegalLedger grading | 100% human (architect only; owner decides on external legal — REQUIRES-HUMAN) | Cannot automate legal reasoning; no legal counsel on staff |
| Editor-AI temperature | 0.3 | Document drafting needs mild variation; rubric scores structure not exact wording |
| Re-validation: ALL 8 seats | Runbook-initiated (DREV-1) | C-4 forbids unattended Bedrock spend; NFR-4 forbids deployed Lambdas for harness |
| Future automation | Contingent on standing-approval mechanism in Register | Not built in P1 |
| Budget cap | $15 per campaign, $3 per seat | 2× worst-case estimate with investigation margin |
| Staleness limit | 90 days | Aligns with quarterly re-validation cadence |
| Eval harness form factor | CLI tool (not Lambda) | Development-time benchmarking; no deployed infra needed |
| maxTokens | Per-seat config (256–8192) | Seats have vastly different output lengths; reasoning models emit extra tokens |
| Guru/LegalLedger ground-truth | Guru: corpus maps (iso-requirements-map, iso-coverage-matrix); LegalLedger: public-domain regulatory texts + corpus clause framing. NO licensed ISO copies purchased (owner ruling 2026-07-05). Verbatim ISO text never committed. | Valid for relative ranking: all candidates face identical ground truth |
| Non-agent candidates | Named per §3.2 (Snapshot: 4, Editor-AI: 4, Pain-distiller: 3) | Budget table alignment; challengers from verified-accessible set |
| Margin input source | `margin-inputs.json` with provenance | Single auditable artifact for credit pricing; updated when pricing changes |
