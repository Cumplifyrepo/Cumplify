# Phase-0 Gate — Design

**Spec:** `phase-0-gate`
**Requirements approved:** R1.1 (AMEND-1..4 applied)
**Revision:** R1 — initial design for architect review

---

## 1. Execution Plan Overview

This is a verification spec. No infrastructure is deployed. The output is a gate report + evidence logs, all architect-witnessed.

```
Task 1 (Prepare)
  → Enumerate task universe, prepare command scripts, report skeleton
Task 2 (Architect-Witnessed Execution)
  → GATE-1..8 evidence gathered live (architect runs cloud-touching commands)
Task 3 (Report + Closure)
  → Assemble findings, commit report + evidence, close
```

---

## 2. Per-Gate Command Scripts

### GATE-1: Drift-Free

```bash
# Dev account (697114252993) — 6 stacks
npx cdk diff Dev/NetworkStack 2>&1 | tee gate-1-drift-network.log
npx cdk diff Dev/SecurityStack 2>&1 | tee gate-1-drift-security.log
npx cdk diff Dev/DataStack 2>&1 | tee gate-1-drift-data.log
npx cdk diff Dev/IdentityStack 2>&1 | tee gate-1-drift-identity.log
npx cdk diff Dev/EventingStack 2>&1 | tee gate-1-drift-eventing.log
npx cdk diff Dev/AuditTrailStack 2>&1 | tee gate-1-drift-audittrail.log

# Mgmt account (157082218687) — pipeline stack (AMEND-4)
npx cdk diff CumplifyPipeline 2>&1 | tee gate-1-drift-pipeline.log
```

**Pass criteria:** Each log shows `There were no differences` or only the known-benign SAR TemplateURL re-sign (DataStack Aurora rotation).

### GATE-2: CDK Nag Clean

```bash
npx cdk synth --all 2>&1 | tee gate-2-synth.log
# NagReports generated in cdk.out/assembly-*/
find cdk.out -name "*NagReport*" -exec cat {} \; > gate-2-nagreports.csv
grep -c "Non-Compliant" gate-2-nagreports.csv  # expect 0
```

**Suppression inventory:** extracted from source grep:
```bash
grep -rn "NagSuppressions\|addResourceSuppressions\|addStackSuppressions" infra/lib/ \
  --include="*.ts" | tee gate-2-suppressions.txt
```

### GATE-3: Cross-Tenant Denial

**Step 0 — Enumerate tenant-scoped principals:**
```bash
# Search synthesized templates for dynamodb:LeadingKeys + PrincipalTag/tenantId
grep -rn "LeadingKeys\|PrincipalTag" cdk.out/assembly-Dev*/ --include="*.json" \
  | tee gate-3-enumerate.log
```

**Step 1 — If tenant-scoped principal exists (run simulation):**
```bash
ROLE_ARN="<from cdk-outputs or enumeration>"
TABLE_ARN="arn:aws:dynamodb:us-east-1:697114252993:table/CumplifyCore"

# Cross-tenant: GetItem with tenant-B key while principal is tenant-A
aws iam simulate-principal-policy \
  --policy-source-arn "$ROLE_ARN" \
  --action-names dynamodb:GetItem \
  --resource-arns "$TABLE_ARN" \
  --context-entries \
    ContextKeyName=dynamodb:LeadingKeys,ContextKeyValues=TENANT#tenant-B#DATA,ContextKeyType=string \
    ContextKeyName=aws:PrincipalTag/tenantId,ContextKeyValues=tenant-A,ContextKeyType=string \
  2>&1 | tee gate-3-cross-tenant-get.log

# Same-tenant: GetItem with tenant-A key while principal is tenant-A
aws iam simulate-principal-policy \
  --policy-source-arn "$ROLE_ARN" \
  --action-names dynamodb:GetItem \
  --resource-arns "$TABLE_ARN" \
  --context-entries \
    ContextKeyName=dynamodb:LeadingKeys,ContextKeyValues=TENANT#tenant-A#DATA,ContextKeyType=string \
    ContextKeyName=aws:PrincipalTag/tenantId,ContextKeyValues=tenant-A,ContextKeyType=string \
  2>&1 | tee gate-3-same-tenant-get.log
```

**Step 2 — AUDITLOG Deny (always exercisable):**
```bash
CONSUMER_ROLE_ARN="<from cdk-outputs AuditTrailStack ConsumerRoleArn>"
# Already proven in spec 5 readback test 9 — cite evidence file path
# Re-run for gate freshness:
aws iam simulate-principal-policy \
  --policy-source-arn "$CONSUMER_ROLE_ARN" \
  --action-names dynamodb:UpdateItem dynamodb:DeleteItem dynamodb:BatchWriteItem \
    dynamodb:PartiQLUpdate dynamodb:PartiQLDelete \
  --resource-arns "$TABLE_ARN" \
  --context-entries \
    ContextKeyName=dynamodb:LeadingKeys,ContextKeyValues=TENANT#readback-synthetic-001#AUDITLOG,ContextKeyType=string \
  2>&1 | tee gate-3-auditlog-deny.log
```

