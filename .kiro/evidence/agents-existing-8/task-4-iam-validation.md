# agents-existing-8 Task 4 — IAM (REQUIRES-HUMAN) Architect Review

**State:** working-tree diff, NOT committed (per mandate). Reviewed before commit.
**Method:** on-disk read of the IAM diff + AOSS data-access policy; cross-check vs api-core C-1 (app_role NEVER master), AOSS access model, T-1 correction, gate (a)/(b)/(c).
**Verdict:** **NOT APPROVED — DO NOT COMMIT.** One cross-tenant write hole, two AOSS access-model errors, and the headline control (T-1) not actually enforced. Several are correct-to-defer (Task 8/9) but must not ship as wildcards/placeholders.

## Correct (acknowledge)
- Used `CfnAccessPolicy` type=`data` (the real AOSS data-access resource) — avoids the common "granular aoss actions in IAM" mistake. ✓
- Data-access **resources** scoped to the 3 named collections/indexes — no `collection/*` wildcard. ✓
- `StoreTokenRole` correctly minimal: `dynamodb:UpdateItem` + `LeadingKeys TENANT#*#HITL` only. ✓
- ExecuteWriteback consolidates the RDS-write path into one role. `.gitignore` `.env` addition good. ✓

## Findings

### T4-F1 (HIGH — RLS bypass on the write path: ExecuteWriteback uses the MASTER secret)
`ExecuteWritebackRole` gets `secretsmanager:GetSecretValue` on `props.dbSecretArn` — which is the **RDS master credentials** (data-stack.ts:135,142). The master user **BYPASSES RLS** (corpus invariant). api-core established **C-1**: the Data API path uses the **app_role** secret, "NEVER master" (services/api/src/resolvers/shared.ts:140; api-stack.ts:265 "C-1: app_role, NOT master"). A writeback on the master credential can write **any tenant's rows** regardless of `set_config` — a cross-tenant write hole in the exact path the HITL gate is meant to protect.
**Fix:** pass the ApiStack `appRoleSecret` ARN into AiStack (new prop); ExecuteWriteback gets GetSecretValue on the **app_role** secret (not master), and `grantDecrypt` on **dynamodbKey** (which encrypts the app_role secret per api-stack.ts:211), **not** `dbSecretKey`. Carry to Task 8: the ExecuteWriteback Lambda must follow **C-2** — `set_config('app.tenant_id', :tid, true)` as the FIRST statement in the transaction.

### T4-F2 (HIGH — AOSS data-access principals are wildcard ARNs that resolve to nobody)
The `CfnAccessPolicy` Principal lists `arn:aws:iam::${account}:role/cumplify-*-agent-handler-*`, `...weight-seeder-*`, `...apply-template-*`. AOSS data-access policies require **exact** role ARNs — glob patterns are not matched; and CDK auto-generated role names won't match these patterns anyway (no `roleName` set). Result: agent handlers, seeder, and apply-template get **no** data access → AccessDenied on retrieval/seed/apply. Only the invoker ARN (exact) works.
**Fix:** use exact role ARNs. The seeder role exists now — use its exact ARN. Agent-handler (Task 8) + apply-template (Task 9) roles don't exist yet, so the data-access policy must be **amended in those tasks** with their exact ARNs (or give the roles fixed `roleName`s and construct exact ARNs). Do not ship wildcard principals.

### T4-F3 (HIGH — missing `aoss:APIAccessAll` IAM grant → data-plane AccessDenied)
AOSS data-plane access requires **both** the data-access policy **and** `aoss:APIAccessAll` in the principal's IAM policy. No role (invoker/seeder/…) has `aoss:APIAccessAll`. Without it, every data-plane call fails AccessDenied despite the data-access policy.
**Fix:** add an IAM statement `aoss:APIAccessAll` (resources = the 3 collection ARNs) to the invoker + seeder now (+ agent-handler, apply-template in Task 8/9).

### T4-F4 (HIGH — gate (b)/T-1 is NOT enforced by this diff)
No agent handler roles and no reusable read-only policy are created here — only a comment ("each agent handler role MUST use…"). The negative test asserts only that "no policy has `bedrock:InvokeModel` AND `rds-data:BeginTransaction` together." Agent handlers have **no** bedrock (only the invoker does), so this assertion **cannot** catch an agent handler with RDS write — it is vacuous for T-1's goal. Gate (b)'s headline ("agent handlers physically cannot write") is undelivered.
**Fix:** (1) create a shared read-only policy/factory in Task 4 that Task 8 is forced to attach; (2) write the CORRECT negative assertion (deferred to Task 8 when the roles exist): every agent-handler-pattern role has NO `rds-data` write and NO `dynamodb:PutItem/UpdateItem/DeleteItem` on domain tables. (3) Decide agent-handler RDS need: if context comes from the SQS event payload + AOSS retrieval, drop `rds-data` from agent handlers entirely (strongest T-1); if reads are needed, use a **read-only DB role/secret** — `rds-data:ExecuteStatement` cannot be restricted to SELECT via IAM.

