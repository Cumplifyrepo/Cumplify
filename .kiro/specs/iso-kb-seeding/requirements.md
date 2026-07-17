# Requirements — ISO KB Seeding (rev 2)

> **Spec:** iso-kb-seeding
> **Status:** APPROVED (rev 2 — OQ resolutions folded, architect-reviewed)
> **Carry from:** spec-35 (guardrails-antihallucination), task-29/task-38 named carry:
> "KB-seeding spec decision (owner)"
> **Prerequisite specs:** platform-foundation (DataStack owns cumplify-iso-kb collection),
> agents-existing-8 (ai-stack: apply-template, retrieval, guru handlers, one-door embed)
> **Review:** `.kiro/evidence/iso-kb-seeding/requirements-review.md`

---

## Problem Statement

The `cumplify-iso-kb` AOSS VECTORSEARCH collection exists (deployed via DataStack)
and the index template is applied (1024-dim knn_vector, metadata.tenantId/standard/clauseRef
as keyword), but the collection has **NO INDEX and NO CONTENT**. Guru agents
(ISO9001Guru, ISO14001Guru, ISO45001Guru) always take the dormant path — retrieval
returns zero chunks, `groundingContext` is absent, and the contextual-grounding L1
check never fires. The full anti-hallucination stack (spec-35) is proven live but
inert without grounded source material.

This spec seeds the ISO knowledge base with deterministic, in-house-authored content
from `docs/architecture/iso-requirements-map.md` (422 lines) and turns on real
grounded RAG for the three guru agents.

---

## Content Constraints (BC-2 — copyright compliance)

- **BC-2:** The ISO body text (the actual normative prose from ISO 9001/14001/45001)
  is copyrighted. Cumplify NEVER stores verbatim ISO standard text.
- The SOLE content source is `docs/architecture/iso-requirements-map.md` — an
  in-house paraphrase authored by the Cumplify team. It captures what each clause
  *requires* and what the SaaS *provides*, without reproducing ISO prose.
- Chunks are prefixed `[ISO <standard-number> <clause>]` (e.g., `[ISO 9001 4.1]`)
  to match the citation regex pattern and align with the clause-canon AR policy
  (152 tuples in `contracts/clause-corpus-map.md`).

---

## Functional Requirements

### REQ-CHUNK-1: Deterministic Chunker

The system SHALL chunk `docs/architecture/iso-requirements-map.md` into discrete
retrieval units using a deterministic, rule-based algorithm (no ML, no LLM).

| Sub-req | Description |
|---------|-------------|
| CHUNK-1a | Each chunk corresponds to ONE sub-clause (e.g., 4.1, 5.2.1, 8.3.4). Parent headers without their own (b)/(c) content get no standalone chunk. |
| CHUNK-1b | Each chunk is prefixed with `[ISO <NNNN> <clause>]` where NNNN is the standard number (9001, 14001, or 45001) and `<clause>` is the sub-clause number. Example: `[ISO 9001 4.1] Understanding the organization and its context — ...` |
| CHUNK-1c | A chunk includes the clause title, the (b) requirement summary, and the (c) SaaS-must-provide text as a single contiguous string. |
| CHUNK-1d | Chunks are joined with `\n---\n` at retrieval time (guru handler pattern, already implemented). |
| CHUNK-1e | The chunker is a pure function: `(sourceMarkdown: string) => Chunk[]` with no side effects. |
| CHUNK-1f | The chunker output is fully reproducible — same input always yields identical chunks with identical content hashes. |
| CHUNK-1g | The Annex SL / HLS closing section is chunked as a single cross-reference chunk prefixed `[Annex SL HLS]` — deliberately OUTSIDE the `[ISO …]` citation pattern so the model cannot cite it as a clause reference and the clause-canon AR policy does not attempt to validate it. |

### REQ-CHUNK-2: Chunk Metadata

Each chunk SHALL carry metadata aligned with the AOSS index template
(`services/agents/shared/aoss-index-template.json`):

| Field | Value | Purpose |
|-------|-------|---------|
| `metadata.tenantId` | `__ISO_CANON__` (constant) | Canon-tenant isolation — retrieval filter matches this constant for guru agents. |
| `metadata.standard` | `ISO9001` or `ISO14001` or `ISO45001` or `HLS` | Standard-scoped retrieval filtering. |
| `metadata.clauseRef` | e.g., `ISO 9001 4.1` | Enables clause-level retrieval and AR cross-check. |
| `metadata.lang` | `en` | Language tag (keyword). Seeds EN-only; ES/PT content is the Part 31 i18n carry. |

