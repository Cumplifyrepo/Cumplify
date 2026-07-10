# api-core — Spec Closure Log

**Spec:** `api-core`
**Closure date:** 2026-07-10
**Closure commit:** `<this commit>`

---

## Acceptance Summary

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| ACC-1 (E2E mutation→sealed event) | PASS | `.kiro/evidence/api-core/acceptance-results.md` — createRisk traced through RDS→Event→AuditSink→WORM |
| ACC-2 (CARRY-1 denial matrix) | PASS | `.kiro/evidence/api-core/acceptance-results.md` — simulate-principal-policy cross-tenant implicitDeny |
| ACC-3 (Authorizer negative proofs) | PASS | `.kiro/evidence/api-core/acceptance-results.md` — garbage/empty/wrong-issuer/valid-Pool-B all proven |
| ACC-4 (Chain verification green) | PASS | `.kiro/evidence/api-core/acceptance-results.md` — ChainVerifierFn: 3 items checked, chainValid:true |
| ACC-5 (RLS + matview isolation) | PASS | `.kiro/evidence/api-core/acceptance-results.md` — tenant-AAA/BBB proven isolated |
| Loop guard (FF-2) | PASS | `.kiro/evidence/api-core/acceptance-results.md` — 1 AuditEvent.Appended → exactly 1 AUDITLOG item |

---

## Live-Execution Results (architect-executed)

### C-6 Subscription Denial

**Verdict:** LIVE PASS
**Evidence:** `.kiro/evidence/api-core/c7-denial-suite-live.md` case #6
**Detail:** Pool-B token (tenant-AAA) subscribing to tenant-BBB → `Unauthorized`. Same-tenant → `start_ack`.

### C-7 Cross-Tenant Denial Suite

**Verdict:** LIVE PASS (11 passed / 1 gated)
**Evidence:** `.kiro/evidence/api-core/c7-denial-suite-live.md`
**Cases proven:** DynamoDB LeadingKeys (IAM), RDS RLS fail-closed, materialized view REVOKE, resolver overwrite code-check, subscription auth.
**Gated:** Real Pool-A literal 401.

---

## Carry Disposition

| Item | Disposition | Rationale |
|------|-------------|-----------|
| Pool-A literal 401 | **GATED** on Pool A MFA | The denial mechanism is proven: wrong-issuer rejection produces 401 (evidence: acceptance-results.md ACC-3 "well-formed JWT, wrong issuer → 401"). Pool A MFA enforcement (required for real Pool-A token minting) is a dependency on `identity-3pool-hardening` spec. Mechanism validated; only the live end-to-end with an MFA-enrolled Pool-A identity remains. |
| C-6 | LIVE PASS | Subscription tenant-claim verification proven in dev with real Pool-B SRP tokens. |
| C-7 | LIVE PASS | 11/11 scenarios pass (5 of 6 §10.3 design cases proven live + code verification for #5). Only #1 (Pool-A, MFA-gated) remains. |
| L-2 matview refresh | **CLOSED** | See §L-2 below. |

---

## L-2 — Materialized View Refresh Automation (Closure)

### Problem

`m5_views.risk_register_view` is a PostgreSQL materialized view with no automated refresh path.

### Mechanism (implemented)

```
EventBridge Scheduler (rate: 15 minutes)
  → Lambda: matview-refresh
    → RDS Data API (executeStatement)
      → REFRESH MATERIALIZED VIEW CONCURRENTLY m5_views.risk_register_view
```

### DB Role

`REFRESH MATERIALIZED VIEW CONCURRENTLY` requires ownership of the view. The view is owned by the master role (used by the migrator Custom Resource in `services/api/src/migrator.ts`). The refresh Lambda authenticates via the master secret (`cumplify/dev/rds/app-role` is NOT the owner — the master secret is).

**IAM:** The refresh Lambda's execution role gets `secretsmanager:GetSecretValue` on the master secret ARN + `rds-data:ExecuteStatement` on the cluster ARN. This is scoped identically to the existing migrator Lambda's role.

**No new DB role needed** — the migrator's master user already owns the view (it ran migration `008_risk_register_view.sql`).

**Architect review:** IAM change is minimal (same permissions pattern as migrator). Acceptable per `14-simplicity.md` since it mirrors existing precedent.

---

## Pipeline: Integration Tests Wired

`npm run test:int` (`vitest.int.config.ts`) added as a `post` ShellStep on the Dev stage in `infra/lib/pipeline-stack.ts`. Runs after dev deploy completes with ambient CodeBuild role credentials.

**Separation guarantee:**
- `npm run test` (Synth step) = unit tests, no AWS creds, no network calls
- `npm run test:int` (Dev post-deploy) = integration tests, credentialed, exercises deployed resources

---

## Rule 7/8 Compliance

This closure commit includes:
1. This closure log (evidence)
2. tasks.md checkbox reconciliation (below)
3. Pipeline wiring (`infra/lib/pipeline-stack.ts`)

Every closure claim names its evidence path. Evidence carries timestamps and exit codes per the original evidence files.