### T4-F5 (MEDIUM — carry to Task 8): ExecuteWriteback Lambda invoke-permission must be SFN-only
The write-gating relies on ExecuteWriteback being invoked **only** by the HITL state machine post-approval. Its Lambda resource policy must allow invoke **only** from the HITL SM role — not agent handlers — else approval is bypassable.

## Disposition (R1)
DO NOT COMMIT. Rework required: F1 (app_role secret), F2 (exact ARNs), F3 (aoss:APIAccessAll), F4 (real read-only policy + assertion).

---

## Re-Review R2 (reworked, staged — vs working tree)
Verified on disk + wiring chain + 31/31 tests. **All 4 HIGH findings resolved:**
- **F1 ✓** ExecuteWriteback → `props.appRoleSecretArn` (app_role, NOT master); `dynamodbKey.grantDecrypt` (correct — app_role secret is encrypted with dynamodbKey, api-stack.ts:87-88). Wiring chain complete: ApiStack `public appRoleSecretArn` → cumplify-stage → AiStack prop. RLS bypass closed. (Carry to Task 8: C-2 set_config-first.)
- **F2 ✓** Data-access principals are exact `aiInvoker.role.roleArn` + `weightSeeder.role.roleArn`; agent-handler/apply-template AMENDED in Task 8/9. No globs.
- **F3 ✓** `aoss:APIAccessAll` on invoker + seeder + agent-handler policy, scoped to 3 collection ARNs.
- **F4 ✓ (write side)** `AgentHandlerReadOnlyPolicy` managed policy: zero rds-data, zero ddb write; agent handlers have NO RDS (context via SQS payload + AOSS). Negative assertion is now REAL (test: `rds-data:*` length 0, no Put/Update/Delete). T-1 write-gate enforced.
- **F5** carried to Task 8 (ExecuteWriteback invoke = SFN-only).

### Remaining before commit
- **T4R-F1 (MEDIUM — cross-tenant DDB READ):** `AgentHandlerReadOnlyPolicy` grants `dynamodb:GetItem/Query` on `[tableArn, tableArn/index/*]` with **no LeadingKeys condition** → reads any tenant's items. "Read-only" blocks writes, not cross-tenant reads; inconsistent with invoker (`TENANT#*#METER`), StoreToken (`TENANT#*#HITL`), and api-core's tenant-data role (session-tag LeadingKeys). **Fix:** the agent handler proposes then pauses (frontend polls HITL status, not the handler) — so most likely **remove** the DDB read entirely (matches "no RDS, context via payload + AOSS"). If a concrete read need exists, scope it with LeadingKeys to the exact prefix(es) and drop `index/*` unless a GSI read is required.
- **T4R-n1 (LOW):** section header says agent handlers get "SQS consume" but the policy has no SQS actions — CDK's SqsEventSource auto-grants at Task 8 (fine); correct the comment, and remember queue-CMK `kms:Decrypt` at Task 8 if the queues are encrypted.

**R2 verdict:** NOT APPROVED for commit — one MEDIUM (T4R-F1) remains, but it's a one-line scope/removal; everything else verified correct. Re-stage the DDB-read fix; quick diff re-confirm (no full round needed). Stays REQUIRES-HUMAN.

---

## Re-Review R3 (T4R-F1 fix) — APPROVED (REQUIRES-HUMAN sign-off)
Confirmed on disk + 31/31 tests: `AgentHandlerReadOnlyPolicy` now has only `lambda:InvokeFunction` (invoker) + `states:StartExecution` (HITL SFN) + `aoss:APIAccessAll` (retrieval) — **zero DynamoDB, zero RDS**; orphaned `dynamodbKey.grantDecrypt` on the policy removed; comment corrected. Negative assertion enforces both `rds-data:*` = 0 and `dynamodb:*` = 0. Cross-tenant read closed.

**Task 4 IAM: architect-approved to commit.** All findings resolved: F1 (app_role secret, RLS-safe write path), F2 (exact AOSS ARNs), F3 (aoss:APIAccessAll), F4 (T-1 enforced — agent handlers zero write, now zero DDB), T4R-F1 (no cross-tenant read).

### Carries into Task 8 / Task 9 (must be satisfied when those roles/Lambdas exist)
- **T-8a (C-2):** ExecuteWriteback Lambda must run `set_config('app.tenant_id', :tid, true)` as the FIRST statement in every transaction (RLS scoping on the app_role path).
- **T-8b (T4-F5):** ExecuteWriteback Lambda invoke-permission = HITL state-machine role ONLY (not agent handlers) — else approval is bypassable.
- **T-8c (T4-F2):** amend `AiAossDataAccessPolicy` READ block with exact agent-handler role ARNs; agent handler roles MUST attach `AgentHandlerReadOnlyPolicy`.
- **T-9a (T4-F2):** amend `AiAossDataAccessPolicy` WRITE block with the apply-template role's exact ARN; grant it `aoss:APIAccessAll`.
- **T-8d:** store-token Lambda (StoreTokenRole) wired into the HITL state machine's WaitForApproval (replaces the TODO placeholder); SQS ESM on capa-intake/records auto-grants consume — add queue-CMK `kms:Decrypt` if encrypted.