### REQ-SEED-1: Seeder Lambda

A VPC-placed Lambda SHALL embed and index all chunks into the `cumplify-iso-kb`
AOSS collection.

| Sub-req | Description |
|---------|-------------|
| SEED-1a | The Lambda is VPC-attached (same private subnets as applyTemplateFn / guru handlers) because the AOSS network policy is VPCE-only. |
| SEED-1b | Embedding uses the one-door `{op:'embed'}` transport (invoke-transport.ts `createEmbedFn()`). Never calls Bedrock directly. Model: amazon.titan-embed-text-v2:0, 1024 dimensions. The embed request sets `systemOp: true` to bypass credit pre-check via the existing SERVE-9 exempt flag. |
| SEED-1c | Before indexing, the Lambda calls `verifyTemplate()` (from `aoss-apply-template.ts`) and aborts if the template is absent or invalid (fail-closed — never index against auto-mapping). |
| SEED-1d | Each document written to AOSS has fields: `embedding` (1024-dim vector), `text` (chunk text), `metadata` (tenantId, standard, clauseRef, lang). |
| SEED-1e | Indexing uses SigV4-signed requests to the AOSS data-plane (same `signedAossFetch` client as existing apply-template and prover). |
| SEED-1f | The Lambda timeout SHALL be >= 300s (embedding ~79 chunks × one-door invoke latency + AOSS cold-start budget). |
| SEED-1g | The Lambda is NOT the aoss-prover (which refuses production index names by design). It is a separate, purpose-built seeder. |

### REQ-SEED-2: Idempotent Re-Seed by Content Hash

| Sub-req | Description |
|---------|-------------|
| SEED-2a | The seeder computes a SHA-256 content hash over the full chunked output (deterministic per CHUNK-1f). |
| SEED-2b | Before seeding, the Lambda reads a `_meta` document from the index (or DynamoDB marker) to compare the stored hash with the computed hash. If they match, seeding is skipped (no-op). |
| SEED-2c | On content change (hash mismatch), the seeder deletes the existing index (`cumplify-iso-kb`) and recreates it, then bulk-indexes all chunks. This is a full replace — no incremental patching. During the re-seed window, guru retrieval degrades to the dormant path (no grounding context) — this is an accepted-degraded state; zero-downtime swap is a Part 32.2 carry. |
| SEED-2d | The CDK custom resource uses `FileSystem.fingerprint('docs/architecture/iso-requirements-map.md')` as the physicalResourceId component so CloudFormation triggers re-seeding when the source file changes (same pattern as weight-seeder). |

### REQ-SEED-3: Metering for System Seeding (OQ-1 RESOLVED)

| Sub-req | Description |
|---------|-------------|
| SEED-3a | The embed request threads `systemOp: true` through the `EmbedRequest` type. The one-door embed path calls `checkCreditBalance(tenantId, true)` — using the EXISTING SERVE-9 exempt flag — so seeding never blocks on credits. |
| SEED-3b | Usage is STILL metered: `incrementMeter` writes to `TENANT#__ISO_CANON__#METER` as a platform-COGS counter (not a real tenant). |
| SEED-3c | The `emitCreditsTelemetry` payload carries `systemOp: true` so the downstream billing consumer excludes it from tenant invoicing. `telemetry.credits.consumed` is THE billing signal — the marker preserves billing-signal integrity. |
| SEED-3d | No `__ISO_CANON__` tenant row with unlimited credits is created (option 3 rejected). |
| SEED-3e | FLAGGED for owner ratification (billing-adjacent per steering 14-simplicity human-gated domain). |

### REQ-CANON-1: Canon-Tenant Convention

| Sub-req | Description |
|---------|-------------|
| CANON-1a | A constant `ISO_CANON_TENANT_ID = '__ISO_CANON__'` SHALL be defined in a shared constants module. |
| CANON-1b | Guru agent handlers (ISO9001Guru, ISO14001Guru, ISO45001Guru) SHALL pass `ISO_CANON_TENANT_ID` as the `tenantId` parameter to `retrieve()` when querying the iso-kb. This replaces the current pattern of passing the requesting user's tenantId for the iso-kb retrieval leg. |
| CANON-1c | The REQ-RET-1 mandatory tenantId filter (steering 01 intent) remains enforced — the filter value is the canon constant, not absent. Tenant-docs-kb and nc-history continue to use the user's tenantId. |
| CANON-1d | The existing guru handler retrieval calls SHALL be modified to use `ISO_CANON_TENANT_ID` for the iso-kb path ONLY. No other retrieval path is affected. |

