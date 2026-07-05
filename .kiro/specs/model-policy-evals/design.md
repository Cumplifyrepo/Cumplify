# Model Policy Evals — Design

**Spec:** `model-policy-evals`
**Requirements approved:** R2 (REV-1..7 applied)
**Steering rules exercised:** `00-stack-facts.md`, `12-token-metering.md`, `15-model-policy.md`, `19-kiro-truth.md`
**Revision:** R1 — initial design for architect review

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
| **Snapshot** (§5.5) | Fully automated: structured output schema, factual grounding check (key claims traceable to input) | None | High-volume, cost-sensitive; output is structured |
| **Editor-AI** (§5.5) | Schema compliance, required-section presence | Quality spot-review (20% sample) for ISO document drafting accuracy | Inline suggestions for policies/procedures need domain judgment |
| **Pain-distiller** (§5.5) | Schema compliance, extraction completeness (key pain-points identified vs ground-truth) | None | Extraction tasks with ground-truth labels |
| **LegalLedger** (§5.6) | NONE — fully human-graded | Every response reviewed by domain-qualified human (architect or legal counsel) | Highest-consequence seat: obligation-mapping errors = regulatory exposure. No automated grader can measure legal reasoning quality. |

### 2.2 LegalLedger Human-Grading Runbook Structure

File: `services/model-evals/runbooks/legal-ledger-grading.md`

```markdown
# LegalLedger Eval Grading Runbook

## Grader Qualifications
- Must understand ISO 14001 6.1.3 / 45001 6.1.3 / 9001 9.1.2 obligation structures
- Architect or designated legal-domain reviewer

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

---

## 3. Eval-Set Construction (Decision 2)

### 3.1 Ground-Truth Sources

| Tier | Source | Authoring Method | Quality Validation |
|------|--------|-----------------|-------------------|
| **Guru** (150 Q&A) | ISO 9001:2015 / 14001:2015 / 45001:2018 clause text (from the `iso-standards-kb` corpus); 50 per standard | Architect authors Q&A pairs: question phrased as a practitioner query, expected answer cites specific clause with key requirements | Architect reviews; cross-checked against the standard text |
| **Workhorse** (30 tasks) | Agent-catalog duty definitions + module-spec scenario descriptions | Architect authors representative task prompts (draft a procedure, analyze a CAPA, assess a risk) with expected output structure | Architect validates outputs against module-spec requirements |
| **Lightweight** (20 tasks) | Catalog duties for the 8 Lite-class agents | Architect authors structured-input/output pairs (register a record, track an objective) | Schema validation against expected output shape |
| **Micro** (50 examples) | Labeled routing/classification corpus: event detail-type → target queue/agent | Generated from `contracts/events.md` taxonomy (46 events) + 4 synthetic edge cases | Labels verified against routing table (spec 2 design §4) |
| **Snapshot** (30 tasks) | Pain-picker inputs → snapshot output schema (Part 2.2) | Representative industry/size/pain combinations with expected output conforming to snapshot schema | Schema + factual grounding (claims traceable to input) |
| **Editor-AI** (20 tasks) | ISO document templates: policies, procedures, CAPA records, work instructions | Input = partial document + instruction (complete section X, suggest improvement); expected output = structurally valid completion | Architect reviews structural + ISO-alignment quality |
| **Pain-distiller** (20 tasks) | Sample customer feedback + support transcripts → expected pain-point extractions | Synthetic inputs with ground-truth pain-point labels | Label coverage check (all material pain-points identified) |
| **LegalLedger** (30 scenarios) | Obligation-mapping scenarios: regulatory text + jurisdiction context → obligation register entries | Architect + legal counsel author scenarios from real 14001/45001/9001 obligation structures | Legal-domain review before benchmark |

### 3.2 Set Quality Gate

No benchmark run executes until:
1. Eval set committed to `services/model-evals/data/eval-sets/`
2. Architect sign-off on set quality (review comment on the committing PR/commit)
3. Token budget approved (§4)

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
| Guru | 150 | 6 | 900 | 1,080,000 | 540,000 | 1,620,000 | ~$4.50 |
| Workhorse | 30 | 5 | 150 | 120,000 | 60,000 | 180,000 | ~$0.60 |
| Lightweight | 20 | 4 | 80 | 64,000 | 32,000 | 96,000 | ~$0.15 |
| Micro | 50 | 2 | 100 | 20,000 | 5,000 | 25,000 | ~$0.03 |
| Snapshot | 30 | 4 | 120 | 96,000 | 48,000 | 144,000 | ~$0.25 |
| Editor-AI | 20 | 4 | 80 | 64,000 | 32,000 | 96,000 | ~$0.15 |
| Pain-distiller | 20 | 3 | 60 | 48,000 | 24,000 | 72,000 | ~$0.12 |
| LegalLedger | 30 | 4 | 120 | 180,000 | 96,000 | 276,000 | ~$2.00 |
| **TOTAL** | **350** | — | **1,610** | **1,672,000** | **837,000** | **2,509,000** | **~$7.80** |

**Worst-case estimate:** ~$7.80 for the entire campaign (using highest per-token rates across candidates). Actual will be lower because cheaper models dominate the candidate set.

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

| Tier | Mechanism | Rationale |
|------|-----------|-----------|
| Guru | **Runbook** (human spot-review required) | 20% human-graded component cannot be automated end-to-end |
| Workhorse | **Runbook** (human content-quality review required) | 30% human-graded component |
| Lightweight | **Scheduler** (EventBridge, quarterly) | Fully automated grading → can run unattended |
| Micro | **Scheduler** (EventBridge, quarterly) | Fully automated grading → can run unattended |
| Snapshot | **Scheduler** (EventBridge, quarterly) | Fully automated grading |
| Editor-AI | **Runbook** (human spot-review) | 20% human-graded |
| Pain-distiller | **Scheduler** (EventBridge, quarterly) | Fully automated |
| LegalLedger | **Runbook** (100% human-graded) | Cannot automate legal reasoning assessment |

**Scheduler seats (4):** A single EventBridge schedule (quarterly) invokes a Step Function or Lambda that runs the eval harness for Lightweight + Micro + Snapshot + Pain-distiller, commits results, and updates the Register expiry.

**Runbook seats (4):** The committed runbook documents the quarterly process: architect initiates the run, collects outputs, performs/coordinates human grading, scores, updates Register. A calendar reminder (not infrastructure) triggers the process.

---

## 8. Runner Implementation

### 8.1 CLI Interface

```bash
# Estimate cost (pre-flight, no invocations)
npx tsx services/model-evals/run.ts --seat guru --estimate-only

