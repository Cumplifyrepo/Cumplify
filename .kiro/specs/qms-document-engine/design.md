# QMS Document Engine — Design R1

**Spec:** `qms-document-engine` (spec 40)
**Requirements approved:** R1 2026-07-14 (commit `4598d42`; OQ-1/OQ-2 resolved `bd9b6f2`/`543ed78`)
**Design revision:** R1 — architect-authored. Binding constraints BC-1..BC-12 govern; where this design and the requirements disagree, requirements win.
**Steering rules exercised:** `01-tenancy-rules.md`, `05-hitl.md`, `12-token-metering.md`, `17-i18n.md`, `19-kiro-truth.md` §9

---

## 1. Architecture & Data Flow

```mermaid
flowchart TB
  subgraph UI["Frontend (Next.js static export)"]
    WIZ[Org Profile wizard]
    GENBTN[Generate IMS button + progress stream]
    DOCVIEW[Document viewer: sections, GAP blocks, review]
  end

  subgraph API["AppSync (@aws_lambda)"]
    ORGRES[org-profile resolver]
    GENRES[generation resolver — StartExecution]
    DOCRES[m1 doc resolvers (existing) + diff/export]
    SUBS[onGenerationProgress subscription]
  end

  subgraph GEN["Generation Plane (AiStack)"]
    SFN2[DocGenStateMachine — Map over sections]
    COMPOSE[ComposeSection Lambda]
    INVOKER[AI Invoker — ONE DOOR, doc-composer seat + DocGenGuardrail]
    CHECK[Deterministic post-pass: assertion coverage + house style]
  end

  subgraph DATA["Data Plane"]
    RDS[(Aurora: qms.* + m1.*)]
    S3G[(GeneralBucket — content JSON, draft PDFs, ZIPs)]
    S3E[(EvidenceVault — sealed PDFs, per-object retention)]
    EB[EventBridge — audit events]
  end

  WIZ --> ORGRES --> RDS
  GENBTN --> GENRES --> SFN2
  SFN2 --> COMPOSE --> INVOKER
  COMPOSE --> CHECK --> RDS & S3G
  COMPOSE -- publishGenerationEvent @aws_iam --> SUBS
  DOCVIEW --> DOCRES --> RDS & S3G
  DOCRES -- approval seal --> S3E
  COMPOSE & DOCRES --> EB
```

Generation is **asynchronous** (Step Functions), **resumable**, and **streamed** to the client per section. The model is invoked ONLY through the existing AI Invoker (BC-9) on a new `doc-composer` seat that routes to the DocGenGuardrail (`543ed78`, live: `g8sg61low9xn`).

---

## 2. Data Model — migration `011_qms_engine.sql`

New schema `qms`. Every **tenant** table: `tenant_id TEXT NOT NULL`, RLS `ENABLE` + `FORCE` + tenant policy + `app_role` grant, cross-tenant denial test extended (ACC-2). C-2 invariant unchanged (`set_config` first in every transaction).

### 2.1 `qms.clause_registry` — tenant-less reference data

The ONLY new table without `tenant_id`. Seeded from the corpus maps; `app_role` gets **SELECT only** (INSERT/UPDATE/DELETE revoked — seed changes ship as migrations).

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `standard` | TEXT CHECK (`ISO9001`,`ISO14001`,`ISO45001`) | one row per (standard, clause_no) |
| `clause_no` | TEXT | e.g. `6.1.2` — integrity asserted over **parsed clause numbers** (BC-7) |
| `clause_title` | TEXT | factual reference — allowed under BC-1 |
| `intent_paraphrase` | TEXT | architect-authored paraphrase. **NO verbatim ISO text, no "shall"** (CLR-3 test) |
| `annex_sl_mode` | TEXT CHECK (`shared`,`forked`,`standard_only`) | CLR-2 |
| `harmonization_key` | TEXT | Annex SL spine key, e.g. `6.1` — shared/forked rows with the same key merge into one integrated section |
| `doc_type` | TEXT CHECK (m1 doc_type values) | what the auto-populated clause document becomes (GEN-4) |
| `required_sources` | JSONB | data prerequisites for prose, e.g. `["org_profile.core_processes","register.aspects"]` — drives GAP decisions (§4.2) |
| `sort_order` | INTEGER | ISO clause order for assembly |

