# QMS Document Engine — Requirements R1 (EARS Format)

**Spec:** `qms-document-engine` (spec 40)
**Phase:** P1 (product core — this is the capability an ISO buyer asks for FIRST)
**Revision:** R1 (2026-07-14) — authored by architect after live competitive reverse-engineering + a 3-architecture design panel with adversarial review (all three returned NEEDS-REVISION; every finding is closed below).
**Source documents:**

- `docs/architecture/iso-coverage-matrix.md` + `iso-requirements-map.md` — the ONLY clause ground truth (architect-authored paraphrase; see BC-1)
- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — Parts 3, 11, 13
- `services/api/schema/schema.graphql` — the deployed data contract
- `.kiro/steering/19-kiro-truth.md` §9 — blocked means BLOCKED; **facade = fabrication**
- Competitive reference: CertifyAero (certifyaero.com), reverse-engineered live 2026-07-14 — the capability bar

**Depends on:** api-core (spec 3), agents-existing-8, immutable-trail.
**Companion spec:** `qms-forms-engine` (spec 41) — records/templates. Shares the org-profile and clause registry built here.

---

## 0. The gap this spec closes

Cumplify today tracks compliance artifacts (M1–M5 CRUD over rows). It **cannot write a Quality Manual**, and it has **no clause documents, no process diagrams, no PDF, no export**. The ISO buyer's first question — *"will it produce my manual?"* — currently has no answer.

The competitor answers it in one button: a ~9,200-word, 69-section manual mapped to the ISO clause skeleton, which auto-populates ~36 individual clause documents, renders as a white print-ready CONTROLLED document, exports to PDF and ZIP. That is the bar.

**Where we exceed it, by design:**

| | CertifyAero | Cumplify (this spec) |
|---|---|---|
| Standards | ISO 9001 + AS9100D (aerospace only) | **ISO 9001 + 14001 + 45001 as ONE integrated IMS manual** (Annex SL shared spine + per-standard divergence) |
| Unbacked claims | Asserts organizational practices no one verified | **Honest gaps** (BC-3) — no data ⇒ visible GAP block, never prose |
| Vertical | Hard-coded aerospace (CNC/welding/NDT option lists) | Industry-neutral org profile |
| Traceability | — | Every generated section carries an assertion ledger + hash-chained audit event |

---

## 1. Architect Build Constraints (binding, non-negotiable)