# Execute benchmark (requires architect approval of estimate)
npx tsx services/model-evals/run.ts --seat guru --run --approved-budget 3.00

# Single candidate (for debugging)
npx tsx services/model-evals/run.ts --seat guru --run --candidate "zai.glm-5" --approved-budget 1.00
```

### 8.2 Runner Flow

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

### 8.3 Bedrock Converse Call

```typescript
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

const response = await client.send(new ConverseCommand({
  modelId: candidate.modelId,
  messages: [{ role: 'user', content: [{ text: task.prompt }] }],
  inferenceConfig: { temperature: seatConfig.temperature, maxTokens: 4096 },
}));

// Extract token usage from response.usage
const usage = {
  inputTokens: response.usage?.inputTokens ?? 0,
  outputTokens: response.usage?.outputTokens ?? 0,
};
```

---

## 9. Scored Report Format

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

## 10. NONAG-3 Correction (architect directive)

Editor-AI eval examples cover **inline suggestions for ISO document drafting/completion** — policies, procedures, CAPA records, work instructions. NOT code. The eval set tests the model's ability to complete document sections, suggest improvements to procedures, and draft ISO-aligned content.

---

## 11. Contracts Produced / Updated

| Artifact | Action |
|----------|--------|
| `contracts/model-register.md` | **Created** — all seats, post-eval |
| `services/model-evals/` | **Created** — eval harness package |
| `services/model-evals/data/price-snapshot.json` | **Created** — Claude 4.x pricing |
| `services/model-evals/data/eval-sets/*.json` | **Created** — per-seat eval sets |
| `services/model-evals/runbooks/legal-ledger-grading.md` | **Created** — human-grading runbook |
| `.kiro/steering/15-model-policy.md` | **Modified** — owner-ratified amendment (REQUIRES-HUMAN) |
| `.kiro/evidence/model-policy-evals/` | **Created** — scored reports per seat eval |

---

## 12. Accepted Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LegalLedger grading | 100% human | Cannot automate legal reasoning; wrong obligation = regulatory exposure |
| Editor-AI temperature | 0.3 | Document drafting needs mild variation; rubric scores structure not exact wording |
| Re-validation: 4 seats automated | Scheduler (quarterly) | Fully automated grading enables unattended re-runs |
| Re-validation: 4 seats manual | Runbook | Human-graded components cannot run unattended |
| Budget cap | $15 per campaign, $3 per seat | 2× worst-case estimate with investigation margin |
| Staleness limit | 90 days | Aligns with quarterly re-validation cadence |
| Eval harness form factor | CLI tool (not Lambda) | Development-time benchmarking; no deployed infra needed |
| Micro F1 threshold | Design-decides at eval-set authoring time (recorded in eval-set metadata) | Threshold depends on routing complexity; set empirically |