**Registry integrity test (ACC-1):** parse clause numbers from `iso-coverage-matrix.md` table rows (skipping the 3 Grand-Total rows), dedupe rollup duplicates (`6.1` vs `6.1.2`/`6.1.3`), assert the seeded set equals the reconciled set. The corpus map's own tallies are corrected in the same commit (BC-7).

### 2.2 `qms.org_profiles` + `qms.org_profile_versions` — tenant

- `org_profiles`: one row per tenant (`UNIQUE(tenant_id)`), columns: `current_version INTEGER`, timestamps + `created_by`.
- `org_profile_versions`: `(profile_id FK, tenant_id, version_no, payload JSONB, created_by, created_at)`, `UNIQUE(profile_id, version_no)`.
- `payload` is validated by a **zod schema in the resolver** (single typed contract, shared with the frontend wizard) covering the ORG-1 field list. JSONB (not 20 columns) because the profile evolves and every field is consumed the same way — as a **citable fact** (`org_profile.<path>` in the assertion ledger, ORG-2).
- Saving writes a new version row and bumps `current_version` in one transaction; generation runs pin the version they read (reproducibility).

### 2.3 `qms.clause_applicability` — tenant

`(tenant_id, clause_registry_id FK, applicable BOOLEAN NOT NULL, justification TEXT, decided_by, decided_at)` with `CHECK (applicable OR justification IS NOT NULL)` — a clause cannot be excluded silently (ORG-4). `UNIQUE(tenant_id, clause_registry_id)`.

### 2.4 `qms.generation_runs` + `qms.generation_sections` — tenant

- `generation_runs`: `(id, tenant_id, sfn_execution_arn, profile_version INTEGER, standards TEXT[], status CHECK ('running','complete','failed','partial'), manual_document_id UUID NULL, requested_by, started_at, finished_at)`.
- `generation_sections`: `(id, run_id FK, tenant_id, harmonization_key, clause_registry_ids UUID[], status CHECK ('pending','prose','gap','failed'), content_s3_key TEXT, content_sha256 TEXT, reviewed_by TEXT, reviewed_at TIMESTAMPTZ, error TEXT)`, **`UNIQUE(run_id, harmonization_key)`** — the idempotency spine (GEN-5): a retried Map iteration `ON CONFLICT` sees `status != 'pending'` and skips.

### 2.5 `qms.assertion_ledger` — tenant

`(id, tenant_id, section_id FK, sentence_idx INTEGER, sentence_sha256 TEXT, fact_key TEXT, fact_source TEXT, fact_value_sha256 TEXT)`. One row per (sentence, backing fact). `fact_source` is machine-resolvable: `org_profile:<version>:<jsonpath>`, `register:<table>:<uuid>`, or `statement:<uuid>` (explicit tenant-supplied statement). This is what BC-4's deterministic checker writes and what audit reads.

### 2.6 BC-6 in the same migration: `IMS` becomes first-class

