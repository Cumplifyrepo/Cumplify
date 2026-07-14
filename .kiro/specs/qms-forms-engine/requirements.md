# QMS Forms & Records Engine — Requirements R1 (EARS Format)

**Spec:** `qms-forms-engine` (spec 41)
**Phase:** P1 (product core — the ISO buyer's SECOND question)
**Revision:** R1 (2026-07-14) — architect-authored after live competitive reverse-engineering + adversarial design review.
**Depends on:** `qms-document-engine` (spec 40) — shares the clause registry and org profile. api-core (spec 3), immutable-trail.

---

## 0. The gap this spec closes

Cumplify's M4 "records" today is a **pointer row** (`record_type`, `source_module`, `s3_object_ref`) — there is no form, no fields, no register, no fill experience. The ISO buyer's second question — *"does it have my NCR / internal audit / management review forms?"* — has no answer.

The competitor ships a catalog of clause-tagged form templates, each a record register with history: NCR (Clause 8.7/10.2 · 30 fields), Internal Audit Report (9.2 · 407 fields), Management Review Minutes (9.3 · 29), Contract Review (8.2 · 27), Receiving Inspection (8.4/8.6 · 25), Supplier Evaluation (8.4.1 · 19), Competency Matrix (7.2 · 13), and more. Each record is a sectioned form with a live completion counter, Export PDF, Save, and an irreversible Mark-as-Complete.

**Where we exceed it, by design:**

| | CertifyAero | Cumplify (this spec) |
|---|---|---|
| Field types | Almost all bare `input:text` — disposition options (Use As-Is / Rework / Scrap) are **free-text boxes** | Typed fields: select/radio/number/date/multiselect/**relation**/user |
| Linkage | "Linked CAPA Number" is **hand-typed** | **Real FK relation** — RelationPicker stores a UUID, validated inside the tenant transaction |
| Governance | No approval routing, no role gating, no audit trail on records | HITL approval routing, role matrix gating, SoD, hash-chained audit events |
| Standards | 9001 + AS9100D | 9001 + 14001 + 45001 — including the registers those standards require (aspects, hazards, obligations) |

---

## 1. Architect Build Constraints (binding)

| ID | Constraint |
|----|-----------|
| **BC-1** | **Templates are DATA, not code.** A new form ships as seed rows (template + sections + fields), never a new resolver or component. "Clause 8.7 · 42 fields" is a COUNT over rows, never a hardcoded string. |
| **BC-2** | **Relations are real.** A field of type `relation` stores a **UUID** validated against the target table **inside the record's tenant transaction** (RLS-enforced existence probe). A cross-tenant or missing target returns `LINK_TARGET_NOT_FOUND`. We never store a typed-in identifier as a "link". |
| **BC-3** | **NCR → CAPA must not fabricate compliance data.** `m2.corrective_actions.nc_id` is `NOT NULL REFERENCES m2.nonconformities(id)` (`003:37`), and `m2.nonconformities` requires NOT NULL CHECK-constrained `standard`, `source` (audit\|incident\|complaint\|process), `nc_type`, `clause_ref`, `severity`. The CertifyAero NCR spine supplies **none** of these — its "Where Discovered (Incoming/In-Process/Final/Customer Return)" does **not** map to `source`. Therefore the Cumplify NCR template **shall carry `standard`, `source`, `nc_type`, `clause_ref` (RelationPicker → clause registry), and `severity` as REQUIRED fields**, and submit **shall throw** if unmapped. Kiro must **never** hardcode `clause_ref='8.7'` / `severity='medium'` to make a row insert. (Steering rule 9.) |
| **BC-4** | **SoD on record completion/approval.** Approver ≠ `completed_by` ≠ `opened_by` where the template demands approval; violation emits `Security.SodViolationBlocked`. |
| **BC-5** | **Records get an audit trail.** Every record lifecycle transition publishes a hash-chained audit event (this is the governance gap the competitor has and we close). |
| **BC-6** | **Object-Lock sealing is gated on spec-40 BC-10** (EvidenceVault retention parameterization). No record sealing before that lands. |
| **BC-7** | **i18n.** System field labels are catalog keys (en/es/pt). Tenant-authored labels are runtime data and are documented as outside the pseudo-locale check. |
| **BC-8** | **IMS standard support** — see spec-40 BC-6. `m4.records.standard`'s CHECK omits `'IMS'`; an IMS record is currently impossible. Fix ships in the shared migration. |

---

## 2. Functional Requirements (EARS)

### Template Catalog

| ID | Requirement |
|----|-------------|
| TPL-1 | **The system shall** provide a catalog of form templates, each carrying: key, title, description, clause reference(s) (→ clause registry), applicable standards, category, section list, and field list with types. |
| TPL-2 | **The system shall** compute and display `N sections · M fields` from the template rows (BC-1). |
| TPL-3 | **When** a tenant's standards in scope exclude a standard, **the system shall not** show templates that serve only that standard. |
| TPL-4 | **The system shall** seed, at minimum, the ISO-mandated register/report set across all three standards, including: **Nonconformity & Corrective Action (NCR)**, Internal Audit Report + checklist, Management Review Minutes (all 9.3.2 inputs / 9.3.3 outputs), Risk & Opportunity Register, **Environmental Aspects & Impacts Register (14001)**, **Legal & Other Compliance Obligations Register (14001/45001)**, **Hazard Identification & Risk Assessment / HIRA (45001)**, **Incident Investigation (45001)**, Emergency Preparedness & Response, Consultation & Participation of Workers (45001), Competence & Training Matrix, Supplier/External Provider Evaluation, Calibration & Measuring Equipment Log, Document Change Request, Objectives & Improvement Plan, Interested Parties & Context Analysis. |
| TPL-5 | The NCR template **shall** match or exceed the competitor's 30-field spine — NCR Information / Nonconformity Description / Containment / Disposition / Root Cause / Closure — with **typed** fields (disposition as a select, not five text boxes) plus the BC-3 required fields. |

### Records

| ID | Requirement |
|----|-------------|
| REC-1 | **The system shall** present each template as a record register listing that tenant's records with status and history, and an empty state. |
| REC-2 | **The system shall** render a record as a sectioned form with a **server-computed** completion counter (`fields_filled / fields_total`). |
| REC-3 | **The system shall** support partial save (autosave) without validation, and **shall** enforce validation only on submit/complete. |
| REC-4 | **When** a record is marked complete, **the system shall** make it immutable except via an explicit reopen action, which **shall** be audit-logged. |
| REC-5 | **The system shall** allow a record to link to real M2/M3/M5 entities via typed relation fields (BC-2). |
| REC-6 | **When** an NCR record is submitted, **the system shall** create a real `m2.nonconformities` row and its `m2.corrective_actions` row from the record's mapped fields, or **shall throw** if the required mapping fields are absent (BC-3). No `m2` schema columns are added. |
| REC-7 | **The system shall** export any record to PDF, and **shall** seal approved records to the EvidenceVault with retention (gated on BC-6). |
| REC-8 | **The system shall** publish a hash-chained audit event on every record lifecycle transition (BC-5). |

---

## 3. Acceptance Criteria

| ACC | Criterion |
|-----|-----------|
| **ACC-1** | Full template set seeded; a 9001-only tenant sees zero 14001/45001-only registers; an IMS tenant sees all. Counts are computed, not hardcoded. |
| **ACC-2** | The NCR renders all sections/fields with a live server-computed counter; `listRecords` returns the register (**closes the standing BLOCKED `m4.recordsBlocked` item — no list query exists today**). |
| **ACC-3** | A relation field stores a **UUID**; a cross-tenant target id returns `LINK_TARGET_NOT_FOUND` (RLS-enforced, not resolver vigilance). |
| **ACC-4** | Submitting a filled NCR creates a **real** `m2.nonconformities` + `m2.corrective_actions` row from mapped fields, with **zero new `m2` columns**; submitting one with unmapped `severity`/`clause_ref`/`source` **throws and writes nothing** (BC-3 proven negatively). |
| **ACC-5** | Self-approval emits `Security.SodViolationBlocked` and blocks; second-user approval commits. |
| **ACC-6** | Every record lifecycle transition appears in the audit trail, retrievable via `getAuditTrail`. |
| **ACC-7** | Record PDF renders; sealing writes an `m4.records` pointer row carrying `retain_until` (the columns that exist today and are never written). |

---

## 4. Open Questions

| ID | Question | Status |
|----|----------|--------|
| OQ-1 | The 407-field Internal Audit Report — is that a single template or a checklist generator over the clause registry? (Competitor's number suggests generated-per-clause.) Sizing decision. | **OPEN** |
| OQ-2 | EAV vs typed-column storage for record values under `FORCE ROW LEVEL SECURITY` — load-test before committing. | Proposed: typed columns w/ partial indexes; load-test in Task list |
