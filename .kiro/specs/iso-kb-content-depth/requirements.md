# Requirements — ISO KB Content Depth

> **Spec:** iso-kb-content-depth
> **Status:** DRAFT (awaiting architect review)
> **Base commit:** 661e8e6 (develop)
> **Closes:** iso-kb-seeding Task 8 (ACC-1 letter: grounded guru answers >= 0.85)
> **Driving findings:** F-5 (clause-number questions semantically opaque to Titan v2),
> F-6 (one-line paraphrases insufficient for grounding >= 0.85)
> **Evidence:** `.kiro/evidence/iso-kb-seeding/task-8.log` — two probes + retrieval replays
> **Prerequisite specs:** iso-kb-seeding (seeder infrastructure live, 109 chunks indexed),
> guardrails-antihallucination (L1 grounding + L4 prompt library live)

---

## Problem Statement

The ISO knowledge base is seeded (109 chunks, pipeline proven end-to-end) but guru
agents honest-miss every question — the chain is working correctly by refusing to
ground on insufficient source material:

1. **F-6 (content depth):** Each chunk is a one-line paraphrase from
   `docs/architecture/iso-requirements-map.md`. Any useful guru answer necessarily
   exceeds the source text, so the worst-segment-minimum grounding score falls below
   0.85 even when retrieval is perfect (measured: 0.54 with perfect top-1 retrieval,
   relevance 1.0). The grounding gate correctly blocks — the answer has more
   substance than the source can support.

