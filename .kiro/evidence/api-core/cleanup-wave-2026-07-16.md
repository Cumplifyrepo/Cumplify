# Cleanup wave 2026-07-16 (owner-approved) — architect execution log

Owner approved all three items flagged in the entityId+GSI follow-up
([entityid-gsi-followup.md](entityid-gsi-followup.md)). One commit each.

## A — Mutation.appendAuditEvent orphaned-facade removal (commit cab5e84)

Schema field + `AppendAuditEventInput` + CDK resolver (api-stack.ts:563)
removed; zero callers existed (agents publish via the eventing publisher);
any call threw `Unknown field` (no m4.ts case — GEN-6 class). Resolver-count
tripwire 85→84 (test title stale-said 70; corrected).

| Gate/Probe | Timestamp (UTC) | Result |
|---|---|---|
| tsc / suite / synth | 16:04Z | 0 / 896+3 & 121 / exit 0, 0 Nag |
| ApiStack deploy | — | 80.16s exit 0 |
| Live Mutation resolver list (paginated) | 16:07:08Z | 49 resolvers, `appendAuditEvent` ABSENT |
| Live SDL (get-introspection-schema) | 16:07:08Z | 0 occurrences of appendAuditEvent / AppendAuditEventInput |

### Side investigation — SPA endpoint false alarm (recorded so it isn't re-chased)

Readback A initially "found" `cdk-outputs.json` GraphqlApiUrl pointing at a
host (`42yckio3…`) that 404'd control-plane calls, while `GraphqlApiId` says
`iwmbmd4n…`, and the served SPA bakes `42yckio3…`. Resolution:
**AppSync GraphQL endpoint DNS ids are NOT the API id** —
`get-graphql-api --api-id iwmbmd4n…` returns URI host `42yckio3…`. Outputs
file, `.env.local`, and the served SPA are all CORRECT; endpoint liveness
confirmed (unauthenticated POST → 401 fail-closed, 16:10Z). No action taken.
LESSON: never treat an AppSync URL subdomain as an api-id.

## B — Agent.WritebackCommitted carries the written row's id (this commit)

`writtenRow()` captures `RETURNING id` (first column of every tool's
RETURNING clause) into `writeResult.id`; `emitWritebackAuditEvent` stamps it
as envelope `entityId` → the ledger GSI1 now covers agent writebacks. First
dedicated hermetic suite added (`services/agents/__tests__/execute-writeback.test.ts`, 5 tests).

**Bonus defect found+fixed in the same file (dd605b0 stale-draft-schema
class):** `executeRecordsRetentionSchedule` targeted columns that never
existed (`record_category`/`retention_period`/`justification` vs migration
005's `record_type`/`retention_years`/`disposition_rule`) AND used
`ON CONFLICT (tenant_id, record_category)` with NO unique constraint on the
table — every live call would have failed; never exercised (Task-16 ACC-3
ran capa-open only). Rewritten: SELECT-then-UPDATE-or-INSERT keyed on
(tenant, record_type); `retention_years` = leading integer of the tool's
`retentionPeriod` arg; `'permanent'` throws `RETENTION_PERIOD_UNREPRESENTABLE`
loudly (INTEGER NOT NULL — needs a schema decision, never a sentinel);
`disposition_rule` defaults to the platform's established
`review_before_disposal` (m1 sealing-path convention); `justification` rides
the audit payload (closeCapa closureNotes precedent).

| # | Probe (direct-invoke Dev-AiStack-ExecuteWritebackFn111C8A23-rgLwEbUPjomi, tenant-arch-smoke) | Timestamp (UTC) | Result |
|---|---|---|---|
| B1 | retention-schedule 7-year (FIRST live run of this tool ever) | 16:17:18Z | `{status: COMMITTED, auditEventId: 01KXNVGAQ8…}` |
| B2 | RDS row | 16:18:01Z | id `9f75dba3-…`, record_type arch-readback-cat, retention_years 7, disposition review_before_disposal, version 1 |
| B3 | rerun 5-year → UPDATE path | 16:18Z | SAME id, retention_years 5, version 2 (no duplicate row) |
| B4 | 'permanent' | 16:18Z | FunctionError, `RETENTION_PERIOD_UNREPRESENTABLE…` — fail-closed, rollback |
| B5 | GSI1 query on `TENANT#tenant-arch-smoke#ENTITY#9f75dba3…` | 16:18:33Z | count 2, both `Agent.WritebackCommitted`, entityId stamped |
| B6 | `getAuditTrail(9f75dba3…)` resolver e2e | 16:18Z | 200, 2 events most-recent-first, dual actor `agent:RecordsVault+human:architect-readback` |

Gates: tsc 0 · suite 901+3 / 121 · AiStack deploy 63.28s exit 0.
Purge: retention_policies row `9f75dba3…` DELETEd (1 row). AUDITLOG items
remain by design.

Known residual (documented in fn comment): 'permanent' retention is
unrepresentable in the ratified schema — owner schema decision if the
RecordsVault agent should be able to express it.

## C — eslint debt cleared (see section appended by the C commit)