### REQ-ACCESS-1: AOSS Data-Access Policy

| Sub-req | Description |
|---------|-------------|
| ACCESS-1a | The seeder Lambda's execution role SHALL be granted `aoss:APIAccessAll` on the `cumplify-iso-kb` collection ARN (IAM policy). |
| ACCESS-1b | The AOSS data-access policy for `cumplify-iso-kb` SHALL include the seeder Lambda role as a principal with `WriteDocument`, `CreateIndex`, `DeleteIndex`, `DescribeIndex`, `ReadDocument` permissions on `index/cumplify-iso-kb/*`. |
| ACCESS-1c | Guru handler roles already have `aoss:APIAccessAll` via `AgentHandlerReadOnlyPolicy` — no change needed for read-path. |

### REQ-DEPLOY-1: CDK Custom Resource Trigger

| Sub-req | Description |
|---------|-------------|
| DEPLOY-1a | The seeder Lambda is triggered as a CDK custom resource on every deployment where the source-file fingerprint changes. |
| DEPLOY-1b | The custom resource uses `cr.AwsCustomResource` invoking the seeder Lambda synchronously (RequestResponse). The custom-resource provider timeout MUST be >= the seeder Lambda timeout (>= 300s) to prevent CloudFormation from timing out the provider while the seeder is still running. |
| DEPLOY-1c | A failed seed (any error) fails the CloudFormation stack update — no silent partial state. |

### REQ-TEMPLATE-1: Index Template Update (OQ-3 RESOLVED)

| Sub-req | Description |
|---------|-------------|
| TEMPLATE-1a | The shared `aoss-index-template.json` SHALL add a `metadata.lang` field of type `keyword`. |
| TEMPLATE-1b | The `verifyTemplate()` expectations SHALL be updated to include `metadata.lang` type=keyword in the fail-closed check. |
| TEMPLATE-1c | This is an additive, non-breaking change. SEED-2c recreates the index on re-seed so existing (empty) indexes are replaced. |

---

## Non-Functional Requirements

### REQ-NFR-1: Cold-Start Budget

All AOSS access paths in the seeder (template verify, index operations, bulk
indexing) SHALL implement exponential-backoff retry with base 500ms, factor 2,
jitter, and 45s ceiling per the 02-aoss-rule. Lambda timeout >= 300s accounts
for multiple cold-start events during bulk indexing.

### REQ-NFR-2: Observability

| Sub-req | Description |
|---------|-------------|
| NFR-2a | The seeder emits structured Powertools logs with: `chunksTotal`, `chunksIndexed`, `contentHash`, `skipped` (boolean), `durationMs`. |
| NFR-2b | Embedding credit consumption is metered by the one-door under `TENANT#__ISO_CANON__#METER` with `systemOp: true` telemetry marker. |

### REQ-NFR-3: No Runtime Cost When Unchanged

When the content hash matches (SEED-2b), the seeder performs zero embeddings and
zero AOSS writes. The only cost is the Lambda invocation + one AOSS read (meta
document check). This preserves the >50% margin mandate — system seeding is a
one-time cost at deploy, not a recurring per-tenant expense.

---

## Acceptance Criteria

### ACC-1: Guru Full-Chain Grounded Answer

After seeding, an `askISO9001` query (e.g., "What does clause 4.1 require?")
SHALL return a response where:
- The guru handler's `groundingSource` is non-empty (retrieval returned chunks).
- The response includes a valid `clauseRef` matching `contracts/clause-corpus-map.md`.
- The contextual-grounding L1 check fires (grounding >= 0.85).

### ACC-2: Wrong-Tenant Isolation Re-Proof

A retrieval query against `cumplify-iso-kb` with `tenantId = 'TENANT-OTHER'`
(any value other than `__ISO_CANON__`) SHALL return zero chunks, proving that
the REQ-RET-1 metadata filter isolates canon content from arbitrary tenant queries.

### ACC-3: Idempotent No-Op on Unchanged Content

Running the seeder Lambda twice with the same source file SHALL result in the
second invocation skipping all embeddings/indexing (hash match). Evidence: logs
show `skipped: true`.

### ACC-4: Content Hash Change Triggers Re-Seed

Modifying `docs/architecture/iso-requirements-map.md` and deploying SHALL
trigger the custom resource, delete the old index, and re-seed with updated chunks.

### ACC-5: Template Verify Fail-Closed

If the index template is absent or has wrong dimensions/types, the seeder
SHALL abort with a clear error and fail the CloudFormation deployment.

