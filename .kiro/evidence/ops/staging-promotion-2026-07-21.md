# Staging Promotion — 2026-07-21 (revision 192f9f5, exec 33b566ca)

> Architect-executed per owner decision 2026-07-20 ("proceed").

## Gate handling
- 05:09:09Z(-04): REJECTED stale ApproveToStaging token (exec 6fb7d0c2, revision
  f8e0906 of 2026-07-18 — pre-content-depth). Manual approvals are NOT superseded
  mid-stage; the stale holder had to be cleared explicitly. Reason recorded in the
  approval result.
- 05:09:19: APPROVED fresh token 061cd190 for exec 33b566ca (revision 192f9f5 —
  the complete iso-kb-seeding + iso-kb-content-depth arc, Dev-validated, grounding 0.99).

## Deploy readback (all witnessed via mgmt-account action executions)
| Action | Status | Completed (-04) |
|--------|--------|-----------------|
| Security/Eventing/Network Stacks | Succeeded | 05:10:31–05:11:35 |
| DataStack | Succeeded | 05:13:17 |
| AuditTrail/Identity | Succeeded | 05:14:28 |
| ApiStack | Succeeded | 05:17:43 |
| FrontendStack | Succeeded | 05:18:20 |
| **AiStack** (incl. seeder FIRST cold-env Create) | **Succeeded** | 05:24:35 |
| SmokeTest | Succeeded* | 05:25:08 |

No Staging-account CLI profile exists on this machine — seeder log readback not
directly possible. The seed-success claim rests on FIX-P12-3 fail-closed semantics
(live-proven in dev): AiStack.Deploy CANNOT succeed unless the seeder's CFN
response was SUCCESS. The 6-minute AiStack leg is consistent with guardrail/AR
resource creation + a ~40s seed. The cold-environment first-Create also validates
the CFN-direct + resource-policy design in exactly the scenario that failed dev
attempt 1 (IAM propagation race — structurally eliminated).

## FINDING SMOKE-1 (M) — SmokeTest is vacuous (*)
pipeline-stack.ts:78: `curl -f https://staging.cumplify.ai/health || true`.
The `|| true` swallows ALL failures — and the curl in THIS run FAILED
("Could not resolve host: staging.cumplify.ai") yet the action Succeeded.
Two defects: (1) the guard can never fail; (2) staging.cumplify.ai has no DNS.
NOT patched unilaterally: removing `|| true` with broken DNS turns every future
Staging promotion red — the fix needs the real staging URL decision (CloudFront
distribution domain vs. setting up staging DNS) = owner/Kiro next session.
Until fixed, "SmokeTest green" carries ZERO assurance — promotions are validated
by CFN outcomes + fail-closed CR semantics only.

## Prod gate — UNTOUCHED
Exec 33b566ca now waits at ApproveToProd; LegalSignoffGuard is FAILED (correctly
blocking Prod as designed). Prod promotion is owner + legal lane exclusively.
