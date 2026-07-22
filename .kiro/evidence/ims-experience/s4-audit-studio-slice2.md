# S4 Audit Studio Slice 2 — Build Evidence

**Date:** 2026-07-22 · **Builder:** Kiro · **Session:** B1 backlog items
**Base commit:** `cbffddc` · **cdk-outputs.json blob SHA:** `b91620ef1c49542e`

## B1.1 — completeAudit surfaced as studio action

### IAM verification (L8)

The `completeAudit` resolver (m3.ts:215–237) exercises:
- `beginTenantTransaction(tenantId)` → RDS Data API calls (ExecuteStatement,
  BeginTransaction, CommitTransaction, RollbackTransaction)
- `publishAuditEvent(...)` → EventBridge PutEvents

Both are granted to `resolverFns[2]` (the m3 Lambda) in api-stack.ts:
- L280–295: `rds-data:*` on `props.clusterArn`
- L297–301: `secretsmanager:GetSecretValue` on `appRoleSecret.secretArn`
- L303–307: `events:PutEvents` on `props.busArn`

**Verdict:** Full IAM coverage. No missing grant.

### UI mount site

- Interactive element: `frontend/src/app/(authenticated)/audits/page.tsx:346`
  - `<SecondaryButton onClick={() => handleCompleteAudit(a)}>`
  - Gated by `a.status !== 'completed'` — renders only for non-completed audits
- Handler calls `mutate(COMPLETE_AUDIT, { id: audit.id })` then refreshes the list
- Test: `page.test.tsx` "expanded detail shows Complete audit action" + conditional
  hide test for completed status

## B1.2 — Readiness scoring surfaced as studio action

### Existing capability located

- Schema: `getAuditReadiness(standard: Standard!): [ReadinessScore!]! @aws_lambda`
  (schema.graphql L591)
- Resolver: m3.ts handler switch → `getAuditReadiness` → queries
  `m3.audit_readiness_scores WHERE standard`
- Wired in api-stack.ts as `GetAuditReadiness` resolver on m3DS

### UI mount site

- Interactive element: `frontend/src/app/(authenticated)/audits/page.tsx:314`
  - `<SecondaryButton onClick={() => handleFetchReadiness(a.standard)}>`
  - "View readiness scores" — fetches and renders per-clause score badges
- Grid: page.tsx:327 — `readinessScores.map(rs => ...)` with StatusBadge
  (APPROVED ≥100, PENDING >0, DRAFT =0)
- Error state: surfaces error message on failure (amendment 1)
- Empty state: explicit "No readiness scores available" when fetched and empty
- Tests: `page.test.tsx` "expanded detail shows View readiness scores action",
  "readiness button renders error message on failure",
  "readiness button renders explicit empty state when scores are empty"

## B1.3 — runAuditFindings dispatch unit test

### File

`services/api/__tests__/resolvers/m3-runAuditFindings.test.ts`

### Tests (4)

| # | Name | Assertion |
|---|------|-----------|
| 1 | Happy path (Event-invoke + DISPATCHED + NO audit event) | payload structure, InvocationType=Event, L3 pinned |
| 2 | VALIDATION: empty auditId | throws before Lambda send |
| 3 | AUDIT_NOT_FOUND | throws when DB returns no rows |
| 4 | LEAD_AUDITOR_NOT_AVAILABLE | L4: call-time env read, throws when empty |

### Shape parity with qms.runManualSectionDraft

- Hoisted mocks: mockExecute, mockCommit, mockRollback, mockPublishAuditEvent, mockLambdaSend
- LambdaClient/InvokeCommand class mocks
- shared.js mock with beginTenantTransaction + publishAuditEvent
- Call-time env: `process.env.LEAD_AUDITOR_FN_ARN` set before import
- L3 assertion: `expect(mockPublishAuditEvent).not.toHaveBeenCalled()`

## B1.4 — RS-3..RS-5 folds: DEFERRED

**Reason:** The `read-surface-completion` spec has ONLY `requirements.md` —
no `design.md` or `tasks.md` exist. RS-3 (listAuditEvents), RS-4
(listRetentionPolicies), RS-5 (listRecords) each require:
- New Query fields in schema.graphql (+ AuditEventPage type for RS-3)
- New handler cases in m4.ts
- New resolver registrations in api-stack.ts
- Resolver pin bump (98 → 101) with dated changelog

This constitutes a full spec implementation (design + implement + test +
pin bump + changelog), not a fold of existing surface into the Audit Studio.
**DEFERRED to the read-surface-completion spec's own implementation phase.**

## Backlog note (flagged for next slice)

`completeAudit` (m3.ts:225) hardcodes `clauseRef: 'ISO 9001 9.2'` and
`standard: 'ISO9001'` in its `publishAuditEvent` call regardless of the
audit's actual standard. Should read from the returned row's `standard`
field. Flagged — not fixed in this slice (mutation behaviour change requires
design-before-implementation per 14-simplicity rule).

## Test evidence (rule 8 — timestamp, exit code, outputs SHA)

| Run | Timestamp (UTC) | Exit | Result |
|-----|-----------------|------|--------|
| Backend vitest | 2026-07-22T23:47:27Z | 0 | 1266 passed, 3 skipped |
| Frontend vitest | 2026-07-22T23:48:02Z | 0 | 203 passed |
| Root tsc --noEmit | 2026-07-22T23:48:39Z | 0 | clean |
| Frontend tsc --noEmit | 2026-07-22T23:48:48Z | 0 | clean |

**Outputs digest:** `059539324d7b9ac1` (sha256 of summary line)
**Resolved against:** `cdk-outputs.json` blob `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Baselines

| Lane | Before (slice 1 close) | After (amendment) | Delta |
|------|------------------------|-------------------|-------|
| Backend | 1262 / 3 skip | 1266 / 3 skip | +4 (m3-runAuditFindings) |
| Frontend | 198 | 203 | +5 (B1.1×2, B1.2×1, amendment×2) |
| Resolver pin | 98 | 98 | 0 (no new resolvers) |
| Root tsc | clean | clean | — |
| Frontend tsc | clean | clean | — |
