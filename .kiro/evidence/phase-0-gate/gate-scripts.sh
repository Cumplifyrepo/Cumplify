#!/usr/bin/env bash
# Phase-0 Gate — Execution Scripts (COR-2: pipeline-stage construct paths)
# Architect-witnessed execution. All output captured to evidence logs.
set -euo pipefail

EVIDENCE_DIR=".kiro/evidence/phase-0-gate"

# ─── GATE-1: Drift-Free ─────────────────────────────────────────────────────
echo "=== GATE-1: Drift checks ==="

# Dev account stacks (addressed by pipeline-stage construct path)
npx cdk diff CumplifyPipeline/Dev/NetworkStack 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-network.log"
npx cdk diff CumplifyPipeline/Dev/SecurityStack 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-security.log"
npx cdk diff CumplifyPipeline/Dev/DataStack 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-data.log"
npx cdk diff CumplifyPipeline/Dev/IdentityStack 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-identity.log"
npx cdk diff CumplifyPipeline/Dev/EventingStack 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-eventing.log"
npx cdk diff CumplifyPipeline/Dev/AuditTrailStack 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-audittrail.log"

# Mgmt account pipeline stack (AMEND-4)
npx cdk diff CumplifyPipeline 2>&1 | tee "$EVIDENCE_DIR/gate-1-drift-pipeline.log"

# ─── GATE-2: CDK Nag Clean ──────────────────────────────────────────────────
echo "=== GATE-2: CDK Nag ==="

npx cdk synth --all 2>&1 | tee "$EVIDENCE_DIR/gate-2-synth.log"
find cdk.out -name "*NagReport*" -exec cat {} \; > "$EVIDENCE_DIR/gate-2-nagreports.csv"
echo "Non-Compliant count: $(grep -c 'Non-Compliant' "$EVIDENCE_DIR/gate-2-nagreports.csv" || echo 0)"

# Suppression inventory
grep -rn "NagSuppressions\|addResourceSuppressions\|addStackSuppressions" infra/lib/ \
  --include="*.ts" > "$EVIDENCE_DIR/gate-2-suppressions.txt"

# ─── GATE-3: Cross-Tenant Denial ────────────────────────────────────────────
echo "=== GATE-3: Cross-Tenant Denial ==="

# Step 0: Enumerate tenant-scoped principals
grep -rn "LeadingKeys\|PrincipalTag" cdk.out/ --include="*.json" \
  > "$EVIDENCE_DIR/gate-3-enumerate.log" 2>&1 || true

# Step 2: AUDITLOG Deny (always exercisable)
# Consumer role ARN from cdk-outputs.json
CONSUMER_ROLE_ARN=$(node -e "const o=require('./cdk-outputs.json'); const k=Object.keys(o).find(k=>k.includes('AuditTrail')); console.log(o[k].ConsumerRoleArn)")
TABLE_ARN="arn:aws:dynamodb:us-east-1:697114252993:table/CumplifyCore"

aws iam simulate-principal-policy \
  --policy-source-arn "$CONSUMER_ROLE_ARN" \
  --action-names dynamodb:UpdateItem dynamodb:DeleteItem dynamodb:BatchWriteItem \
    dynamodb:PartiQLUpdate dynamodb:PartiQLDelete \
  --resource-arns "$TABLE_ARN" \
  --context-entries \
    "ContextKeyName=dynamodb:LeadingKeys,ContextKeyValues=TENANT#readback-synthetic-001#AUDITLOG,ContextKeyType=string" \
  2>&1 | tee "$EVIDENCE_DIR/gate-3-auditlog-deny.log"

# ─── GATE-6: Cost Review ────────────────────────────────────────────────────
echo "=== GATE-6: Cost Review ==="

aws ce get-cost-and-usage \
  --time-period Start=2026-06-01,End=2026-07-05 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --profile cumplify-dev \
  2>&1 | tee "$EVIDENCE_DIR/gate-6-dev-cost.json"

aws ce get-cost-and-usage \
  --time-period Start=2026-06-01,End=2026-07-05 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --profile cumplify-mgmt \
  2>&1 | tee "$EVIDENCE_DIR/gate-6-mgmt-cost.json"

# ─── GATE-7: Hallucination Audit ────────────────────────────────────────────
echo "=== GATE-7: Hallucination Audit ==="
echo "Selected tasks (derived from seed a39229919879e57826643c9fae99c208fadb6cbd):"
echo "  A1: platform-foundation / 3.1 (pipeline deploy)"
echo "  A2: build-verification-harness / 1.2 (property-based test scaffold)"
echo "  A3: immutable-trail / 3 (createFifoHandler extension)"
echo ""
echo "Architect executes re-run + falsification for each. See task-universe.md for derivation."

# A1: Re-run platform-foundation 3.1 evidence gate
echo "--- A1: Re-run platform-foundation 3.1 ---"
echo "Verify: pipeline execution history shows no-op against dev stacks"
echo "Falsification: temporarily break the CodeStar connection ARN in cdk.context.json → pipeline Source fails"

# A2: Re-run build-verification-harness 1.2 evidence gate
echo "--- A2: Re-run build-verification-harness 1.2 ---"
npm run verify -- --spec build-verification-harness --task 1.2 2>&1 | tee "$EVIDENCE_DIR/gate-7-a2-rerun.log"
echo "Falsification: remove services/_scaffold/example.property.test.ts → verify step 4 FAILS (mechanical check)"

# A3: Re-run immutable-trail task 3 evidence gate
echo "--- A3: Re-run immutable-trail 3 ---"
npx vitest run services/eventing/__tests__/consumer.test.ts --reporter=verbose 2>&1 | tee "$EVIDENCE_DIR/gate-7-a3-rerun.log"
echo "Falsification: break createFifoHandler (remove fail-forward-all logic) → CON-7a test FAILS"

echo "=== Gate script complete ==="
echo "cdk-outputs.json blob SHA: $(git hash-object cdk-outputs.json)"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