2. **F-5 (clause-number retrieval):** Questions phrased as "What does clause 4.1
   require?" are semantically opaque to Titan Embed v2 — the numeral "4.1" carries
   no embedding signal that would rank the correct chunk. Measured: top-5 contains
   NO relevant chunk (flat ~0.39 scores across all standards). The same question
   rephrased as a topic ("How should our organization determine external and internal
   issues?") retrieves perfectly (0.522 score, correct chunk at rank 1).

3. **L1 retry regression (observation):** The source-injection retry (L1-7) consistently
   scores WORSE than pass 1 (0.15 -> 0.01, 0.54 -> 0.02). The retry mechanism is
   not effective for this failure mode — content depth is the root cause, not prompt
   structure.

This spec delivers the full outcome: **live guru answers grounded >= 0.85 for BOTH
clause-number questions and topic questions**, which also closes iso-kb-seeding Task 8.

---

## Three-Leg Solution

| Leg | Problem Addressed | Approach |
|-----|-------------------|----------|
| **LEG-1: CONTENT** | F-6 — chunks too shallow for grounding | Expand each of the ~109 canon entries into multi-sentence in-house guidance |
| **LEG-2: RETRIEVAL** | F-5 — clause-number questions can't rank semantically | Hybrid clause-ref retrieval: parse explicit clause references -> term filter on `metadata.clauseRef`, kNN otherwise |
| **LEG-3: ANSWER STYLE** | Grounding check composition | Quote-first grounded composition for guru seats — the answer stays inside the source material |

---

## Content Constraints

### BC-2 (copyright compliance — HARD CONSTRAINT, unchanged from iso-kb-seeding)

**Zero reproduction of ISO standard text.** The content is in-house authored
paraphrase only. Every entry captures:
- What the clause *requires* (requirement essence, paraphrased)
- Implementation guidance (how organizations typically satisfy the requirement)
- Cumplify feature mapping (which module/agent addresses the clause)

This is NOT the ISO body text. It is Cumplify's own interpretive guidance that happens
to be organized by clause number. EN only this spec (ES/PT = Part 31 carry).

---

## Non-Negotiable Invariants

These conventions are owner-ratified from iso-kb-seeding and UNCHANGED by this spec:

| Invariant | Description |
|-----------|-------------|
| Chunk prefix format | `[ISO NNNN C.C] <title>` / `[Annex SL HLS]` — citation regex + AR clause-canon alignment |
| Canon-tenant convention | `metadata.tenantId = '__ISO_CANON__'`, `ISO_CANON_TENANT_ID` constant |
| Seeder infrastructure | EXISTING seeder unchanged — new content -> new hash -> auto re-seed on deploy; `EXPECTED_CHUNK_COUNT` re-pinned to new count |
| `systemOp` metering | Embed requests use `systemOp: true` — platform COGS, excluded from tenant billing |
| metadata schema | `{ tenantId, standard, clauseRef, lang }` keyword fields in AOSS |
| Grounding threshold | 0.85 for advisory guru seats — IMMOVABLE; content rises to the gate, never the reverse |
| One-door rule | All model invocations via `services/ai-invoker` — no direct Bedrock calls |

---

## Functional Requirements

### LEG 1 — Content Expansion

#### REQ-CONTENT-1: Expanded Clause Guidance Files

The system SHALL maintain per-standard content source files containing multi-sentence
in-house guidance for every clause currently seeded.

| Sub-req | Description |
|---------|-------------|
| CONTENT-1a | Each clause entry SHALL contain 3-6 sentences of substantive guidance covering: (1) requirement essence (what the clause demands, paraphrased), (2) implementation guidance (typical approaches to satisfy the requirement), (3) Cumplify feature mapping (which M-module and/or agent addresses the clause). |
| CONTENT-1b | Content is written at a level of detail sufficient to ground a 2-3 sentence guru answer without the answer exceeding the source material — the TARGET is that the grounding source contains MORE text than a typical guru response paragraph. |
| CONTENT-1c | Every entry retains the clause prefix format `[ISO NNNN C.C] <title>` as the opening line, unchanged from the existing chunk format — the chunker prefix regex and AR clause-canon alignment are preserved. |
| CONTENT-1d | Zero reproduction of ISO standard text (BC-2). All content is original Cumplify-authored guidance. Language that closely mirrors ISO normative prose must be independently reworded. |
| CONTENT-1e | The Annex SL / HLS cross-reference chunk is expanded with a multi-sentence explanation of what HLS means for integrated management systems and how Cumplify leverages shared clause structure. Prefix `[Annex SL HLS]` unchanged. |
| CONTENT-1f | Content is EN-only. ES/PT translations are the Part 31 i18n carry (out of scope). |

#### REQ-CONTENT-2: Chunker Compatibility

| Sub-req | Description |
|---------|-------------|
| CONTENT-2a | The expanded content files SHALL be consumable by the EXISTING chunker (`services/iso-kb-seeder/src/chunker.ts`) without modifications to its algorithm — OR — the chunker is updated to parse the new format with backward-compatible output (same `Chunk[]` type, same metadata fields). |
| CONTENT-2b | `EXPECTED_CHUNK_COUNT` SHALL be re-pinned to the new total chunk count (expected: same ~109 entries, expanded in content but not in number; if the file split changes the count, the constant is updated and unit tests re-pinned). |
| CONTENT-2c | The deterministic hash guarantee (SEED-2a) is preserved — same expanded content always produces identical chunks with identical content hashes. |
| CONTENT-2d | On deploy, the new content triggers re-seed automatically via the CDK `FileSystem.fingerprint` mechanism (DEPLOY-1a from iso-kb-seeding). The seeder deletes the old index and re-seeds with expanded chunks — accepted-degraded window per iso-kb-seeding R-5. |

#### REQ-CONTENT-3: Content Quality Gate

| Sub-req | Description |
|---------|-------------|
| CONTENT-3a | Each expanded entry SHALL be validated against `contracts/clause-corpus-map.md` — every `clauseRef` in the content must exist in the clause-canon (152 tuples). An entry with a non-existent clauseRef is a build-blocking defect. |
| CONTENT-3b | A unit test SHALL assert: for every chunk produced by the chunker, `metadata.clauseRef` exists in the clause-corpus-map's canonical set. |
| CONTENT-3c | Minimum chunk text length SHALL be asserted: every ISO chunk (excluding HLS) must be >= 200 characters (enforces that one-line paraphrases are replaced with substantive guidance). |

### LEG 2 — Hybrid Clause-Ref Retrieval

#### REQ-RETRIEVAL-1: Clause-Ref Parsing

The system SHALL parse explicit clause references from user questions before
executing retrieval.

| Sub-req | Description |
|---------|-------------|
| RETRIEVAL-1a | A clause-ref parser SHALL extract patterns matching ISO clause references from the question text. Recognized patterns include: `clause 4.1`, `4.1`, `ISO 9001 4.1`, `9001:2015 clause 8.3.4`, `section 7.1.5.2`, and reasonable variations (case-insensitive, with/without "clause"/"section" prefix). |
| RETRIEVAL-1b | The parser SHALL return a structured result: `{ clauseRef: string | null, standard: string | null }` where `clauseRef` matches the `metadata.clauseRef` keyword format (e.g., `ISO 9001 4.1`) and `standard` matches the `metadata.standard` keyword (e.g., `ISO9001`). |
| RETRIEVAL-1c | When the question contains multiple clause references, the parser SHALL return the first (primary) one. Multi-clause retrieval is out of scope. |
| RETRIEVAL-1d | The parser is a pure function with no I/O — unit-testable in isolation. |

#### REQ-RETRIEVAL-2: Hybrid Retrieval Strategy

The retrieval path for guru handlers SHALL implement a hybrid strategy: term-filter
retrieval when a clause-ref is detected, kNN otherwise.

| Sub-req | Description |
|---------|-------------|
| RETRIEVAL-2a | When `clauseRef` is parsed from the question, retrieval SHALL use a compound query: `term` filter on `metadata.clauseRef` (exact match) combined with the existing `term` filter on `metadata.tenantId`. The kNN vector scoring still applies for ranking within the filtered set. |
| RETRIEVAL-2b | When the guru handler's `standard` is known (e.g., ISO9001Guru always queries ISO 9001), the term filter SHALL additionally include `metadata.standard` to avoid cross-standard noise (e.g., "clause 4.1" exists in all three standards). |
| RETRIEVAL-2c | When NO clause-ref is parsed (topic-phrased question), retrieval SHALL fall back to the current kNN-only path with `metadata.tenantId` filter — unchanged from today. |
| RETRIEVAL-2d | The mandatory `tenantId` filter (REQ-RET-1, steering 01) is ALWAYS present regardless of retrieval strategy. |
| RETRIEVAL-2e | The hybrid retrieval strategy SHALL be implemented in a way that is usable by all three guru handlers (guru-9001, guru-14001, guru-45001) without code duplication — either as an extension to the shared `retrieve()` function or as a wrapper consumed by guru handlers. |
| RETRIEVAL-2f | If the term-filter path returns zero results (clauseRef not found in index), the system SHALL fall back to kNN retrieval for the same question — never return empty when content may exist under a different phrasing. |

#### REQ-RETRIEVAL-3: AOSS Query Shape

| Sub-req | Description |
|---------|-------------|
| RETRIEVAL-3a | The compound query for clause-ref retrieval SHALL use the OpenSearch `bool` query with `must` (kNN) + `filter` (term on clauseRef + tenantId + optional standard). This leverages AOSS's existing kNN-within-filter capability. |
| RETRIEVAL-3b | All AOSS access paths in the hybrid retrieval maintain the 02-aoss-rule: exponential-backoff retry with base 500ms, factor 2, jitter, 45s ceiling. |
| RETRIEVAL-3c | The `isAossRetryable` logic is unchanged — 404 (index_not_found) remains non-retryable for guru retrieval (fast-fail to dormant path during accepted-degraded windows). |

### LEG 3 — Quote-First Answer Style

#### REQ-ANSWER-1: Quote-First Guru Prompt Extension

The guru system prompts SHALL be extended with a quote-first composition instruction
that constrains answers to stay within the retrieved source material.

| Sub-req | Description |
|---------|-------------|
| ANSWER-1a | A shared prompt fragment SHALL instruct guru agents: "Begin your answer by quoting or closely paraphrasing the most relevant sentence(s) from the retrieved source material. Then add brief practical commentary that does not introduce claims beyond what the source supports. If the source does not contain enough information, say so." |
| ANSWER-1b | The quote-first instruction is added to the guru-specific prompts (guru-9001, guru-14001, guru-45001). It does NOT apply to non-guru agents (ControlTower, DocStudio, etc.). |
| ANSWER-1c | The instruction is designed to maximize the grounding score by ensuring the response's core factual content is a subset of the `groundingContext.source` text — the grounding check measures overlap between response and source, so answers that stay closer to source text score higher. |
| ANSWER-1d | The instruction explicitly includes the licensed-uncertainty fallback: "If the retrieved clauses do not address the question, respond with 'The standard does not specify this' — never fabricate guidance." (L4-3 alignment) |

#### REQ-ANSWER-2: Response Length Discipline

| Sub-req | Description |
|---------|-------------|
| ANSWER-2a | The guru prompt SHALL instruct: "Keep responses concise — 2-4 sentences per clause point. The goal is an accurate, grounded answer, not an exhaustive essay." This ensures responses do not outgrow the source material. |
| ANSWER-2b | The existing 5,000-char grounding-check limit (spec-35 L1-6: section-wise splitting) is respected — guru answers are expected to stay well below this threshold with the conciseness instruction. |

---

## Non-Functional Requirements

### REQ-NFR-1: Retrieval Latency Budget

The hybrid clause-ref retrieval path SHALL NOT add measurable latency compared to
the current kNN-only path — the term filter is evaluated server-side within the
same AOSS query. The 45s cold-start budget and exponential-backoff retry apply
equally to both paths.

### REQ-NFR-2: No New AWS Services

This spec introduces no new AWS services. All changes operate within the existing
deployed infrastructure: AOSS collection (`cumplify-iso-kb`), existing seeder Lambda,
existing guru handler Lambdas, existing AI invoker.

### REQ-NFR-3: Re-Seed Cost

Expanded content increases per-chunk token count (from ~50 tokens to ~150-250 tokens
per chunk). Total embedding cost for a full re-seed is still < $0.01 (109 chunks x
~250 tokens x $0.0002/1K tokens = ~$0.005). No margin impact.

### REQ-NFR-4: Backward Compatibility

The hybrid retrieval is additive — topic-phrased questions continue to use kNN-only
(identical to today's behavior). No regression for the topic-question path.

---

## Acceptance Criteria

### ACC-1: Clause-Number Question Grounded >= 0.85

After deployment, an `askISO9001` query with the exact Task-8 probe question
**"What does clause 4.1 require?"** SHALL return a grounded response where:
- The guru handler's `groundingSource` is non-empty (retrieval returned chunks).
- The top-1 retrieved chunk's `metadata.clauseRef` matches `ISO 9001 4.1`.
- The contextual-grounding L1 check PASSES (grounding score >= 0.85).
- The response is NOT the honest-miss template.

**Live probe:** Invoke `askISO9001` via AppSync, verify in CloudWatch logs.

### ACC-2: Topic Question Grounded >= 0.85

The same `askISO9001` query with the Task-8 topic probe **"How should our
organization determine external and internal issues relevant to its purpose?"**
SHALL return a grounded response where:
- Grounding score >= 0.85 (L1 check passes).
- The response is NOT the honest-miss template.
- Retrieved chunks are relevant to ISO 9001 clause 4.1.

**Live probe:** Invoke `askISO9001` via AppSync, verify in CloudWatch logs.

### ACC-3: Cross-Standard Clause-Ref Isolation

A clause-number query to `askISO9001` referencing "clause 4.1" SHALL retrieve
ISO 9001 4.1 content, NOT ISO 14001 4.1 or ISO 45001 4.1 — the `metadata.standard`
filter prevents cross-standard noise.

**Live probe:** Verify top-5 results all have `metadata.standard === 'ISO9001'`.

### ACC-4: Fallback to kNN on Unrecognized Clause-Ref

A query with a clauseRef that does NOT exist in the index (e.g., "What does clause
99.9 require?") SHALL fall back to kNN retrieval and return the closest semantic
match (or honest-miss if grounding fails) — never an empty retrieval with available
content.

**Unit test + integration probe.**

### ACC-5: Content Depth Minimum

Every ISO chunk (excluding HLS) in the re-seeded index SHALL have text length
>= 200 characters, proving one-line paraphrases have been replaced with
substantive multi-sentence guidance.

**Unit test:** Assert `chunk.text.length >= 200` for all non-HLS chunks.

### ACC-6: Chunk Count and Format Stability

After content expansion, the chunker produces the expected number of chunks
(re-pinned `EXPECTED_CHUNK_COUNT`), each with:
- Correct prefix format `[ISO NNNN C.C]` or `[Annex SL HLS]`.
- Valid `metadata.clauseRef` existing in `contracts/clause-corpus-map.md`.
- `metadata.tenantId === '__ISO_CANON__'`, `metadata.lang === 'en'`.

**Unit test:** Existing chunker test suite, updated for new content + min-length assertion.

### ACC-7: Idempotent Re-Seed Preserved

The seeder's hash-based idempotent no-op behavior is unchanged — running the
seeder twice with the same expanded content skips on the second invocation.

**Integration probe:** Same pattern as iso-kb-seeding ACC-3.

### ACC-8: iso-kb-seeding Task 8 Closure

ACC-1 and ACC-2 together satisfy the letter of iso-kb-seeding Task 8: "guru
full-chain grounded answer (live)" with "L1 grounding check fires (>= 0.85)."
When both ACC-1 and ACC-2 pass, iso-kb-seeding Task 8 is closed.

---

## Open Questions (for architect review — not decided here)

### OQ-1: Source-File Layout

Should the expanded content live in:
- **(a)** Extended `docs/architecture/iso-requirements-map.md` (expand the existing
  (b)/(c) entries in place), OR
- **(b)** Dedicated content files under `docs/kb/` (e.g., `docs/kb/iso-9001.md`,
  `docs/kb/iso-14001.md`, `docs/kb/iso-45001.md`) with the requirements-map
  remaining an architecture document.

**Architect lean:** Option (b) — the requirements-map is an architecture reference
document (module ownership, feature mapping); KB content files are an operational
data asset with different change cadence. Separation of concerns.

**Impact on seeder:** If (b), the chunker's source input changes from a single file
to multiple files. The CDK fingerprint trigger must hash all source files (or a
directory). The esbuild text-loader import changes to multiple imports or a dynamic
directory read at build time.

### OQ-2: Chunk Granularity for Expanded Content

With multi-sentence entries (~200-400 chars each), should the chunker:
- **(a)** Keep one chunk per sub-clause (same as today, just with more text per chunk), OR
- **(b)** Split into sub-chunks (e.g., one chunk for "requirement essence" and one for
  "implementation guidance") for finer-grained retrieval.

**Lean:** Option (a) — keeps chunk count stable, avoids fragmenting the grounding
source (the guru needs the full clause context to compose a coherent answer), and
preserves the 1:1 clauseRef-to-chunk mapping that hybrid retrieval depends on.

### OQ-3: Clause-Ref Parsing Location

Should the clause-ref parser live in:
- **(a)** The shared retrieval module (`services/agents/shared/`) as an extension to
  `retrieve()` or a pre-processing step, OR
- **(b)** The individual guru handlers (each handler parses before calling retrieve).

**Trade-offs:** (a) centralizes the logic, avoids duplication across 3 handlers, and
is testable in isolation. (b) gives per-guru control over standard inference (the
guru already knows its standard). A middle path: parser in shared, guru passes its
known `standard` as a parameter.

---

## Out of Scope

| Item | Reason | Tracked as |
|------|--------|-----------|
| ES/PT translated expanded content | Part 31 i18n carry | Named carry |
| Tenant-docs-kb retrieval | Separate spec | Future spec |
| Copilot wiring to ISO-KB | spec-35 carry (ComplianceCopilot) | Separate spec |
| Zero-downtime index swap during re-seed | Part 32.2 standards-update carry | Named carry |
| L1 retry mechanism improvement | Observed regression (retry scores worse) — separate investigation | Follow-on (spec-35 carry) |
| Multi-clause retrieval (questions referencing 2+ clauses) | Complexity; single-clause covers 95% of expected queries | Follow-on |
| Guru handler streaming | No streaming today; dormant carry in spec-35 L1-10 | Separate spec |
| Content for non-clause entries (e.g., Annex A controls) | Not in scope for ISO KB (Annex A is informative only) | Out of scope |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `cumplify-iso-kb` AOSS collection | DEPLOYED | Seeded with 109 chunks (live) |
| ISO KB seeder Lambda | DEPLOYED | Auto re-seeds on content hash change |
| Guru handlers (9001, 14001, 45001) | DEPLOYED | Retrieve from ISO KB using canon tenant |
| Shared retrieval (`services/agents/shared/retrieval.ts`) | DEPLOYED | kNN + tenantId filter |
| Grounding L1 check in AI invoker | DEPLOYED | Fires when `groundingContext` present |
| Shared prompt library (spec-35 L4) | DEPLOYED | Structural-honesty + licensed-uncertainty |
| `contracts/clause-corpus-map.md` | COMMITTED | 152 tuples for clause validation |
| `docs/architecture/iso-requirements-map.md` | COMMITTED | Existing source (to be expanded or replaced) |
| `EXPECTED_CHUNK_COUNT` constant | DEPLOYED | Currently 109, will be re-pinned |

---

## SOC 2 Impact

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC8 (Change Management) | Content changes deploy via CDK pipeline only (fingerprint-triggered re-seed). No ad-hoc content injection path. | CloudTrail Lambda:Invoke from CloudFormation service principal. |
| PI (Processing Integrity) | Deterministic chunker + content-hash idempotency ensures index state matches committed source. Grounding gate ensures answer quality. | Unit tests (hash determinism) + live grounding scores in CloudWatch. |
| C1 (Confidentiality) | Canon content is NOT tenant-confidential — in-house authored guidance. Tenant isolation unchanged (`__ISO_CANON__` filter). | ACC-3 cross-standard isolation proof + existing ACC-2 from iso-kb-seeding (wrong-tenant isolation). |

---

## References

- `#[[file:.kiro/evidence/iso-kb-seeding/task-8.log]]` — driving findings (F-5, F-6)
- `#[[file:.kiro/specs/iso-kb-seeding/requirements.md]]` — seeder spec (conventions)
- `#[[file:.kiro/specs/iso-kb-seeding/design.md]]` — seeder design (chunker, metadata)
- `#[[file:docs/architecture/iso-requirements-map.md]]` — current content source
- `#[[file:services/agents/shared/retrieval.ts]]` — existing retrieval implementation
- `#[[file:services/agents/guru-9001/handler.ts]]` — guru handler pattern
- `#[[file:services/agents/guru-9001/prompt.ts]]` — current guru system prompt
- `#[[file:services/agents/shared/constants.ts]]` — ISO_CANON_TENANT_ID, EXPECTED_CHUNK_COUNT
- `#[[file:services/iso-kb-seeder/src/chunker.ts]]` — deterministic chunker
- `#[[file:.kiro/specs/guardrails-antihallucination/design.md]]` — L4 prompt library, L1 grounding
- `#[[file:contracts/clause-corpus-map.md]]` — clause-canon (152 tuples)
- `#[[file:contracts/events.md]]` — event taxonomy (no new events in this spec)
