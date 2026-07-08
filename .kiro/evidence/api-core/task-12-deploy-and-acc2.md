# api-core Task 12 (Deploy) + ACC-2 (CARRY-1) — Architect-Witnessed

**Date:** 2026-07-07
**Executor:** Architect (AWS_PROFILE=cumplify-dev-admin, dev account 697114252993, us-east-1)

## Task 12 — Deploy + witnessed readback
- All 7 Dev stacks terminal-healthy: Network/Security/Data/Identity/Eventing/AuditTrail
  UPDATE_COMPLETE; **ApiStack CREATE_COMPLETE**.
- CDK true exit code: `CDK_EXIT=0` (captured directly, not via a trailing grep).
- Outputs: `.kiro/evidence/api-core/cdk-outputs-dev.json` (SHA-256 prefix 422a258e3545bf3b).
  Dev-ApiStack outputs present: GraphqlApiId, GraphqlApiUrl, AuthorizerArn,
  TenantDataRoleArn, AppRoleSecretArn.
- All 9 migrations applied; app_role password synced.
- EventingStack R-3 `auditTrail=[true]` swap is live (no producers pre-existed → FF-4 waiver holds).

### Deploy-path defects found + resolved at witnessed deploy (5 attempts)
The migration path had never been exercised against real Data API (unit tests mock it):
1. Migrator read `/var/migrations` but bundling put files at `/var/task/migrations` — architect hotfix b5c45ce.
2. Migrator lacked kms:Decrypt on the master-secret CMK (secretsKey) — architect hotfix 91ce1c6 (IAM delta surfaced).
3. Migration files are multi-statement; Data API runs one/call — Kiro fix 20cbc32 (dollar-quote-aware splitter + 17 tests).
4. Aurora 0-ACU auto-pause resume transient — architect hotfix (withResumeRetry).
All non-security (splitter reviewed for isolation-tear safety); security surface unchanged from owner sign-off.

## ACC-2 — CARRY-1 tenant-scoped denial matrix (incl. GSI probe)
Method: `aws iam simulate-principal-policy` against the tenant-data role
(cumplify-dev-tenant-data-role), session tag aws:PrincipalTag/tenantId=tenant-AAA.

| Action | Resource | LeadingKeys | EvalDecision |
|--------|----------|-------------|--------------|
| dynamodb:GetItem | CumplifyCore (table) | TENANT#tenant-AAA#DOC#1 | **allowed** |
| dynamodb:GetItem | CumplifyCore (table) | TENANT#tenant-BBB#DOC#1 | **implicitDeny** |
| dynamodb:PutItem | CumplifyCore (table) | TENANT#tenant-BBB#DOC#1 | **implicitDeny** |
| dynamodb:Query | CumplifyCore/index/GSI1 | TENANT#tenant-AAA#DOC#1 | **allowed** |
| dynamodb:Query | CumplifyCore/index/GSI1 | TENANT#tenant-BBB#DOC#1 | **implicitDeny** |

**CARRY-1 (R-1 GSI concern): CLOSED on the policy simulator.** Cross-tenant table and
GSI access denied; same-tenant allowed. Note: simulate-principal-policy proves the IAM
policy logic; a runtime GSI Query with cross-tenant assumed creds returning AccessDenied
should be spot-checked during ACC-1/ACC-5 when live per-tenant data exists (recommended,
not blocking — the designed ACC-2 method is the simulator).

## Remaining acceptance proofs (need test-tenant provisioning)
- ACC-1 E2E mutation→sealed event; ACC-3 authorizer negative (real Pool-A token);
  ACC-4 chain verifier green; ACC-5 RLS + matview isolation; Task 18 loop-guard.
  These require Cognito test users (Pool B/C), tokens, and seeded two-tenant data.
