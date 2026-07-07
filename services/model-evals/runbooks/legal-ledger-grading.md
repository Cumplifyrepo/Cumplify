# LegalLedger Human-Grading Runbook

**Seat:** LegalLedger (M8 — statutory/legal-text interpretation)
**Status:** UNASSIGNED (retrieval-gated re-eval pending spec-4)
**Grading:** 100% human, blind protocol

---

## Grader Qualifications

- Architect (sole grader in P1) — must understand ISO 14001 6.1.3 / 45001 6.1.3 / 9001 9.1.2 obligation structures
- OWNER DECISION (REQUIRES-HUMAN): whether to engage external legal review for grading validation is an owner decision

---

## Blind Protocol (as executed in Task 8)

### 1. Shuffle Determinism

Model outputs are shuffled using a deterministic seed derived from the
run commit hash:

```
seed = sha256(run_commit_hash)
shuffle_order = seed-derived permutation of (candidates × tasks)
```

This ensures: (a) grading order is reproducible, (b) the grader cannot
identify which model produced which output during scoring.

### 2. Key Sequestration

The mapping (shuffled_index → model_id) is written to a sealed file
BEFORE grading begins and not opened until all scores are locked:

```
.kiro/evidence/model-policy-evals/runs/<seat>-<runId>/grading-key.json.sealed
```

### 3. Grading Process

For each shuffled response (model identity hidden):

1. Read the scenario (from the eval-set task)
2. Read the model's response (from raw/<shuffled_id>.json)
3. Score on 5 dimensions (1-5 scale each):
   - **Obligation identification:** correct obligations extracted
   - **Regulatory mapping:** correct standard/clause cited for each
   - **Risk classification:** appropriate severity/priority assigned
   - **Completeness:** no material obligations missed
   - **Accuracy:** no fabricated or misattributed obligations
4. Record scores with grader identity + timestamp

### 4. Score Locking

After ALL responses are scored:
- Scores committed to evidence (immutable)
- Grading key unsealed
- Scores aggregated by model

---

## Pass Threshold

- Mean score >= 4.0 across all dimensions and all tasks
- No individual response scores 1 on ANY dimension (catastrophic failure = disqualification)

---

## Failure-Mode Checklist (from Task 8 LegalLedger verdict)

The following failure modes were observed during the inaugural evaluation and
must be checked on every future grading round:

| # | Failure Mode | Detection | Severity |
|---|-------------|-----------|----------|
| FM-1 | **Fabricated thresholds:** model invents numeric thresholds, emission limits, or regulatory values not present in the scenario text | Check every numeric claim against the scenario input | CRITICAL (scores 1 on Accuracy) |
| FM-2 | **Jurisdiction misattribution:** model assigns obligations to the wrong regulatory body or applies a regulation from one jurisdiction to another | Cross-check regulator names against the stated jurisdiction | HIGH (scores 1-2 on Regulatory mapping) |
| FM-3 | **Threshold collapse:** model conflates different obligation types (e.g., treating a reporting obligation as a discharge limit, or merging two distinct permit conditions into one) | Count distinct obligations vs. model's merged list | HIGH (scores 1-2 on Completeness) |
| FM-4 | **Phantom ISO clauses:** model cites ISO clause numbers that don't exist or misattributes requirements to wrong clauses | Verify every clause citation against the corpus maps | MEDIUM (scores 2 on Regulatory mapping) |
| FM-5 | **Obligation omission:** model produces a plausible-looking register entry but silently drops 1+ material obligations from the scenario | Compare scenario obligation count vs. model output count | HIGH (scores 2 on Completeness) |

---

## Aggregation

After blind grading is complete:

```
Per candidate:
  mean_score = sum(all_dimension_scores) / (tasks × dimensions)
  has_catastrophic = any(dimension_score == 1)
  quality_pass = mean_score >= 4.0 AND NOT has_catastrophic
```

Candidates are then ranked by $/task (from the runner's cost data).
Winner = quality-pass candidate with lowest $/task that clears margin mandate.

---

## Retrieval-Grounded Re-Eval Gate

The current evaluation ran WITHOUT retrieval grounding (corpus maps only).
Production LegalLedger runs retrieval-grounded on tenant-uploaded standards.

**Before assignment:** spec-4 (knowledge-base) must deploy the retrieval path,
and a new grading round must execute with retrieval-augmented prompts.
The eval set gains a context-injection step: each scenario gets the relevant
clause chunks from the KB as additional prompt context.

Until this gate passes, LegalLedger remains UNASSIGNED in the Register.
