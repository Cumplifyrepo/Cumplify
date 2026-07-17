# Requirements — ISO KB Seeding

> **Spec:** iso-kb-seeding
> **Status:** DRAFT — awaiting architect review
> **Carry from:** spec-35 (guardrails-antihallucination), task-29/task-38 named carry:
> "KB-seeding spec decision (owner)"
> **Prerequisite specs:** platform-foundation (DataStack owns cumplify-iso-kb collection),
> agents-existing-8 (ai-stack: apply-template, retrieval, guru handlers, one-door embed)

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
from `docs/architecture/iso-requirements-map.md` and turns on real grounded RAG for
the three guru agents.

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
| CHUNK-1a | Each chunk corresponds to ONE sub-clause (e.g., 4.1, 5.2.1, 8.3.4). |
| CHUNK-1b | Each chunk is prefixed with `[ISO <NNNN> <clause>]` where NNNN is the standard number (9001, 14001, or 45001) and `<clause>` is the sub-clause number. Example: `[ISO 9001 4.1] Understanding the organization and its context — ...` |
| CHUNK-1c | A chunk includes the clause title, the (b) requirement summary, and the (c) SaaS-must-provide text as a single contiguous string. |
| CHUNK-1d | Chunks are joined with `\n---\n` at retrieval time (guru handler pattern, already implemented). |
| CHUNK-1e | The chunker is a pure function: `(sourceMarkdown: string) => Chunk[]` with no side effects. |
| CHUNK-1f | The chunker output is fully reproducible — same input always yields identical chunks with identical content hashes. |
| CHUNK-1g | The Annex SL / HLS closing section is chunked as a single cross-reference chunk prefixed `[ISO HLS Annex-SL]`. |

### REQ-CHUNK-2: Chunk Metadata

Each chunk SHALL carry metadata aligned with the AOSS index template
(`services/agents/shared/aoss-index-template.json`):

| Field | Value | Purpose |
|-------|-------|---------|
| `metadata.tenantId` | `__ISO_CANON__` (constant) | Canon-tenant isolation — retrieval filter matches this constant for guru agents. |
| `metadata.standard` | `ISO9001` or `ISO14001` or `ISO45001` or `HLS` | Standard-scoped retrieval filtering. |
| `metadata.clauseRef` | e.g., `ISO 9001 4.1` | Enables clause-level retrieval and AR cross-check. |

### REQ-SEED-1: Seeder Lambda

A VPC-placed Lambda SHALL embed and index all chunks into the `cumplify-iso-kb`
AOSS collection.

| Sub-req | Description |
|---------|-------------|
| SEED-1a | The Lambda is VPC-attached (same private subnets as applyTemplateFn / guru handlers) because the AOSS network policy is VPCE-only. |
| SEED-1b | Embedding uses the one-door `{op:'embed'}` transport (invoke-transport.ts `createEmbedFn()`). Never calls Bedrock directly. Model: amazon.titan-embed-text-v2:0, 1024 dimensions. |
| SEED-1c | Before indexing, the Lambda calls `verifyTemplate()` (from `aoss-apply-template.ts`) and aborts if the template is absent or invalid (fail-closed — never index against auto-mapping). |
| SEED-1d | Each document written to AOSS has fields: `embedding` (1024-dim vector), `text` (chunk text), `metadata` (tenantId, standard, clauseRef). |
| SEED-1e | Indexing uses SigV4-signed requests to the AOSS data-plane (same `signedAossFetch` client as existing apply-template and prover). |
| SEED-1f | The Lambda timeout SHALL be >= 300s (embedding ~79 chunks × one-door invoke latency + AOSS cold-start budget). |
| SEED-1g | The Lambda is NOT the aoss-prover (which refuses production index names by design). It is a separate, purpose-built seeder. |

### REQ-SEED-2: Idempotent Re-Seed by Content Hash

| Sub-req | Description |
|---------|-------------|
| SEED-2a | The seeder computes a SHA-256 content hash over the full chunked output (deterministic per CHUNK-1f). |
| SEED-2b | Before seeding, the Lambda reads a `_meta` document from the index (or DynamoDB marker) to compare the stored hash with the computed hash. If they match, seeding is skipped (no-op). |
| SEED-2c | On content change (hash mismatch), the seeder deletes the existing index (`cumplify-iso-kb`) and recreates it, then bulk-indexes all chunks. This is a full replace — no incremental patching. |
| SEED-2d | The CDK custom resource uses `FileSystem.fingerprint('docs/architecture/iso-requirements-map.md')` as the physicalResourceId component so CloudFormation triggers re-seeding when the source file changes (same pattern as weight-seeder). |

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
| DEPLOY-1b | The custom resource uses `cr.AwsCustomResource` invoking the seeder Lambda synchronously (RequestResponse). |
| DEPLOY-1c | A failed seed (any error) fails the CloudFormation stack update — no silent partial state. |

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
| NFR-2b | Embedding credit consumption is automatically metered by the one-door (existing behavior — no additional work). |

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

