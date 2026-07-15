# QMS Forms & Records Engine — Tasks

**Spec:** `qms-forms-engine` (spec 41)
**Design approved:** R1 (this commit)
**Convention:** `[KIRO]` = Kiro executes. `[ARCHITECT]` = architect executes (migrations to live, deploys, readbacks, shared PDF/sealing infra). `[REQUIRES-HUMAN]` = owner reviews before merge.
**Evidence contract:** Rule 7 — checkbox edits ONLY in the same commit as the evidence log. Rule 8 — readback rows carry timestamp + exit code + outputs SHA. Evidence path: `.kiro/evidence/qms-forms-engine/`.
**Standing rules:** SCHEMA-5. Never `extend type`; explicit schema node dependency per resolver. Hermetic unit lane (SQL/param-asserting tests against REAL migration column names — the M2 lesson). Steering 19 §9: a hardcoded `clause_ref`/`severity` default to make a row insert is fabrication — throw `MAPPING_INCOMPLETE` instead. i18n en/es/pt same commit.

---

## Task 1 — Migration `012_qms_forms.sql` [KIRO, ARCHITECT deploys]

- [x] Author per design §2: `forms.templates` / `template_sections` / `template_fields` (tenant-less catalog, SELECT-only for `app_role`, CHECK constraints incl. relation_target rule); `forms.records` + `forms.record_values` (typed value columns, `UNIQUE(record_id, field_id)`, exactly-one-value CHECK, partial indexes).
- [x] RLS ENABLE + FORCE + tenant policy + `app_role` grant on `forms.records` + `forms.record_values`; cross-tenant denial test extended.
- [ ] [ARCHITECT] Review, apply to dev, live-verify `pg_policies` + denial test.

**Depends on:** spec-40 Task 1 (same migration wave; `IMS` enum + clause registry land there). **D-rung:** D3. **Evidence:** `task-1-migration.log`

## Task 2 — Template catalog seed (TPL-4, TPL-5, BC-3) [KIRO]

- [x] Seed the wave-1 catalog (design §6, 15 templates) as data rows: sections, typed fields, i18n label keys (en/es/pt catalogs same commit), clause_refs, standards arrays.
- [x] NCR template: competitor-parity spine (≥30 fields; disposition as SELECT with Use-As-Is/Rework/Repair/Scrap/Return options — not text) PLUS the BC-3 required mapped fields (`standard`, `source` restricted to the four legal values, `nc_type`, `clause_ref` relation→clause registry, `severity`).
- [x] Tests: counts computed from rows (a literal "30 fields" string anywhere = reject); every `maps_to_column` on the NCR resolves to a real `m2.nonconformities`/`m2.corrective_actions` column (asserted against migration 003 names); TPL-3 filter fixtures.

**Depends on:** Task 1. **D-rung:** D2 (seed applies with Task 1 deploy). **Evidence:** `task-2-catalog.log`

## Task 3 — SDL + template/record resolvers [KIRO]

- [x] Append design §5 SDL; wire data sources + resolvers (`forms.ts`) with explicit schema node dependency.
- [x] `listFormTemplates` (standards-in-scope filter, TPL-3), `getFormTemplate`, `createFormRecord`, `getFormRecord` + server-computed `FormCompletion` (design §2.4), `listFormRecords` — **note in tasks + evidence: this closes the standing BLOCKED `listRecords` item from frontend-app Task 29**.
- [x] `saveFormRecordValues`: partial autosave, typed-column dispatch by field_type, immutability guard on complete/approved.
- [x] Hermetic SQL/param-asserting tests per resolver; SCHEMA-5 injection tests.

**Depends on:** Tasks 1–2. **D-rung:** D2. **Evidence:** `task-3-resolvers.log`

## Task 4 — Relation fields (BC-2) [KIRO]

- [x] Code allowlist map `relation_target → table` (never SQL from data); existence probe inside the tenant transaction; typed `LINK_TARGET_NOT_FOUND`.
- [x] Hermetic tests: probe SQL asserted; missing target rolls back the whole save.
- [ ] [ARCHITECT] Live ACC-3 readback: cross-tenant UUID denied by RLS (probe returns zero rows), real in-tenant UUID links.

