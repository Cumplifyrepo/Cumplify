# Audit-trail entityId + GSI1 follow-up — architect execution log

**Date:** 2026-07-16 · **Executor:** architect (direct) · **Scope:** the follow-up
scoped 2026-07-14 during the frontend-app Phase C validation ("normalized
entityId attribute + GSI is the correct long-term fix" — getAuditTrail doc
comment, dd605b0), executed against the current tree (post spec-40/41).

## What shipped

1. **Envelope** (`services/eventing/src/types.ts`, `contracts/events.md`):
   `CumplifyEvent.entityId?: string` — optional so pre-existing publishers stay
   valid; passes through all rule input transformers unchanged (they map
   `$.detail` whole) and the consumer's required-field validation (allowlist of
   required fields only). ZERO EventingStack changes.
2. **Publisher** (`services/api/src/resolvers/shared.ts`):
   `PublishAuditEventOptions.entityId: string` — **REQUIRED**, so tsc enumerates
   every call site. Rule: entityId = the id of the row the mutation returns
   (`marshalOne(result).id`); blocked/negative events carry the targeted row id;
   `''` = no entity (no GSI stamping).
3. **Appender** (`services/audit-trail/src/appender.ts`): non-empty entityId →
   item gains `entityId`, `GSI1PK = TENANT#<t>#ENTITY#<id>`, `GSI1SK = SK`
   (sparse index; GSI1 was unused — GSI9 is HITL's). GSI keys sit OUTSIDE the
   hash chain by construction (payloadHash covers payload; prevHash covers
   PK/SK/payloadHash). Consumer passes `event.entityId` through.
4. **All 37 `publishAuditEvent` call sites** declare entityId: m1 ×7, m2 ×6,
   m3 ×5, m4 ×4, m5 ×3, hitl-approval ×1, forms ×5, qms ×2, qms-generation ×3.
   Marshal-first sites (id existed only in RETURNING): Document.DraftCreated,
   Document.Approved (approval id, NOT versionId), NC.Raised, CAPA.RootCause
   Recorded/Opened/EffectivenessVerified/OutputDisposed, Audit.Programme
   Created/Scheduled/FindingRaised, Record.Registered, Calibration.Recorded,
   Record.RetentionPolicySet, Risk.TreatmentAdded, Change.Planned,
   Scope.Changed (applicability). Payloads gained the row's own id where absent.
   **F-A CLOSED** (spec-9 routed finding): `NC.Raised` payload now carries the
   real `ncId` — the mutation→agent chain was dead on input-only payloads.
5. **getAuditTrail** (`services/api/src/resolvers/m4.ts`): GSI1 Query first
   (paginated, `itemType = AUDITLOG` filter, most-recent-first); fallback to the
   pre-existing partition substring scan ONLY on zero GSI hits (pre-migration
   events). Owner decision point from the 2026-07-14 scoping — "keep the scan
   fallback (recommended default)" — implemented as recommended; mixed pre/post
   entities return GSI hits only (backfill = upgrade path, noted in code).

## Catalog corrections vs the 2026-07-14 scoping

- The 3 latent payload-key bugs (m2 dispose `nonconformityId`, m3 scheduleAudit
  `scheduledDate`, m3 recordFinding `severity`) were **already fixed** by the
  574afce full-phase-validation wave — nothing to do.
- The call-site catalog grew 24 → 37 (forms.ts, qms.ts, qms-generation landed
  with specs 40/41 after the scoping).

## Findings flagged (NOT fixed here — owner disposition)

- **FACADE: `Mutation.appendAuditEvent`** (`schema.graphql:619`, @aws_iam;
  resolver attached at `api-stack.ts:563` on m4DS) has NO case in m4.ts's
  switch — any call throws `Unknown field`. Zero callers exist anywhere
  (agents publish via eventing `publish()` directly). Same class as GEN-6.
  Recommend: remove field + resolver + count-tripwire decrement in a dedicated
  commit, or implement if a consumer is planned.
- **CARRY: `Agent.WritebackCommitted` has no row id at all** — execute-writeback
  publishes `{before: null, after: {tool, result: {records: N}}}`; the
  writeback SQL doesn't RETURN ids. Neither the GSI nor the old substring
  fallback can associate these events with an entity. Fix belongs with the
  writeback contract (RETURNING id + envelope entityId) — named follow-up.

## Gates (executed 2026-07-16)

| Gate | Result |
|---|---|
| tsc --noEmit | exit 0 (the required field flushed exactly 1 non-prod site: a type-pin test) |
| services suite | 896 passed / 3 skipped, exit 0 (was 887 — +9: 4 appender GSI, 2 getAuditTrail, 5 entity-id pins, −1 rewritten) |
| frontend suite | 121 passed, exit 0 |
| cdk synth | exit 0, 0 Nag NC |
| npm run verify step 3 (eslint) | PRE-EXISTING FAIL — identical error set at HEAD a07e5d1 and this tree (verified via git stash A/B); recent closures gate on tsc/suite/synth. Debt noted, not introduced here. |

## Deploys (dev 697114252993, profile cumplify-dev-admin, all exit 0)

| Stack | Time | Why |
|---|---|---|
| CumplifyPipeline/Dev/AuditTrailStack | 42.87s | consumer + appender bundle |
| CumplifyPipeline/Dev/ApiStack | 78.35s | resolver bundles (m1–m5, forms, qms, hitl) |
| CumplifyPipeline/Dev/AiStack | 63.50s | qms-generation bundles (compose/finalize/regen import shared.ts) |

Deploy order: AuditTrailStack FIRST (consumer must forward entityId before
publishers start sending it).

## Live readback (2026-07-16, all against deployed dev; outputs SHA 0d333473943281d7)

| # | Probe | Timestamp (UTC) | Result |
|---|---|---|---|
| 1 | `createRisk` direct-invoke ResolverM5Fn as tenant-arch-smoke | 15:52:26Z | 200, risk `7d1cc4d2-1732-42d0-a060-1057abcdf683`, rating 4 db-computed |
| 2 | Newest AUDITLOG item | 15:52:51Z | `Risk.Created` w/ `entityId=7d1cc4d2…`, `GSI1PK=TENANT#tenant-arch-smoke#ENTITY#7d1cc4d2…`, `GSI1SK==SK` (ULID 01KXNT2736ZETBGK2TNYBA5PED) |
| 3 | CLI Query GSI1 on that GSI1PK | 15:53:12Z | count=1, correct eventId — index serves it |
| 4 | `getAuditTrail(entityId)` resolver e2e (ResolverM4Fn) | 15:53:12Z | 200, 1 event, eventId matches (GSI path — unit pin proves no-fallback-on-hit) |
| 5 | `getAuditTrail` on PRE-migration entity `84f5923a…` (Context.Updated item w/ NO entityId attr) | 15:53:40Z | 200, 1 event via fallback scan — pre-migration events still reachable |
| 6 | Cross-tenant: smoke risk id under tenant-a context | 15:53:40Z | 200, **0 events** (different-tenant GSI1PK + fallback finds nothing) |
| 7 | ChainVerifierFn all tenants | 15:53:58Z | 15/15 `chainValid=true`, `s3Mismatches=0` incl. tenant-arch-smoke (46 items, includes the newly STAMPED item) — GSI attrs provably outside the chain |

## Purge

- m5.risks `7d1cc4d2-1732-42d0-a060-1057abcdf683` DELETEd (1 row), register
  matview refreshed. The AUDITLOG item remains BY DESIGN (append-only ledger;
  whole-partition purge only).

## Notes for future sessions

- GSI1 projection is ALL (CDK default, data-stack.ts:88) — resolver reads full
  items off the index.
- The FF-5 source tripwire (gsi-prefix.test.ts) captures the text following any
  `GSI\dPK` occurrence to the next quote — a same-line comment naming the
  tenantId prefix is the compliant pattern for KeyConditionExpression usage.
- Old events are NOT backfilled — getAuditTrail's zero-hit fallback covers
  them; a backfill (add attributes only, chain untouched) is safe if per-entity
  completeness across the migration boundary ever matters.