---

## Open Questions (for architect review)

### OQ-1: Metering Attribution for System Seeding

The one-door embed path requires a `tenantId` for credit metering. Options:
1. **Use `__ISO_CANON__` as the tenantId** — embeddings are metered under a
   synthetic "system" tenant. Credits consumed are platform COGS, not billed
   to any real tenant. Requires the credit-precheck to NOT block on a
   non-existent tenant's balance (or a bypass flag for system operations).
2. **Exempt system seeding from credit metering entirely** — add an
   `isSystemOp: true` flag to the embed request that skips `checkCreditBalance`
   and meters to a platform-COGS counter instead of a tenant counter.
3. **Pre-provision a `__ISO_CANON__` tenant row with unlimited credits** — the
   simplest code path but pollutes the tenant data model.

**Architect decision needed:** Which option? Option 2 aligns with the exception
paths pattern (incident reporting, HITL approvals already bypass credit checks
per 12-token-metering.md), but requires a new code path in the invoker.

### OQ-2: Index Name

The retrieval wrapper currently uses `indexName: 'cumplify-iso-kb'` (same as the
collection name). AOSS allows multiple indexes per collection, but the prover and
apply-template both operate on `cumplify-iso-kb` as both collection AND index name.
Confirm: is the index name `cumplify-iso-kb` correct, or should a versioned name
(e.g., `cumplify-iso-kb-v1`) be used for zero-downtime re-seeding?

### OQ-3: i18n Seed Variants (Part 31 carry)

Steering 17-i18n states: "ISO-KB retrieval filters `lang` first, falls back to EN
with 'translated from English source' marker." The current index template has no
`lang` metadata field. This spec seeds EN-only content. Should:
1. A `metadata.lang` field be added to the index template NOW (forward-compatible)?
2. Or defer the `lang` field to a future i18n-kb spec (named carry)?

**Recommendation:** Add the field to the template now (non-breaking, keyword type),
seed all chunks as `lang: 'en'`, and defer ES/PT content generation. But this
touches the shared `aoss-index-template.json` — architect confirmation needed.

### OQ-4: Chunk Size Limits

Titan Embed v2 accepts up to 8,192 tokens per input. Most sub-clause chunks from
the iso-requirements-map should be well under this limit, but a few (e.g., 8.3
Design and Development with sub-clauses 8.3.1–8.3.6) may be long if grouped.
Confirm: should 8.3 sub-clauses remain as individual chunks (one per 8.3.x) or
be grouped under a single 8.3 chunk?

---

## Out of Scope

| Item | Reason | Tracked as |
|------|--------|-----------|
| Canon-release regeneration lifecycle | Part 32.2 standards-update spec | Named carry |
| Tenant-docs-kb ingestion | Separate spec (tenant document embedding) | Future spec |
| NC-history ingestion | Separate spec (nonconformity history embedding) | Future spec |
| ES/PT translated ISO-KB content | i18n KB localization (Part 31) | Named carry (OQ-3) |
| Guru prompt tuning for grounded answers | Follow-on after content exists | Follow-on task |
| Copilot wiring to ISO-KB | Spec-35 named carry (ComplianceCopilot) | Separate spec |

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
| `docs/architecture/iso-requirements-map.md` | COMMITTED | Source content (~530 lines, 79 sub-clauses across 3 standards + HLS note) |
| `contracts/clause-corpus-map.md` | COMMITTED | 152 tuples for AR validation alignment |

---

## References

- `#[[file:docs/architecture/iso-requirements-map.md]]` — sole content source
- `#[[file:services/agents/shared/aoss-index-template.json]]` — index mapping
- `#[[file:services/agents/shared/retrieval.ts]]` — retrieval with REQ-RET-1
- `#[[file:services/ai-invoker/src/embed.ts]]` — one-door embed implementation
- `#[[file:services/agents/shared/aoss-apply-template.ts]]` — verifyTemplate()
- `#[[file:services/agents/guru-9001/handler.ts]]` — guru retrieval consumer
- `#[[file:contracts/clause-corpus-map.md]]` — clause-canon tuples
- `#[[file:infra/lib/ai-stack.ts]]` — AOSS infra, custom resources, data-access
- `.kiro/evidence/guardrails-antihallucination/fix-t20-3.log` — 401 root cause + VPC fix
- `.kiro/evidence/guardrails-antihallucination/task-29.log` — KB-seeding named carry
- `.kiro/evidence/guardrails-antihallucination/task-38.log` — spec-35 closure + carries