**Depends on:** Task 3. **D-rung:** D3. **Evidence:** `task-4-relations.log`

## Task 5 — Submit lifecycle + NCR→M2 mapping (BC-3) [KIRO]

- [ ] `submitFormRecord`: full validation → `complete`; for `maps_to='m2_ncr'`: single-transaction INSERT `m2.nonconformities` + `m2.corrective_actions` from mapped values (design §3), stamp `m2_nc_id`.
- [ ] Negative path FIRST: any unmapped required field → `MAPPING_INCOMPLETE`, zero rows written (ACC-4). **No default values for `clause_ref`/`severity`/`source` under any circumstances.**
- [ ] `reopenFormRecord` (justification required, audit-logged); audit event on every transition (BC-5).
- [ ] Hermetic tests incl. transaction-atomicity assertions and negative-path coverage.

**Depends on:** Task 3. **D-rung:** D2 → D3 at ACC-4 readback. **Evidence:** `task-5-submit-mapping.log`

## Task 6 — Approval + SoD (BC-4) [KIRO]

- [ ] `approveFormRecord` for `requires_approval` templates: approver ≠ completed_by ≠ opened_by; violation publishes `Security.SodViolationBlocked`, writes nothing; second-user approval commits (ACC-5 shape).
- [ ] Hermetic tests both paths.

**Depends on:** Task 5. **D-rung:** D2. **Evidence:** `task-6-sod.log`

## Task 7 — Frontend: catalog + register + form [KIRO]

- [ ] Template catalog view: clause-tagged cards, computed `N sections · M fields` chips, standards filter (TPL-2/3).
- [ ] Record register per template: DataTable (status, completion, opened/completed by), empty state, row → record (REC-1).
- [ ] Sectioned form: server counter, autosave, typed field widgets (select/radio/date/number/multiselect/user), **RelationPicker** (search target register, stores UUID), submit with validation errors surfaced per field, immutable complete view, reopen action.
- [ ] i18n `forms.*` namespaces en/es/pt same commit; view-designs.md + design tokens govern.

**Depends on:** Tasks 3–5. **D-rung:** D2. **Evidence:** `task-7-ui.log`

## Task 8 — Record PDF + sealing (REC-7) [ARCHITECT]

- [ ] `exportFormRecordPdf` via spec-40 `PdfRenderFn` (record layout template); approved-record sealing → EvidenceVault per-object retain-until from `m4.retention_policies` → `m4.records` pointer row with `retain_until` (ACC-7).

**Depends on:** Task 6 + spec-40 Task 9. **D-rung:** D3. **Evidence:** `task-8-pdf-seal.log`

## Task 9 — Internal Audit checklist generator (OQ-1 resolution) [KIRO]

- [ ] Generator: instantiate a checklist record from the clause registry for the tenant's in-scope clauses (per clause: conformity select, evidence text, finding relation→M3).
- [ ] Tests: 9001-only tenant gets only 9001 clause rows; counts computed.

**Depends on:** Tasks 3, spec-40 Task 2 (registry seeded). **D-rung:** D2. **Evidence:** `task-9-audit-checklist.log`

## Task 10 — RLS load test (OQ-2 gate) [ARCHITECT]

- [ ] Seed 10k records × 30 fields for two tenants; register listing + record read p95 under FORCE RLS; target p95 < 500 ms. Miss → index/partition rework BEFORE catalog-wide rollout (documented gate).

**Depends on:** Task 3. **D-rung:** D3 (int lane, live dev). **Evidence:** `task-10-load.log`

## Task 11 — ACC readback pass [ARCHITECT; ACC-4/ACC-5 witnessed → D5]

- [ ] ACC-1..ACC-7 executed live per requirements §3; rows carry timestamp + exit code + outputs SHA.

**Depends on:** all. **D-rung:** D3/D5. **Evidence:** `acc-readback.log`