| ID | Constraint |
|----|-----------|
| **BC-1** | **NO licensed ISO text, ever.** Owner ruling 2026-07-05 stands (`model-policy-evals/design.md:150`). The clause registry stores clause **numbers + titles** (factual references) and **architect-authored paraphrased requirement intent** from the corpus maps. No verbatim standard text is stored, prompted with, retrieved, or emitted. *Verified 2026-07-14: this is exactly what the competitor does — their own product states "original educational content… does not reproduce the copyrighted standard text," with a purchase-the-standard link. Their 9,200-word manual contains **zero** "shall" sentences.* Every generated document and the in-app clause guide carry the same disclaimer + "purchase the official standard from ISO" link. |
| **BC-2** | **Generated prose is ORIGINAL expression about the tenant.** Present-tense declarative, organization as grammatical subject, no bullet lists, no placeholders, no "shall" (that is ISO's normative voice — using it both risks derivation and misstates who is being bound). |
| **BC-3** | **HONEST GAPS — no fabrication (steering rule 9).** A section whose backing register is empty renders as a **structured GAP block**, never as prose. It cannot be marked reviewed, cannot enter an approved document, and increments the readiness gap count. *A tenant with an empty environmental-aspects register MUST produce zero sentences asserting aspects have been determined.* Owner decision 2026-07-14. |
| **BC-4** | **Assertion coverage is machine-checked.** Every organization-subject declarative sentence in a generated section must map to a row in the assertion ledger resolving to real tenant data (org profile, register row, or an explicit tenant-supplied statement). Unmapped sentence ⇒ section fails generation. The check is a deterministic pass over the FINAL text — the model does not grade its own homework. |
| **BC-5** | **The doc-generation path requires a dedicated Bedrock guardrail.** The existing agent guardrail (`infra/lib/ai-stack.ts:98-106`) sets `NAME → ANONYMIZE`, `EMAIL → ANONYMIZE`. Applied to document generation it would **redact the company name and the Quality Manager's name out of the manual** — destroying the one property (named, specific prose) that makes the artifact credible. This spec provisions a separate guardrail for the doc-gen seat: PROMPT_ATTACK retained, SSN/card BLOCK retained, **NAME/EMAIL/PHONE anonymization OFF**. [REQUIRES-HUMAN] |
| **BC-6** | **`IMS` must become a first-class standard.** `m1.documents` already accepts `'IMS'` (`002:CHECK`), but `schema.graphql enum Standard` does **not**, `PublishAuditEventOptions.standard` does not, and `m4.records.standard`'s CHECK omits it. An IMS manual row would therefore **fail enum serialization on read** — the same bug class as the CAPA-status defect fixed 2026-07-14. New migration + schema + type update required. |
| **BC-7** | **Clause registry integrity is asserted over parsed clause numbers, never a line count.** `grep -c '^| ISO' iso-coverage-matrix.md` returns **83**, but 3 of those are Grand-Total summary rows (`:125-127`) — the real count is **80**, and the doc's own tallies (79) disagree with themselves. Rollup duplicates exist (14001/45001 list `6.1` AND `6.1.2`/`6.1.3`). The seed reconciles to a deduplicated clause-concept set; the source doc's tallies are corrected in the same commit. |
| **BC-8** | **Content lives in S3; `content_ref` becomes real.** `m1.document_versions.content_ref` is `TEXT NOT NULL` but every writer defaults it to `''` (`execute-writeback.ts:330`). This spec makes it a real S3 key + `content_sha256`. **This closes the standing BLOCKED item `getDocumentVersionDiff`** (a diff requires content; there was none). |
| **BC-9** | **No new Bedrock transport.** Generation goes through the existing AI Invoker (the ONE DOOR). If a required capability (e.g. embeddings via `InvokeModel` vs Converse) is not supported there, that is a BLOCKED item to report — not a second door to build. |
| **BC-10** | ~~**EvidenceVault Object-Lock must be parameterized BEFORE any sealing task runs.**~~ **RESOLVED 2026-07-14 (commit `bd9b6f2`, deployed + live-verified).** Owner override. `data-stack.ts` hardcoded `COMPLIANCE / 2555 days` in every env — one sealed PDF would have made the dev bucket undeletable for 7 years (COMPLIANCE cannot be shortened by anyone, incl. root), and it silently overrode every tenant retention policy shorter than 7 years (breaking ISO 7.5.3 disposition + GDPR erasure). Now env-parameterized: dev/staging `GOVERNANCE`/1d, prod `COMPLIANCE`/2555d. Live readback confirms `Mode=GOVERNANCE Days=1`. **Binding requirement that remains:** the bucket default is a SAFETY NET only — sealing tasks **shall** write a per-object `retain-until-date` derived from the tenant's `m4.retention_policies` row. A tripwire test (`evidence-retention.unit.test.ts`) fails the build if the hardcode returns. |
| **BC-11** | **SoD on approval.** The approver of a generated document may not be its `created_by`. Sections must all be reviewed before `submitDocumentForApproval` succeeds. |
| **BC-12** | **i18n.** All UI strings via `next-intl` (en/es/pt), same commit. **Document content locale is a separate axis** from UI locale (the tenant's `documentLocale`, already read by `getTenantSettings`). |

---

## 2. Functional Requirements (EARS)

### Org Profile (the input that makes prose specific)

| ID | Requirement |
|----|-------------|
| ORG-1 | **The system shall** provide a multi-step Organization Profile capturing, at minimum: legal name, sites (address/city/state/country), employee count, year founded, industry (free-text + taxonomy, **industry-neutral** — not a hard-coded vertical), products/services description, core processes, design responsibility, outsourced processes, supply-chain shape, standards in scope, existing certifications, whether a manual exists, the named management representative / quality manager, and target certification date. |
| ORG-2 | **The system shall** persist the profile as versioned tenant data, and **shall** treat every field as a citable context source for BC-4 assertion mapping. |
| ORG-3 | **When** a required profile field for an in-scope clause is absent, **the system shall** surface it as a named gap and **shall not** allow the generator to invent it. |
| ORG-4 | **The system shall** allow the tenant to declare clause applicability (e.g. ISO 9001 8.3 Design excluded) **with a justification**, and **shall** render "N/A — justified" with that justification rather than omitting the clause silently. |

### Clause Registry

| ID | Requirement |
|----|-------------|
| CLR-1 | **The system shall** seed a clause registry from `iso-coverage-matrix.md` + `iso-requirements-map.md` containing, per clause: standard, clause number, clause title, paraphrased requirement intent, applicable standards, and the Annex SL harmonization key. |
| CLR-2 | **The system shall** model the Annex SL relationship explicitly per clause as one of `shared` (one integrated text serves all in-scope standards), `forked` (per-standard variants of a shared concept), or `standard_only` (e.g. 9001 8.3 Design; 45001 5.4 Worker Participation; 14001 6.1.2 Aspects). |
| CLR-3 | **The system shall not** store or emit verbatim ISO text (BC-1). A test **shall** assert zero "shall"-form normative sentences and zero standard-text fragments in registry rows and generated output. |
| CLR-4 | **The registry seed shall** be reconciled to the deduplicated clause set (BC-7) and its integrity asserted over parsed clause numbers. |

### Document Generation

| ID | Requirement |
|----|-------------|
| GEN-1 | **When** an authorized user requests IMS manual generation, **the system shall** produce a manual composed of one section per in-scope clause, in ISO clause order, with front matter (purpose, scope, normative references, terms) and the controlled-document header block. |
| GEN-2 | **The system shall** generate, for every in-scope clause, EITHER original prose grounded in cited tenant data OR a GAP block (BC-3) — never prose without backing. |
| GEN-3 | **When** the tenant's standards in scope include more than one standard, **the system shall** produce a single INTEGRATED manual: shared clauses written once covering all in-scope standards, forked clauses written per-standard, standard-only clauses included only for their standard. |
| GEN-4 | **The system shall** auto-populate individual clause documents from the manual's sections in the same generation (one action ⇒ manual + clause documents). |
| GEN-5 | **The system shall** stream generation progress to the client (per-section events), and **shall** be idempotent and resumable — a retry **shall not** duplicate sections. |
| GEN-6 | **The system shall** support regenerating a single section without regenerating the manual, producing a new document version. |
| GEN-7 | **The system shall** record, for every generated section, an assertion ledger (BC-4) and a hash-chained audit event. |
| GEN-8 | **The system shall** produce a Standards Correlation Matrix (clause → in-scope standards → the documents/records that address it) and a Documented-Information Master List (maintain vs retain), both derived — not authored. |

### Storage, Versioning, Diff, Export

| ID | Requirement |
|----|-------------|
| STO-1 | **The system shall** store document content in S3 and record a real `content_ref` + `content_sha256` on `m1.document_versions` (BC-8). |
| STO-2 | **The system shall** return a section-keyed diff between two versions with non-zero additions/deletions where content differs — **closing the BLOCKED `getDocumentVersionDiff` item**. |
| STO-3 | **The system shall** render any document to PDF matching the controlled-document design (branded header, CONTROLLED stamp, QMS Required Document Information block, numbered clauses). |
| STO-4 | **The system shall** export the full IMS (manual + clause documents + correlation matrix + master list) as a ZIP via presigned URL. |
| STO-5 | **When** a document is approved, **the system shall** seal its PDF to the EvidenceVault with Object-Lock retention derived from the tenant's retention policy (gated on BC-10). |

### Approval

| ID | Requirement |
|----|-------------|
| APR-1 | **The system shall** require every section to be reviewed before a document may be submitted for approval. |
| APR-2 | **The system shall** route approval through the existing HITL flow and **shall** reject self-approval (BC-11), emitting `Security.SodViolationBlocked`. |
| APR-3 | **The system shall not** permit a document containing an unresolved GAP block to reach `approved`. |

---

## 3. Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-1 | Full IMS generation (manual + clause docs) completes **< 120 s p95**, with progress visible from the first seconds. |
| NFR-2 | Generation cost per full IMS is bounded and measured; the cost model is recorded in evidence at the live readback. |
| NFR-3 | Prose quality is measured by a golden-set eval (mean ≥ 4.0/5, zero low scores) — the house style of BC-2 is machine-checkable (org-as-subject, no bullets, no placeholders, no "shall"). |
| NFR-4 | Hermetic unit lane: every new resolver has SQL/DDB-asserting tests. Live behavior belongs to the int/readback lane. |

---

## 4. Acceptance Criteria

| ACC | Criterion |
|-----|-----------|
| **ACC-1** | Clause registry seeded and integrity-tested over **parsed clause numbers** (BC-7): deduplicated set matches the corrected corpus map; the map's own tallies corrected in the same commit; zero verbatim-ISO-text violations (BC-1/CLR-3). |
| **ACC-2** | RLS proven for every new tenant table: ENABLE + FORCE + policy + `app_role` grant, and a cross-tenant denial test extended to the new tables. |
| **ACC-3** | `generateImsManual` on a fully-seeded tenant produces the manual **plus** its clause documents, all `draft`, in **< 120 s p95**, streamed. Live-invoked; output captured. |
| **ACC-4** | **HONEST GAPS PROVEN (BC-3/BC-4):** a tenant with an EMPTY environmental-aspects register produces **zero** declarative sentences asserting aspects have been determined, and instead produces a GAP block that blocks approval. Assertion-coverage pass is deterministic over final text; a section with an unmapped org-subject claim FAILS. |
| **ACC-5** | Scope honesty: a tenant scoped to `{ISO9001, ISO45001}` produces zero 14001 sections and zero 14001 matrix columns. A clause marked non-applicable renders "N/A — justified" with the justification. |
| **ACC-6** | `content_ref` is a real S3 key with matching `content_sha256`; `getDocumentVersionDiff` returns a section-keyed diff with non-zero additions/deletions after a `regenerateSection`. **The BLOCKED diff item closes.** |
| **ACC-7** | Approval integrity: submit blocked while any section is unreviewed; self-approval emits `Security.SodViolationBlocked` and does not commit; a document with an unresolved GAP cannot be approved. |
| **ACC-8** | PDF renders to the controlled-document design; `requestImsExport` returns a presigned ZIP containing manual + clause docs + correlation matrix + master list. |
| **ACC-9** | Guardrail proof (BC-5): a generated manual for a tenant whose profile names the organization and its quality manager contains those names **unredacted**, and the doc-gen guardrail is a distinct resource from the agent guardrail. |
| **ACC-10** | Prose-quality eval (NFR-3) green; house-style validator green (no "shall", no bullets, no placeholders, org-as-subject). |

---

## 5. Open Questions / Owner Decisions

| ID | Question | Status |
|----|----------|--------|
| OQ-1 | EvidenceVault Object-Lock: COMPLIANCE vs GOVERNANCE, and env-parameterized retention (BC-10). Blocks all sealing tasks. | **RESOLVED 2026-07-14** — owner override; see BC-10 (commit `bd9b6f2`, deployed + live-verified) |
| OQ-2 | Doc-gen guardrail config (BC-5) — confirm NAME/EMAIL/PHONE anonymization OFF for this seat only. | **RESOLVED 2026-07-14** — owner "proceed"; dedicated `DocGenGuardrail` in `ai-stack.ts` (PROMPT_ATTACK + SSN/card BLOCK retained, anonymization off; agent guardrail untouched, tripwire-tested) |
| OQ-3 | Process diagrams (turtle diagrams, process interaction map, org chart) — competitor ships 6/6. In scope for v1 or a fast-follow? Requires a diagram-generation approach decision. | **OPEN** |
| OQ-4 | Tenant-uploaded licensed standard as a *premium* grounding enhancement (per-tenant KB) — explicitly OUT of v1 scope (BC-1 makes it unnecessary). Confirm deferral. | Proposed: defer |
