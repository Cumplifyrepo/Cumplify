# api-core Tasks 1–6 — Architect Checkpoint Review

**Date:** 2026-07-07
**Reviewer:** Architect (independent on-disk + corpus verification; report NOT trusted)
**Commits reviewed:** b0bb46e (T1), e600127 (T2), d36b30b (T3), 2ceaa74 (T6), dea438d (T4), c74a593 (T5)
**Verdict:** NOT CLEAR TO PROCEED to Tasks 7–9 until C-1 remediation plan folded in + H-1 reconciled.

## Independently verified CLEAN
- 212/212 tests pass (ran `npx vitest --run` myself — genuine, incl. OQ-5 `detail.auditTrail` R-3 assertion).
- `tenant_id TEXT` on all tables → RLS comparison `tenant_id = current_setting('app.tenant_id')` is clean text/text (no cast hazard).
- RLS ENABLED + FORCE ROW LEVEL SECURITY on all 23 base tables (owner not exempt).
- Publisher registry parity test is bidirectional AND value-checked (registry→doc, doc→registry, true/false match). 58 entries, matches contracts/events.md exactly.
- R-3 pattern correctly rewritten to `{ detail: { auditTrail: [true] } }`.
- DataStack `enableDataApi: true` + clusterArn/dbSecretArn exports correct.
- SECURITY DEFINER accessor `SET search_path = m5_views, m5, pg_temp` (pg_temp last — hardened correctly).
- SCHEMA-5 satisfied: no `tenantId` in any GraphQL `input` type (mutation inputs clean); the 6 tenantId args are on queries/subscriptions (scoped by resolver against claim).

## FINDINGS

### C-1 (CRITICAL) — Matview cross-tenant leak; no least-privilege app_role
No `app_role` is created in any migration. The migrator (and, per design §7.4,
the resolvers) connect via the cluster MASTER secret (`dbSecretArn`).
- Base tables: RLS + FORCE RLS DO constrain the master (Aurora rds_superuser
  lacks BYPASSRLS) — base-table isolation holds.
- Materialized view `m5_views.risk_register_view`: RLS cannot apply. Its only
  protection was `REVOKE ALL ... FROM app_role` + SECURITY DEFINER accessor.
  Migration 008 wraps that in `IF EXISTS (app_role)` — app_role does not exist,
  so the REVOKE/GRANT SILENTLY NO-OPS. The master connection retains direct
  SELECT → any resolver can `SELECT * FROM m5_views.risk_register_view` and read
  ALL tenants' cross-standard risk rollup. Cross-tenant leak = highest severity.
- Secondary: app-as-DB-owner makes FORCE RLS the single fragile guard on 23 tables.
**Fix (build, before Task 10 wires resolvers):** create dedicated `app_role`
(LOGIN, NOSUPERUSER, NOBYPASSRLS, non-owner) in a new migration; provision an
app_role Secrets Manager secret in DataStack; resolvers use THAT secretArn for
Data API; migrator keeps master for DDL only. Then 008's REVOKE/GRANT applies.
Touches DataStack (secret) + IAM → folds into the REQUIRES-HUMAN surface.

### C-2 (CRITICAL, latent — enforce in Task 10) — transaction-local tenant context
RLS reads `current_setting('app.tenant_id')`. Data API pools/reuses connections.
Tenant context MUST be set with `set_config('app.tenant_id', :tenantId, true)`
(transaction-local) as the first statement inside a BeginTransaction, every
request. Any use of `false` (session-scoped) or a bare ExecuteStatement outside
a transaction risks the value persisting to the NEXT tenant on a reused pooled
connection = cross-tenant leak. Make this a review-blocking invariant in Task 10
with a reused-connection test (second request without set_config → zero rows,
never the prior tenant's).

### H-1 (HIGH, truth rules 7–8) — checkboxes/evidence not reconciled
6 tasks of code committed; 0/86 tasks.md checkboxes ticked; no per-task evidence
logs under .kiro/evidence/api-core/. Rule 7 = checkbox + evidence in the same
commit as the work. Reconcile before the checkpoint closes.

### M-1 (MEDIUM) — current_setting missing_ok
007 policies + 008 function use `current_setting('app.tenant_id')` with no
second arg → raw error when unset. Prefer `current_setting('app.tenant_id', true)`
→ NULL when unset → `tenant_id = NULL` → zero rows (clean fail-closed).

### L-1 (LOW) — reporting inaccuracy
Kiro report says "54-event registry"; actual map is 58 entries (correct, parity
green). Correct the number.

### L-2 (LOW, functional) — matview refresh not wired
008 leaves refresh as "future." Dashboard would be stale. Carry to Task 10/11 or
a named follow-up.

## Disposition
Tasks 7–9 (ApiStack, authorizer, tenant-data role) do NOT start until Kiro folds
the C-1 app_role remediation into the plan (it belongs with the REQUIRES-HUMAN
surface) and reconciles H-1. C-2 baked into Task 10 as an invariant + test. No
AWS deploy at this checkpoint (nothing deployable until 7–11; would not deploy
over C-1 regardless).

---

## REMEDIATION VERIFIED (2026-07-07, commit 25b5bbc) — CHECKPOINT PASSED

Architect re-verified each fix on disk (not the report):
- C-1 CLOSED: migration 009 creates app_role (LOGIN NOSUPERUSER NOBYPASSRLS
  NOCREATEDB NOCREATEROLE, non-owner → RLS applies); GRANT USAGE on 6 schemas
  + DML on all 23 base tables; matview REVOKE ALL + GRANT EXECUTE on the
  accessor run UNCONDITIONALLY in 009 (after the role exists) — the silent
  no-op is gone. Matview reachable only via the SECURITY DEFINER accessor,
  which filters by app.tenant_id. Cross-tenant leak eliminated.
- C-2: transaction-local invariant documented in migration-runner.ts; Task 10
  carries it as a review-blocking item + reused-connection test.
- M-1 CONFIRMED: 007 USING + WITH CHECK and 008 accessor all use
  current_setting('app.tenant_id', true) → NULL when unset → zero rows.
- H-1 CONFIRMED: Tasks 1–6 checkboxes ticked; tasks-1-6-evidence.log carries
  per-task command/timestamp/exit-code/commit ref (rule 8).
- L-1/L-2 handled.

### CARRY into Task 7/8 (REQUIRES-HUMAN surface) — must-verify at pre-review:
- app_role PASSWORD SYNC: 009 creates app_role LOGIN with NO password. Data
  API authenticates via the secret. Task 7 must not only provision the
  app_role secret but SYNC the DB role's password to it (ALTER ROLE app_role
  PASSWORD <from secret>, e.g. a deploy-time step / rotation single-user on
  app_role). Without it, app_role cannot authenticate and every resolver DB
  call fails (fail-closed functional break; would surface at ACC-1/ACC-5).

**Disposition: Tasks 7–9 cleared to be WRITTEN by Kiro. Code stops for
architect pre-review + owner REQUIRES-HUMAN sign-off before any merge/deploy.**
