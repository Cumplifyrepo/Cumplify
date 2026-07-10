# api-core C-7 Cross-Tenant Denial Suite — Live Execution (closure carry)

**Date:** 2026-07-09 (architect, dev account 697114252993)
**Suite:** `services/api/__tests__/cross-tenant-denial.int.test.ts` (design §10.3)
**Runner:** `npm run test:int -- services/api/__tests__/cross-tenant-denial.int.test.ts` (`vitest.int.config.ts`)
**Result:** **11 passed, 1 gated (skipped)** — against deployed dev. (5 of 6 §10.3 cases proven; only #1 Pool-A remains, MFA-blocked.)

## Deployed resources exercised
- Aurora cluster `dev-datastack-auroracluster23d869c0-zmmgimmc0vnd` (app_role secret `cumplify/dev/rds/app-role`, master for cross-tenant inventory only).
- `CumplifyCore` DynamoDB + tenant-data role `cumplify-dev-tenant-data-role`.
- Test data: `m5.risks` — 5 rows, tenant-AAA×4 + tenant-BBB×1 (RLS-enforced).

## Case-by-case (6 of §10.3)

| # | Case | Status | Evidence |
|---|------|--------|----------|
| 1 | Authorizer denial (Pool-A → 401) | GATED | needs a real Pool-A ID token (Pool A MFA=ON). `describe.skipIf(!C7_POOL_A_TOKEN)`. |
| 2 | DynamoDB cross-tenant | **LIVE PASS** | `simulate-principal-policy` tenant-data role: tag=tenant-AAA → key `TENANT#tenant-BBB#…` = **implicitDeny** (GetItem+Query); own-key = **allowed**. |
| 3 | RDS RLS denial | **LIVE PASS** | app_role, no context → **0 rows** (fail-closed, current_setting NULL). tenant-AAA session → DISTINCT tenant_id = [tenant-AAA] only; tenant-BBB → [tenant-BBB] only. master (bypass) sees all 5. |
| 4 | Materialized-view denial | **LIVE PASS** | app_role `m5_views.get_risk_register_view()` under tenant-BBB = tenant-scoped (1 row); direct `SELECT … m5_views.risk_register_view` → **permission denied** (SQLState 42501, REVOKE holds). |
| 5 | Resolver overwrite (SCHEMA-5) | **CODE PASS** | zero resolvers read tenantId from client input (grep); all m1–m5 use `extractContext` (resolverContext only); `extractContext` fails closed absent the claim. |
| 6 | Subscription denial (C-6) | **LIVE PASS** | Pool-B SRP token (custom:tenantId=tenant-AAA) → AppSync realtime WSS subscribe `onDocumentStatusChanged(tenantId:"tenant-BBB")` → **REJECTED** `{errorType:"Unauthorized","Not Authorized to access onDocumentStatusChanged on type Document"}` (subscriptionAuth @aws_lambda). Positive control: same-tenant (tenant-AAA) → **start_ack (accepted)**. `describe.skipIf(!C7_POOL_B_TOKEN)`. |

## Wiring
- `vitest.int.config.ts` (new) — includes `services/**/*.int.test.ts` (excluded from default `vitest run`).
- `package.json` script `test:int` (new) — CI runs the denial suite in a credentialed job.
- Local: `C7_AWS_PROFILE=cumplify-dev-admin npm run test:int`. CI: `C7_AWS_PROFILE='' npm run test:int` (ambient role). ARNs overridable via `C7_*` env; dev defaults baked in.

## C-6 live-proof procedure (2026-07-09, reproducible)
1. `admin-set-user-password` on Pool-B test user `acc-aaa-admin@example.com` (dev mutation, owner-approved). Password held by owner/architect — NOT committed.
2. SRP auth via `pycognito` (client `662fm2cthctp150bo5sa7i5o43`, public/no-secret) → ID token (`token_use=id`, `custom:tenantId=tenant-AAA`, `aud=`Pool-B client).
3. `C7_POOL_B_TOKEN=<idToken> npm run test:int` → #6 opens the AppSync realtime WSS (Node global WebSocket), subscribes cross-tenant → Unauthorized; same-tenant → accepted.
In CI: provide a fresh `C7_POOL_B_TOKEN` (or run SRP in the job).

## Remaining (not blocking)
- **#1** Pool-A authorizer 401: needs a Pool-A ID token (Pool A MFA=ON). Pre-existing blocked carry — the only un-proven case.

## Disposition
C-7 suite: **5 of 6 proven** — #2/#3/#4/#6 LIVE on the deployed system + #5 code. Only #1 (Pool-A, MFA) gated. Suite committed and CI-wired (`test:int`). Tenant isolation on the deployed api-core is demonstrated end-to-end at every layer: DynamoDB (IAM LeadingKeys), RDS (RLS fail-closed + per-tenant), materialized view (grant), and AppSync subscriptions (C-6 subscriptionAuth).
