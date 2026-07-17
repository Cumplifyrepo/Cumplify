# Architect validation — AR build wave (Kiro 06098cb, d00ac33, 7418409) + FIX-AR-GUARD
# Executed: 2026-07-17T08:40–08:50 ET | all commands exit 0 unless noted

## Verdict: ACCEPTED (all 3 commits) + one architect fix-forward (FIX-AR-GUARD)

## Rule-7 audit: FULLY COMPLIANT — first wave ever
Every commit carries tick + task-N.log + code in the SAME commit. Noted.

## Re-executed evidence (at 7418409)
- ROOT `npx vitest run`: 1030 passed | 3 skipped — matches claim EXACTLY.
- `npx tsc --noEmit` exit 0. `npx cdk synth --all` exit 0.

## Task 25 (06098cb) — deploy-risk items verified beyond synth
- **Template casing PROVEN correct**: synthesized Dev/AiStack template has
  PolicyDefinition → {Rules, Types, Variables, Version}, rule keys
  {Expression, Id} — the L1 CfnAutomatedReasoningPolicy serializes
  camelCase→PascalCase properly (synth alone would NOT have caught a
  raw-CfnResource camelCase bomb; this was checked in the template JSON).
- **Draft-ARN validity**: live CFN registry describe-type — Policies item
  pattern `automated-reasoning-policy/[a-z0-9]{12}(:version)?` — version
  suffix OPTIONAL, so referencing attrPolicyArn (draft) is schema-valid.
  Runtime AR evaluation against draft policies is a Task-29 readback item.
- maxItems:2 respected (ArAdvisory carries exactly 2); ConfidenceThreshold
  0.9 on both; CrossRegionConfig us.guardrail.v1:0 present; env vars wired;
  fs read of ar-policies JSONs is in INFRA code (synth-time), not
  Lambda-bundled — the prompt-library rule does not apply.

## Tasks 27/28 (d00ac33)
- Gate mapping matches _meta.arCheckGateMapping EXACTLY; unknown finding
  results also route to HITL (fail-safe default). 29 unit tests re-run.
- Steered-retry flow matches design §5.4: reject → retry once with AR
  feedback → pass=use retry (flagged:true, 'corrected') / else
  HITL-deferred; usage accumulated (addUsage) before metering; FIX-W-1
  pattern on all exits. Ai.ArRejected IS registered
  (audit-trail-registry.ts:123, auditTrail:false) + contracts/events.md.
- Path selection: role/plan advisory features take precedence; clause-citing
  = guru seats × {clause-qa, record-write} + record-write on any seat.
- Dormant pre-deploy (env vars absent → pass-through 'unconfigured') —
  consistent with the guardrail skip-when-absent precedent.

## Task 35 (7418409)
- ACC-3 primary (INVALID → steered retry → HITL) + AMBIGUOUS→HITL variant
  both asserted; 6/6 ACC tests green. Finding-shape mock matches the
  parser's {result, invalidClaim, reason, suggestedCorrection} contract.

## FIX-AR-GUARD (architect fix-forward, THIS commit)
**Gap found during validation:** checkArPolicy was called UNGUARDED in
invoke(). Pushing this wave auto-deploys Dev (pipeline tracks develop) and
the AR check goes ACTIVE (env vars wired in 06098cb) BEFORE the Task-26
IAM grant (bedrock:InvokeAutomatedReasoningPolicy, §5.5) — an AccessDenied
(or any throttle/transient AR API error) would have propagated and killed
EVERY clause-citing/advisory answer: the invoker-down incident class again.
Fix: the AR orchestration block is wrapped in an infra-error guard —
fail OPEN, LOUDLY: answer delivered, arVerdict='error' +
'ar-check infra failure: …' in evidence, logger.error with path/seat/
feature/tenant. Verdict-based blocking is untouched (verdicts never throw);
InvokeError rethrown. arVerdict union extended 'pass'|'fail'|'error'|null
(types.ts + inline duplicates in hitl.ts/store-token.ts — duplication
noted as a small smell). +2 tests: AccessDenied → delivered with
arVerdict 'error'; double-INVALID still yields fail+flagged.
**Consequence: deploying before Task 26 is now SAFE — Task 26 becomes a
pure activation gate, visible in evidence/logs until granted.**
- ROOT suite after fix: 1032 passed | 3 skipped; tsc 0.

## Sequencing note
This push deploys the AR CFN resources to Dev (policies + 2 guardrails).
Task 29 (deployed AR behavior readback) remains OPEN until the owner grants
Task 26; until then live AR checks are expected to surface arVerdict='error'
(loud) or pass through where permissions suffice — the readback will pin
which.
