# Task 15 — Dev Deploy + Readback (architect, standing auth + Task-14 sign-off)

**Date:** 2026-07-11 (readbacks witnessed 13:38–13:42Z)
**Deploy lane:** direct `cdk deploy` fallback (pipeline red on the same defects being
fixed; push access paused pending owner PAT — pipeline re-run will no-op at next push).
**Outputs provenance (rule 8):** describe-stacks outputs blob sha256 `e83f79b4beaceb90`,
captured 2026-07-11T13:42:40Z, all CLI exits 0.

## Deploy attempts (full honesty — 3 defects found live, each fixed + committed)

| Attempt | Result | Defect → fix |
|---|---|---|
| Pipeline exec 9d9c90a1 | ApiStack ROLLBACK | Resolver raced schema update (404) → explicit resolver→schema CFN deps (3433654) — NECESSARY but not sufficient |
| Direct deploy #1 | ApiStack ROLLBACK ×2-same-404 THEN quota fail | (a) AppSync IGNORES `extend type` blocks — fields merged into base types (a71e64c); (b) tenant-data trust hit ACLSizePerRole 2048 (was 1981/2048 + 3 new principals) → PrincipalArn-pattern trust, 455 bytes synthesized / 410 deployed, OWNER RE-SIGNED (0a584c1) |
| Direct deploy #2 | **ApiStack UPDATE_COMPLETE 13:37:31Z** | — |

FrontendStack: **CREATE_COMPLETE** (deployed `--exclusively` in parallel).
AiStack: **UPDATE_COMPLETE** (HITL-10 SFN amendment live: `sfnExecutionArn.$` payload +
Catch SENT_BACK → HandleSendBack).

## Readbacks (INVOKED, not inspected — rule 4)

Pool-B ID token minted via pycognito SRP (user acc-aaa-admin@example.com, temp password
set via admin-set-user-password — dev test user, precedented; claims verified:
custom:tenantId=tenant-AAA, custom:role=Employee, token_use=id).

| # | Probe | Result |
|---|-------|--------|
| 1 | `getProfile` (no item) | PASS — fail-safe default `{locale:"en"}`, userId = Cognito sub |
| 2 | `updateProfile(locale:"es")` | PASS — persisted, updatedAt stamped |
| 3 | `getProfile` again | PASS — `es` round-trip |
| 4 | `listPendingHitlItems` | PASS — returned 1 real pending item (CAPAGuru, `01KX4A4Z83PP0R8V9SJWH6A9HX`), tenant-scoped via GSI9 |
| 5 | `taskToken` field probe | PASS — schema-level rejection `FieldUndefined` (BC-8/ACC-9 core assertion) |
| 6 | Subscription `onHitlItemResolved` | Resolver live on the API (`list-resolvers` shows it, C-6 VTL attached); WSS connect exercised at ACC (Task 16 E2E fires it naturally) — annotated, not claimed |
| 7 | SPA via CloudFront | PASS — https://d1tw2kanxo5wnt.cloudfront.net/ → 200; `/dashboard` → 200 serving Command Center (SPA fallback works); private S3 + OAC |
| 8 | Sweeper live invoke | PASS — 200, `{"scanned":0,"reset":0,"skipped":0}` (no stale RESOLVING items; GSI9 index scan) |

**Every probe 1–5 traverses the REWRITTEN trust live** (authorizer → resolver → assume
tenant-data w/ tenantId tag → DDB) — the strongest possible proof the trust rewrite works.

## Security re-probe (CARRY-1 matrix on the new trust)

| Probe | Decision |
|-------|----------|
| tenant-data perms: same-tenant LeadingKeys (tag tenant-AAA, key TENANT#tenant-AAA#…) | **allowed** |
| tenant-data perms: cross-tenant (tag tenant-AAA, key TENANT#tenant-BBB#…) | **implicitDeny** |
| TWO-KEY negative: sweeper role (matches `Dev-ApiStack-*` pattern, has NO identity grant) → sts:AssumeRole on tenant-data | **implicitDeny** |
| Approval role: states:SendTaskSuccess / SendTaskFailure | **allowed** (first probe read implicitDeny — IAM propagation lag ~2min post-deploy; re-simulated allowed; get-role-policy shows the deployed statement) |

## Dev test artifacts

Temp password on acc-aaa-admin@example.com (architect-held, not committed); PROFILE# item
for that user (locale=es); pending CAPAGuru HITL item predates this task (spec-4 era) and
is REAL data for Task 16's approval E2E.

## Permanent lessons recorded

1. AppSync ignores `extend type` — never use it in AppSync SDL.
2. CDK adds no implicit resolver→schema dependency — pin explicitly.
3. IAM role trust policies cap at 2048 bytes — enumerate-by-principal does not scale;
   PrincipalArn-pattern + two-key grants is the standing pattern.
4. simulate-principal-policy can lag a fresh deploy — re-probe before concluding.
