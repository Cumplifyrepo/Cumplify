# Spec-41 Task 11 — ACC-1..7 witnessed runbook

Prepared by the architect 2026-07-16 (after T8/T10 closure + TPL-3 fix).
**Witness rule:** ACC-4 and ACC-5 are owner-witnessed → D5; the rest execute
D3 with the owner free to watch. Every executed row lands in
`acc-readback.log` with timestamp + exit code + outputs SHA.

## Session fixtures (verify before starting)

| Thing | Value |
|---|---|
| FormsFn | `Dev-ApiStack-FormsFn1509D4AD-*` (re-resolve: `aws lambda list-functions --query "Functions[?starts_with(FunctionName,'Dev-ApiStack-FormsFn')].FunctionName"`) |
| M4Fn (getAuditTrail) | `Dev-ApiStack-ResolverM4Fn*` |
| Cluster / master secret | `...auroracluster23d869c0-zmmgimmc0vnd` / `RdsMasterSecretC1475EBB-*` (db `postgres`) |
| Script tenant | `tenant-arch-smoke` (script lane) |
| UI tenant + creds | `tenant-AAA`, users `acc-aaa-admin` (QualityManager) / `acc-aaa-employee` (no groups), Pool B client `662fm2cthctp150bo5sa7i5o43`, SPA `d1tw2kanxo5wnt.cloudfront.net` |
| NCR template | `a0000001-0000-4000-8000-000000000001` (35 fields) |
| Mgmt-review template | `a0000001-0000-4000-8000-000000000002` (19 fields, requires_approval, maps_to NULL) |
| Probe script (committed) | `acc-scripts/lifecycle-seal-probe.mjs` (the T8 13/13 readback — run with `AWS_PROFILE=cumplify-dev-admin FORMS_FN=<fn> node …`) |
| Invoke shape | direct Lambda invoke with `{info:{fieldName}, arguments, identity:{resolverContext:{tenantId, sub, role}}}` |

## ACC-1 — template set + tenant-scope filter (TPL-3)

Seeded set = 15 templates (13 + audit-checklist generator resolved M3-native
per OQ-1 + NCR). Counts computed (BC-1 pins in `qms-forms-catalog.test.ts`).
The scope filter shipped 2026-07-16 (ACC-prep commit — the resolver had
claimed TPL-3 in a comment while returning everything; caught in runbook
prep. Four hermetic pins cover 9001-only / IMS / no-profile / IMS-marker;
live-verified both directions — see `../qms-document-engine/gen6-regenerate.log`).

1. Stage a 9001-only tenant (QmsFn `saveOrgProfile` on `tenant-acc-9001`
   with `standardsInScope:["ISO9001"]`) — or reuse if present.
2. Invoke FormsFn `listFormTemplates` as `tenant-acc-9001` → EXPECT: zero
   templates whose concrete standards exclude ISO9001 (no `aspects_impacts`,
   `hira`, `legal_obligations`, `incident_investigation`, `emergency`,
   `workerConsult`); `ncr` present; every `sectionCount`/`fieldCount` > 0.
3. Same invoke as `tenant-arch-smoke` (profile 9001+14001) → 14001 templates
   appear, 45001-only still hidden. An all-standards tenant sees all 15.
4. Cross-check one count: `SELECT COUNT(*) FROM forms.template_fields f JOIN
   forms.template_sections s ON f.section_id=s.id WHERE s.template_id='<ncr>'`
   == the returned `fieldCount` (35).

## ACC-2 — NCR renders + live counter + listRecords

UI lane (owner): SPA → Forms → NCR → new record; fill a few fields; watch
the completion chip move (server-computed — `completion{…}` rides the
GraphQL selection; the client renders, never computes: T7 acceptance).
Script lane: `createFormRecord` → `saveFormRecordValues` (2 fields) →
response `completion.fieldsFilled` increments and `requiredMissing` shrinks;
`listFormRecords(templateId)` returns the register page (closes the standing
BLOCKED `listRecords` item — note in the log). Paginated since T10: default
100, `limit`/`offset` args live.