### ACC-6: Metering Evidence

The seeding run meters embeddings under `TENANT#__ISO_CANON__#METER` with the
`systemOp: true` flag on all `telemetry.credits.consumed` events. NO real-tenant
meter row is touched. Evidence: DynamoDB scan of `TENANT#__ISO_CANON__#METER`
shows accumulated credits; no other `TENANT#*#METER` row changes during the
seeding window.

---

## Resolved Decisions (formerly Open Questions)

### OQ-1 RESOLVED: Metering Attribution — systemOp via SERVE-9 exempt flag

Thread `systemOp: true` through `EmbedRequest` → embed path calls
`checkCreditBalance(tenantId, true)` (existing SERVE-9 mechanism). Usage still
meters under `TENANT#__ISO_CANON__#METER` as platform-COGS counter. Stamp
`systemOp: true` on `telemetry.credits.consumed` payload so billing consumer
excludes it. Option 3 (unlimited-credits tenant row) rejected.
**FLAGGED for owner ratification** (billing-adjacent).

### OQ-2 RESOLVED: Index Name — keep `cumplify-iso-kb`

Unversioned. Pinned by deployed retrieval callers, guru env vars, and data-access
policy resource patterns (`index/cumplify-iso-kb/*`). Zero-downtime versioned swap
is the Part 32.2 standards-update carry.

### OQ-3 RESOLVED: i18n — add `metadata.lang` keyword NOW

Additive, non-breaking template change. Seed all chunks as `lang: 'en'`. ES/PT
content generation stays the Part 31 carry. Template-verify expectations updated
in the same commit.

### OQ-4 RESOLVED: Chunking — one chunk per sub-clause

8.3.1–8.3.6 individually (matches map's (b)/(c) granularity AND clause-canon
tuples). Parent headers without own (b)/(c) content get no standalone chunk.
Titan 8k-token limit is nowhere near threatened.

---

## Out of Scope

| Item | Reason | Tracked as |
|------|--------|-----------|
| Canon-release regeneration lifecycle | Part 32.2 standards-update spec | Named carry |
| Tenant-docs-kb ingestion | Separate spec (tenant document embedding) | Future spec |
| NC-history ingestion | Separate spec (nonconformity history embedding) | Future spec |
| ES/PT translated ISO-KB content | i18n KB localization (Part 31) | Named carry |
| Guru prompt tuning for grounded answers | Follow-on after content exists | Follow-on task |
| Copilot wiring to ISO-KB | Spec-35 named carry (ComplianceCopilot) | Separate spec |
| Zero-downtime index swap during re-seed | Part 32.2 carry (R-5 accepted-degraded) | Named carry |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `cumplify-iso-kb` collection (DataStack) | DEPLOYED | Exists in all envs |
| AOSS index template applied | DEPLOYED | Task 9 custom resource (verified live) |
| One-door embed path (`{op:'embed'}`) | DEPLOYED | spec-35 EMB-1..5, proven live |
| Guru handlers VPC-placed | DEPLOYED | fix-t20-3, live-proven |
| `retrieve()` with tenantId filter | DEPLOYED | REQ-RET-1, live-proven |
| AOSS VPC endpoint (data-plane) | DEPLOYED | NetworkStack, live-proven |
| `docs/architecture/iso-requirements-map.md` | COMMITTED | Source content (422 lines, sub-clauses across 3 standards + HLS note) |
| `contracts/clause-corpus-map.md` | COMMITTED | 152 tuples for AR validation alignment |
| SERVE-9 credit-exempt flag | DEPLOYED | `checkCreditBalance(tenantId, true)` path exists |

---

## References

- `#[[file:docs/architecture/iso-requirements-map.md]]` — sole content source
- `#[[file:services/agents/shared/aoss-index-template.json]]` — index mapping
- `#[[file:services/agents/shared/retrieval.ts]]` — retrieval with REQ-RET-1
- `#[[file:services/ai-invoker/src/embed.ts]]` — one-door embed implementation
- `#[[file:services/ai-invoker/src/credit-precheck.ts]]` — SERVE-9 exempt flag
- `#[[file:services/agents/shared/aoss-apply-template.ts]]` — verifyTemplate()
- `#[[file:services/agents/guru-9001/handler.ts]]` — guru retrieval consumer
- `#[[file:contracts/clause-corpus-map.md]]` — clause-canon tuples
- `#[[file:infra/lib/ai-stack.ts]]` — AOSS infra, custom resources, data-access
- `.kiro/evidence/iso-kb-seeding/requirements-review.md` — architect review