- `ALTER TABLE m4.records DROP CONSTRAINT …; ADD CHECK (standard IN ('ISO9001','ISO14001','ISO45001','IMS'))`.
- `schema.graphql`: `enum Standard` gains `IMS` (m1.documents' CHECK already accepts it — migration 002).
- `PublishAuditEventOptions.standard` type widened in `services/api/src/…` shared types.
- Regression test: a `Standard.IMS` document row round-trips `createDocumentDraft → getDocument` without enum serialization error (the CAPA-status bug class, fixed 2026-07-14, must not recur).

---

## 3. Document Content Model (BC-8 — `content_ref` becomes real)

Canonical **content JSON** per document version, stored in **GeneralBucket** (working data; EvidenceVault is for sealed artifacts only):

```
s3://<GeneralBucket>/tenants/<tenantId>/documents/<documentId>/v<version_no>.json
```

```jsonc
{
  "schemaVersion": 1,
  "documentId": "…", "versionNo": 2, "locale": "en",   // tenant documentLocale, BC-12
  "frontMatter": { "purpose": …, "scope": …, "normativeRefs": …, "terms": … },
  "sections": [
    {
      "harmonizationKey": "6.1",
      "clauseRefs": [{"standard":"ISO9001","clauseNo":"6.1"}, …],
      "kind": "prose" | "gap" | "na_justified",
      "sentences": [{ "text": "…", "factRefs": ["org_profile:3:$.coreProcesses", …] }],
      "gap": { "missingSources": ["register.aspects"], "cta": "/m5?tab=aspects" },   // kind=gap only
      "naJustification": "…"                                                        // kind=na_justified only
    }
  ]
}
```

- `m1.document_versions.content_ref` = the S3 key; **new column** `content_sha256 TEXT` (same migration) = SHA-256 of the canonical bytes. Writers that currently default `content_ref=''` (`execute-writeback.ts:330`) are updated to either write real content or be explicitly exempted with a tracked TODO — no silent `''` remains (tripwire test).
- The disclaimer + "purchase the official standard from ISO" link (BC-1) is part of `frontMatter` and the PDF template — not model-generated.

**Diff (STO-2, closes the standing BLOCKED item):** `getDocumentVersionDiff(v1, v2)` loads both JSONs, aligns sections by `harmonizationKey`, diffs sentence lists (LCS), and returns the existing `Diff` type (`schema.graphql:135` — `additions`, `deletions`, `content`); `content` is a section-keyed JSON diff summary the frontend renders. No schema change needed — the type exists, only the resolver was never real.

---

## 4. Generation Pipeline

### 4.1 `DocGenStateMachine` (Standard workflow, AiStack)

```
StartExecution(runId)                     ← generateImsManual resolver (after inserting the run row)
  → SeedSections (Lambda)                 ← computes in-scope section list, INSERT … ON CONFLICT DO NOTHING
  → Map over pending sections (MaxConcurrency 4)
      → ComposeSection (Lambda)           ← §4.2/§4.3; each iteration is self-contained + idempotent
  → FinalizeManual (Lambda)               ← assemble manual + clause docs + matrix + master list
```

- **SeedSections:** reads pinned profile version + applicability + registry; groups in-scope clauses by `harmonization_key` per CLR-2 (`shared` → one section covering all in-scope standards; `forked` → one section per standard; `standard_only` → only its standard — GEN-3/ACC-5 falls out of the grouping, not prompt luck). N/A clauses become `na_justified` sections directly.
- **Resume/retry (GEN-5):** re-running the machine re-seeds (no-op on conflict) and the Map processes only `status='pending'` sections. No duplicates by construction.
- **FinalizeManual (GEN-4, GEN-8):** writes ONE manual document (`m1.documents` `doc_type='manual'`, `standard='IMS'` when >1 standard in scope, else the single standard) + one clause document per section (doc_type from registry), each with a real `content_ref`/`content_sha256` version row. Derives — never authors — the Standards Correlation Matrix and the Documented-Information Master List from registry × section state, stored as two more generated documents. Publishes run-complete event + hash-chained audit event.

### 4.2 GAP decision — before any model call (BC-3)

`ComposeSection` first resolves the section's `required_sources` against tenant data (profile jsonpaths, register COUNTs via the SECURITY DEFINER accessor pattern). **If any required source is empty → the section is written as a `gap` block with zero model invocation.** Honesty by construction, and the empty-register case costs $0. ACC-4's negative test (empty aspects register ⇒ zero aspect-prose sentences) is enforced here, not prompted for.

### 4.3 Compose + deterministic post-pass (BC-2, BC-4)

1. Assemble the **fact set**: numbered facts F1..Fn (profile fields, register rows, tenant statements) + clause `intent_paraphrase` + house-style instructions + tenant `documentLocale`.
2. Invoke `doc-composer` seat (structured output schema): `{ sentences: [{ text, factRefs }] }`. The invoker's existing schema-retry handles malformed output.
3. **Deterministic checker — code, not model** (the model does not grade its own homework):
   - every sentence has ≥1 `factRef`, and every `factRef` resolves to a fact actually provided;
   - house style: zero "shall" tokens, zero bullet markers, zero placeholder patterns (`{{`, `TBD`, `[Company]`…), organization-as-subject heuristic (BC-2/NFR-3);
   - zero standard-text fragments (n-gram screen against the registry paraphrases' banned list, CLR-3).
4. Fail → one retry with the checker's violations appended → still failing → section `status='failed'` (surfaced in the run summary; NOT silently gapped and NOT shipped).
5. Pass → write content JSON to S3, ledger rows, section row, `publishGenerationEvent` (per-section progress, GEN-5), audit event (GEN-7).

### 4.4 `doc-composer` seat + guardrail routing

- `SeatId` union += `'doc-composer'`; seat entry in the model registry + `MODELWEIGHT#` seed row (Nova Pro tier, structured output schema, no caching assumptions).
- `guardrail.ts` `buildGuardrailConfig(seat)`: `seat === 'doc-composer'` → `DOCGEN_GUARDRAIL_ID/VERSION`, else the agent guardrail. Unit test: both routes.
- Metering unchanged — `telemetry.credits.consumed` flows per invocation; NFR-2's cost model is read from the meter at the ACC-3 readback, not estimated.

### 4.5 Progress streaming

New `@aws_iam` mutation `publishGenerationEvent(input)` → `onGenerationProgress(tenantId)` subscription (None data source, C-6 tenantId auth pattern — copy `onDocumentStatusChanged`). Events: `section_started`, `section_complete(kind)`, `section_failed`, `run_complete(summary)`. AppSync rule: **explicit node dependency on the schema, never `extend type`.**

---

## 5. PDF, Export, Sealing

- **PDF (STO-3):** dedicated `PdfRenderFn` — `puppeteer-core` + `@sparticuz/chromium` (x86_64 — the chromium layer is not ARM; this fn alone diverges from the ARM default, documented). HTML template implements the controlled-document design (branded header, CONTROLLED stamp, QMS Required Document Information block, numbered clauses) from `design-tokens.ts`. Input: content JSON key → output: PDF in GeneralBucket. Fallback decision if bundle/perf fails readback: container-image Lambda (task carries the gate).
- **ZIP export (STO-4):** `requestImsExport` resolver → `ExportFn` streams manual + clause docs + matrix + master list PDFs into a ZIP in GeneralBucket → returns presigned URL (15 min TTL).
- **Sealing (STO-5, BC-10 residue):** on `publishControlledDocument` of an approved version: render final PDF → `PutObject` to **EvidenceVault** with **per-object** `ObjectLockRetainUntilDate` = `NOW() + m4.retention_policies.retention_years` for the tenant's `record_type='controlled_document'` policy row (default policy seeded if absent). Bucket default (GOVERNANCE/1d dev, COMPLIANCE/2555d prod) is a safety net ONLY. Writes the `m4.records` pointer row (`retain_until`, `object_lock_until`, `s3_object_ref` — the columns that exist today and are never written).

---

## 6. GraphQL SDL additions (consolidated — Kiro appends verbatim, SCHEMA-5: no tenantId inputs)

```graphql
enum AnnexSlMode { SHARED FORKED STANDARD_ONLY }
enum SectionKind { PROSE GAP NA_JUSTIFIED FAILED PENDING }
enum GenerationRunStatus { RUNNING COMPLETE FAILED PARTIAL }

type ClauseRegistryEntry @aws_lambda { id: ID! standard: Standard! clauseNo: String!
  clauseTitle: String! intentParaphrase: String! annexSlMode: AnnexSlMode!
  harmonizationKey: String! requiredSources: AWSJSON! sortOrder: Int! }
type OrgProfile @aws_lambda { id: ID! currentVersion: Int! payload: AWSJSON! updatedAt: AWSDateTime! }
type ClauseApplicability @aws_lambda { id: ID! clauseRegistryId: ID! applicable: Boolean! justification: String }
type GenerationSection @aws_lambda { id: ID! harmonizationKey: String! kind: SectionKind!
  clauseRefs: AWSJSON! contentSha256: String reviewedBy: String reviewedAt: AWSDateTime error: String }
type GenerationRun @aws_lambda { id: ID! status: GenerationRunStatus! standards: [Standard!]!
  sections: [GenerationSection!]! manualDocumentId: ID gapCount: Int! startedAt: AWSDateTime! finishedAt: AWSDateTime }
type GenerationEvent @aws_lambda @aws_iam { runId: ID! tenantId: ID! type: String!
  harmonizationKey: String kind: SectionKind summary: AWSJSON }
type ExportResult @aws_lambda { url: String! expiresAt: AWSDateTime! }

input SaveOrgProfileInput { payload: AWSJSON! }
input SetClauseApplicabilityInput { clauseRegistryId: ID! applicable: Boolean! justification: String }
input GenerateImsManualInput { standards: [Standard!] }         # default: profile's standards in scope
input RegenerateSectionInput { runId: ID! harmonizationKey: String! }
input MarkSectionReviewedInput { sectionId: ID! }
input PublishGenerationEventInput { runId: ID! tenantId: ID! type: String!
  harmonizationKey: String kind: SectionKind summary: AWSJSON }  # @aws_iam only — tenantId allowed (agent path, not a user mutation)

# Query +=
#   getOrgProfile: OrgProfile  |  listClauseRegistry(standard: Standard): [ClauseRegistryEntry!]!
#   listClauseApplicability: [ClauseApplicability!]!  |  getGenerationRun(id: ID!): GenerationRun
#   listGenerationRuns(limit: Int): [GenerationRun!]!
# Mutation +=
#   saveOrgProfile / setClauseApplicability / generateImsManual: GenerationRun!
#   regenerateSection: GenerationSection! (GEN-6 — new document version on the affected docs)
#   markSectionReviewed: GenerationSection!  |  requestImsExport(documentId: ID!): ExportResult!
#   publishGenerationEvent: GenerationEvent @aws_iam
# Subscription +=
#   onGenerationProgress(tenantId: ID!): GenerationEvent @aws_subscribe(mutations: ["publishGenerationEvent"])
```

Role gating: `saveOrgProfile`/`generateImsManual`/`regenerateSection`/`markSectionReviewed` require M1 authoring roles (permission matrix `canApprove(role,'M1')` family); queries follow existing M1 read gating.

---

## 7. Approval Integrity (BC-11, APR-1..3)

Extends the EXISTING m1 flow — no parallel approval system:

- `submitDocumentForApproval` resolver gains two preconditions (same transaction): every section of the version's run is `reviewed_at IS NOT NULL` (APR-1), and zero sections with `kind IN ('gap','failed')` (APR-3). Violation → typed GraphQL errors `UNREVIEWED_SECTIONS` / `UNRESOLVED_GAPS`.
- `approveDocumentVersion` gains the SoD check: approver `sub` ≠ version `created_by` (BC-11); violation writes NOTHING and publishes `Security.SodViolationBlocked` (ACC-7).
- HITL routing itself is the existing machine (`HitlStateMachine`) — untouched.

---

## 8. Decisions & Risks

| # | Decision | Rationale / risk |
|---|---|---|
| D-1 | GAP decided in code BEFORE the model call | Honesty by construction; $0 for empty registers; ACC-4 provable deterministically |
| D-2 | Sections grouped by `harmonization_key` in SeedSections | Integrated-manual correctness (GEN-3) is data-driven, not prompt-driven |
| D-3 | Content = canonical JSON in GeneralBucket; PDFs only are sealed | Diff/regeneration need structure; EvidenceVault stays append-only legal storage |
| D-4 | `doc-composer` structured output with per-sentence `factRefs` | Makes BC-4 checkable in code; invoker schema-retry already exists |
| D-5 | Profile payload = versioned JSONB + zod, not columns | Wizard iterates fast; every field is consumed uniformly as a citable fact |
| D-6 | puppeteer/chromium for PDF (x86_64) | Highest-fidelity match to the controlled-doc design; risk = bundle size/cold start → task gate with container-image fallback |
| D-7 | OQ-3 process diagrams **deferred to fast-follow** | Diagram generation is a separate approach decision; nothing in ACC-1..10 requires it. Owner may pull forward. |
| D-8 | OQ-4 tenant-uploaded standard **deferred** (proposed in R1) | BC-1 grounding is sufficient — verified against the competitor |
| R-1 | 120s p95 (NFR-1) with MaxConcurrency 4 | If readback misses, raise concurrency before model changes; measure per-section p95 in evidence |
| R-2 | Nova Pro prose quality vs house style | NFR-3 golden-set eval gates; style violations are checker-caught, not eval-caught |
