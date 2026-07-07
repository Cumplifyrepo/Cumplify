# Quarterly Re-Validation Runbook

**Cadence:** Every 90 days (aligned with Register entry expiry dates)
**Trigger:** Calendar reminder (no infrastructure; all seats runbook-initiated per DREV-1)
**Executor:** Architect (all runs are architect-witnessed per C-4)

---

## Process

### 1. Expiry Check

```bash
# Review Register for entries within 30 days of expiry
grep "Expiry" contracts/model-register.md
# Flag entries where expiry <= today + 30 days
```

Any entry past its expiry date without re-validation: mark EXPIRED in the Register.

### 2. New-Model Discovery (REVAL-4)

```bash
# Check for newly accessible models on Bedrock
AWS_PROFILE=cumplify-dev-readonly aws bedrock list-foundation-models \
  --region us-east-1 --query 'modelSummaries[].modelId' \
  | diff - <(grep "candidates" services/model-evals/src/seat-configs.ts)
```

Any new model accessible since last re-validation: add to relevant seat candidate lists in `seat-configs.ts`.

### 3. Price Refresh

```bash
# Verify price-snapshot staleness (must be < 90 days)
npx tsx services/model-evals/run.ts --seat micro --estimate-only
# If staleness error: update price-snapshot.json with fresh capture + provenance
```

### 4. Estimate + Approval (per seat)

```bash
# For each expiring seat:
npx tsx services/model-evals/run.ts --seat <seat> --estimate-only
# Record estimate in evidence. Architect approves budget.
```

### 5. Run (per seat)

```bash
# Automated-grading seats: run directly
npx tsx services/model-evals/run.ts --seat <seat> --run --approved-budget <$> --run-id <timestamp>

# Human-graded seats: run to collect outputs, then grade per protocol
# (guru: 20% spot-review; workhorse: 30%; editor-ai: 20%; legal-ledger: 100% blind)
```

### 6. Score + Verify

For human-graded seats: apply blind grading protocol (see legal-ledger-grading.md for the strictest case).

### 7. Register Update

Update `contracts/model-register.md`:
- New expiry date (today + 90 days)
- Updated $/task if pricing changed
- Model swap if a new candidate won

### 8. Register Trace Verification

```bash
# Replicate the architect trace script: grep winner row from each cited report,
# compare field-for-field against the Register entry.
# Every numeric field must match its citation exactly.
grep "<winner-model>" .kiro/evidence/model-policy-evals/runs/<seat>-<runId>/report*.md
```

This step exists because of truth incidents #8: figures must come from executed
command output, never from memory.

### 9. Commit

Commit updated Register + evidence logs in a single commit per rules 7-8.

---

## Seat-Specific Notes

| Seat | Grading | Re-validation Notes |
|------|---------|-------------------|
| Micro | Automated (multi-label F1) | Bar 0.90; watch for new lightweight models |
| Lightweight | Automated (schema) | Simplest re-run |
| Snapshot | Automated (schema) + 20% spot-review | Architect reviews grounding quality on sample |
| Pain-distiller | Automated (multi-label F1) | Taxonomy stable unless product adds categories |
| Guru (×3) | Automated (clause-citation) + 20% spot-review | ISO 45001 seat PROVISIONAL until retrieval-grounded |
| Workhorse | Automated (schema) + 30% content review | Conditions (retry-guard, scaffolding) re-evaluated per agent spec |
| Editor-AI | Automated (schema) + 20% spot-review | Content quality is the binding dimension |
| LegalLedger | 100% human blind | UNASSIGNED until retrieval-grounded re-eval (spec-4 gate) |