## ACC-3 — relation stores UUID; cross-tenant target denied

The NCR `linked_capa` field is `relation → corrective_action`.
1. Positive: save `clause_ref` with a real registry UUID → stored; re-read
   shows the UUID (`values` JSON).
2. **Cross-tenant negative (the RLS proof):** as `tenant-arch-smoke`, save
   `linked_capa` = tenant-AAA's corrective-action id (child of NC
   `63fe7200-…`; look it up: `SELECT id FROM m2.corrective_actions WHERE
   nc_id='63fe7200-eb2a-438f-b564-09947874f653'`) → EXPECT
   `LINK_TARGET_NOT_FOUND`, whole save rolled back (re-read: field absent).
   The row EXISTS — only RLS makes it invisible; that is the point.
3. Random UUID → same error (existence half).

## ACC-4 — NCR→M2 mapping, negative FIRST (WITNESSED → D5)

Negative first, owner watching:
1. Create NCR record; fill everything EXCEPT `severity`; submit → EXPECT
   `MAPPING_INCOMPLETE`; then prove ZERO writes:
   `SELECT COUNT(*) FROM m2.nonconformities WHERE tenant_id='<t>'` unchanged
   vs pre-submit count (capture both).
2. Fill `severity`; submit → EXPECT COMPLETE + `m2NcId` set; then:
   `SELECT standard, source, nc_type, clause_ref, severity FROM
   m2.nonconformities WHERE id='<m2NcId>'` — values are the MAPPED ones
   (clause_ref is the TEXT clause number dereferenced from the registry UUID,
   e.g. '8.7'); one `m2.corrective_actions` row with `nc_id=<m2NcId>`.
3. Zero new m2 columns: `\d m2.nonconformities` column list matches
   migration 003 (no additions).
UI lane alternative: fill the NCR in the SPA and watch the NC appear in the
M2 register. Prior D3: wave readback 2026-07-15 (both directions, F1
reopen→resubmit = exactly 1 NC + 1 CA).

## ACC-5 — SoD (WITNESSED → D5)

Use the mgmt-review template (no m2 side effects):
create → fill 15 required → submit as user X → approve as user X → EXPECT
`SOD_VIOLATION`, and `Security.SodViolationBlocked` lands in the trail
(ACC-6 step reads it back); approve as user Y → APPROVED (+ the T8 seal —
ACC-7 rides the same record). UI lane: `acc-aaa-employee` completes,
`acc-aaa-admin` approves; same-user approve first to see the block.
Script lane: `acc-scripts/lifecycle-seal-probe.mjs` rows 6–8 do exactly this
deterministically.

## ACC-6 — lifecycle transitions retrievable via getAuditTrail

Invoke M4Fn `getAuditTrail` (tenant of the ACC-5 record) → EXPECT the chain
for that record id in the payloads: `FormRecord.Submitted` →
`Security.SodViolationBlocked` → `FormRecord.Approved` (+`FormRecord.Reopened`
if exercised), hash-chained (`prevHash` continuity spot-check on two adjacent
items). Prior D3: T8 verified the same chain directly in DDB.

## ACC-7 — record PDF + sealing pointer

One command re-executes the whole T8 proof (13 rows, exit 0):
`AWS_PROFILE=cumplify-dev-admin FORMS_FN=<fn> node acc-scripts/lifecycle-seal-probe.mjs`
Key rows to witness: presigned URL serves `%PDF-` bytes; S3 Object-Lock
retention == `m4.records.retain_until` == `object_lock_until` to the ms;
`forms.records.m4_record_id` stamped. Each run creates + seals one record
(GOVERNANCE-locked until +7y) — add to the purge list.

## Purge after session

Records/NCRs created above on both tenants (+ sealed PDFs bypass-deletable,
GOVERNANCE); update the standing purge list in the evidence log.