### GATE-4: Sealed-Audit Pattern

No new commands — cite spec 5 evidence:
- `.kiro/evidence/immutable-trail/task-7.log` (ACC-1, ACC-3 results)
- Commit hash `24de927` (spec 5 closure)

### GATE-5: AOSS 45s Budget

No commands — N/A documentation only.

### GATE-6: Cost Review

```bash
# Dev account cost (last 30 days)
aws ce get-cost-and-usage \
  --time-period Start=2026-06-04,End=2026-07-05 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --profile cumplify-dev \
  2>&1 | tee gate-6-dev-cost.json

# Mgmt account cost
aws ce get-cost-and-usage \
  --time-period Start=2026-06-04,End=2026-07-05 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --profile cumplify-mgmt \
  2>&1 | tee gate-6-mgmt-cost.json
```

### GATE-7: Hallucination Audit

**Task-universe enumeration method:**
1. Enumerate all completed tasks across the 4 P0 specs → numbered list in `task-universe.md`
2. After committing task-universe.md, take that commit hash
3. Derive indices: `sha256(commit_hash)` → take first 8 hex chars → parse as integer → `mod N` for index 1; next 8 chars for index 2; next 8 for index 3
4. Skip if same spec as previous selection; advance to next 8 chars
5. Document derivation in report

**Per-selected-task audit:**
1. Re-run evidence gate (the readback test that closed the task)
2. Attempt falsification (architect breaks the protected resource, re-runs test, confirms FAIL)
3. Restore the broken resource

### GATE-8: D6 User-Facing Readiness

No commands — N/A documentation only.

---

## 3. Report Skeleton (`docs/gates/phase-0-gate-report.md`)

```markdown
# Phase-0 Gate Report

**Gate execution:** <timestamp>
**Commit at gate:** <hash>
**cdk-outputs.json blob SHA:** <git hash-object cdk-outputs.json>

## P0 Spec Summary

| Spec | Max D-Rung | Closing Commit | Evidence |
|------|-----------|----------------|----------|
| build-verification-harness | D3 | ac961bb | .kiro/evidence/build-verification-harness/ |
| platform-foundation | D3 | 7b80078 | .kiro/evidence/platform-foundation/ |
| eventing-backbone | D3 | bdd389b | .kiro/evidence/eventing-backbone/ |
| immutable-trail | D3 | 24de927 | .kiro/evidence/immutable-trail/ |

## GATE-1: Drift-Free
<per-stack results table>

## GATE-2: CDK Nag Clean
<suppression inventory + 0 Non-Compliant confirmation>

## GATE-3: Cross-Tenant Denial
<enumeration result + simulation matrix>

## GATE-4: Sealed-Audit Pattern
<citation + N/A note>

## GATE-5: AOSS 45s Budget
<N/A + P1 carry>

## GATE-6: Cost Review
<summary table + Part 27 comparison>

## GATE-7: Hallucination Audit
<derivation + 3 task audits + results>

## GATE-8: D6 User-Facing Readiness
<N/A + reason>

## Findings Summary
| # | Severity | Gate | Finding | Status |
|---|----------|------|---------|--------|

## Conclusion
<PASS/FAIL + P1 entry decision>
```

---

## 4. Task-Universe Enumeration Method

Parse each spec's `tasks.md`, extract completed tasks (checked `[x]` items). Format:

```
1. build-verification-harness / Task 1.1: ...
2. build-verification-harness / Task 1.2: ...
...
N. immutable-trail / Task 8: ...
```

Commit as `.kiro/evidence/phase-0-gate/task-universe.md`.

---

## 5. Cost-Estimates Document Structure (`docs/gates/cost-estimates.md`)

```markdown
# P0 Cost Estimates

## Dev Account (697114252993) — Run Rate
| Service | Monthly Cost | Notes |
|---------|-------------|-------|

## Dominant Cost Levers
- AOSS (scale-to-zero but OCU minimum when active)
- VPC Endpoints (5 interface × $0.01/hr/AZ × 2 AZs)
- KMS (10 CMKs × $1/mo + API calls)

## Mgmt Account (157082218687)
| Service | Monthly Cost | Notes |
|---------|-------------|-------|

## Part 27 Comparison
| Tripwire | Threshold | Actual | Status |
|----------|-----------|--------|--------|
```
