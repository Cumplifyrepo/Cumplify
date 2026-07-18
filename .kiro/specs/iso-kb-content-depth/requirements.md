# Requirements — ISO KB Content Depth (rev 2)

> **Spec:** iso-kb-content-depth
> **Status:** APPROVED (rev 2 — OQ resolutions folded, architect-reviewed)
> **Base commit:** 661e8e6 (develop)
> **Closes:** iso-kb-seeding Task 8 (ACC-1 letter: grounded guru answers >= 0.85)
> **Driving findings:** F-5 (clause-number questions semantically opaque to Titan v2),
> F-6 (one-line paraphrases insufficient for grounding >= 0.85)
> **Evidence:** `.kiro/evidence/iso-kb-seeding/task-8.log` — two probes + retrieval replays
> **Review:** `.kiro/evidence/iso-kb-content-depth/requirements-review.md`
> **Canon coverage:** PRE-VERIFIED by architect — 108/108 corpus clauseRefs exist in
> the 152-tuple canon (incl. ISO 45001 6.1.2.1/2/3); CONTENT-3a is satisfiable.
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

The system SHALL maintain dedicated per-standard content source files under `docs/kb/`
containing multi-sentence in-house guidance for every clause currently seeded.
`docs/architecture/iso-requirements-map.md` remains an architecture reference document
and is NO LONGER load-bearing for the KB.

| Sub-req | Description |
|---------|-------------|
| CONTENT-1a | Each clause entry SHALL contain 3-6 sentences of substantive guidance covering: (1) requirement essence (what the clause demands, paraphrased), (2) implementation guidance (typical approaches to satisfy the requirement), (3) Cumplify feature mapping (which M-module and/or agent addresses the clause). |
| CONTENT-1b | Content is written at a level of detail sufficient to ground a 2-3 sentence guru answer without the answer exceeding the source material — the TARGET is that the grounding source contains MORE text than a typical guru response paragraph. |
| CONTENT-1c | Every entry retains the clause prefix format `[ISO NNNN C.C] <title>` as the opening line, unchanged from the existing chunk format — the chunker prefix regex and AR clause-canon alignment are preserved. |
| CONTENT-1d | Zero reproduction of ISO standard text (BC-2). All content is original Cumplify-authored guidance. Language that closely mirrors ISO normative prose must be independently reworded. |
| CONTENT-1e | The Annex SL / HLS cross-reference chunk is expanded with a multi-sentence explanation of what HLS means for integrated management systems and how Cumplify leverages shared clause structure. Prefix `[Annex SL HLS]` unchanged. |
| CONTENT-1f | Content is EN-only. ES/PT translations are the Part 31 i18n carry (out of scope). |
| CONTENT-1g | Source files are: `docs/kb/iso-9001.md`, `docs/kb/iso-14001.md`, `docs/kb/iso-45001.md` (per-standard, one clause entry per sub-clause). HLS placement is a design decision. |

#### REQ-CONTENT-2: Chunker Compatibility

| Sub-req | Description |
|---------|-------------|
| CONTENT-2a | The chunker SHALL be updated to consume explicit per-standard source inputs (one string per file) rather than a single markdown file. Output remains the same `Chunk[]` type with the same metadata fields. |
| CONTENT-2b | Source loading uses STATIC esbuild text-loader imports — one import per content file. The "dynamic directory read at build time" option is STRUCK (D-1 incident class: no runtime fs, no dynamic glob). |
| CONTENT-2c | `EXPECTED_CHUNK_COUNT` SHALL remain 109 (108 ISO + 1 HLS) per OQ-2 resolution (one chunk per sub-clause, 1:1 clauseRef mapping load-bearing for LEG-2). Re-pin only if the split legitimately adds/removes sub-clauses (with justification). |
| CONTENT-2d | The deterministic hash guarantee (SEED-2a) is preserved — same expanded content always produces identical chunks with identical content hashes. |
| CONTENT-2e | On deploy, new content triggers re-seed automatically. The CDK fingerprint SHALL cover ALL content files (`FileSystem.fingerprint` on the `docs/kb/` directory, or a stable hash-of-fingerprints across the three files + HLS). |
| CONTENT-2f | The >=200 character floor (CONTENT-3c) applies to the full chunk TEXT (prefix + title + guidance body), asserted in the unit lane. |

#### REQ-CONTENT-3: Content Quality Gate

| Sub-req | Description |
|---------|-------------|
| CONTENT-3a | Each expanded entry SHALL be validated against `contracts/clause-corpus-map.md` — every `clauseRef` in the content must exist in the clause-canon (152 tuples). An entry with a non-existent clauseRef is a build-blocking defect. |
| CONTENT-3b | A unit test SHALL assert: for every chunk produced by the chunker, `metadata.clauseRef` exists in the clause-corpus-map's canonical set. |
| CONTENT-3c | Minimum chunk text length SHALL be asserted: every ISO chunk (excluding HLS) must be >= 200 characters (enforces that one-line paraphrases are replaced with substantive guidance). |

### LEG 2 — Hybrid Clause-Ref Retrieval

#### REQ-RETRIEVAL-1: Clause-Ref Parsing

The system SHALL parse explicit clause references from user questions before
executing retrieval. The parser is a pure function module in `services/agents/shared/`
(OQ-3 resolved: middle path).

| Sub-req | Description |
|---------|-------------|
| RETRIEVAL-1a | A clause-ref parser SHALL extract patterns matching ISO clause references from the question text. Recognized patterns include: `clause 4.1`, `4.1`, `ISO 9001 4.1`, `9001:2015 clause 8.3.4`, `section 7.1.5.2`, and reasonable variations (case-insensitive, with/without "clause"/"section" prefix). |
| RETRIEVAL-1b | The parser SHALL return a structured result: `{ clauseRef: string | null, standard: string | null }` where `clauseRef` matches the `metadata.clauseRef` keyword format (e.g., `ISO 9001 4.1`) and `standard` matches the `metadata.standard` keyword (e.g., `ISO9001`). |
| RETRIEVAL-1c | When the question contains multiple clause references, the parser SHALL return the first (primary) one. Multi-clause retrieval is out of scope. |
| RETRIEVAL-1d | The parser is a pure function with no I/O — unit-testable in isolation. |
| RETRIEVAL-1e | Bare-number parsing (e.g., "4.1") will false-positive on non-clause numerics (e.g., "improve efficiency by 4.1 percent"). RETRIEVAL-2f's zero-result fallback to kNN makes this safe, but a unit test SHALL cover at least one false-positive input to document the known behavior (N-1). |

#### REQ-RETRIEVAL-2: Hybrid Retrieval Strategy

The retrieval path for guru handlers SHALL implement a hybrid strategy: term-filter
retrieval when a clause-ref is detected, kNN otherwise.

| Sub-req | Description |
|---------|-------------|
| RETRIEVAL-2a | When `clauseRef` is parsed from the question, retrieval SHALL use a compound query: `term` filter on `metadata.clauseRef` (exact match) combined with the existing `term` filter on `metadata.tenantId`. The kNN vector scoring still applies for ranking within the filtered set. |
| RETRIEVAL-2b | When the guru handler's `standard` is known (e.g., ISO9001Guru always queries ISO 9001), the term filter SHALL additionally include `metadata.standard` to avoid cross-standard noise (e.g., "clause 4.1" exists in all three standards). |
| RETRIEVAL-2c | When NO clause-ref is parsed (topic-phrased question), retrieval SHALL fall back to the current kNN-only path with `metadata.tenantId` filter — unchanged from today. |
| RETRIEVAL-2d | The mandatory `tenantId` filter (REQ-RET-1, steering 01) is ALWAYS present regardless of retrieval strategy. |
| RETRIEVAL-2e | The hybrid retrieval strategy SHALL be implemented in the shared retrieval layer (`services/agents/shared/`). Each guru handler passes its known `standard` as a parameter. The parser module is shared; the hybrid logic lives in the retrieval module. No code duplication across handlers (OQ-3 resolved: middle path). |
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
| ANSWER-1a | A shared prompt fragment SHALL instruct guru agents to compose answers that stay within the retrieved source material. The wording MUST use the prohibited-patterns-by-example technique (per FIX-T29-3 lesson: showing the model what NOT to do outperforms abstract instruction). Design SHALL budget a live A/B iteration for the quote-first wording — the exact phrasing is finalized through empirical grounding-score measurement, not pre-ordained (N-2). |
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

**Live probe:** Invoke `askISO9001` via AppSync (fixture-token path, proven live
2026-07-16) or equivalent direct-invoke in resolver event shape (N-4: transport is
unchanged by this spec and separately proven). Verify in CloudWatch logs.

### ACC-2: Topic Question Grounded >= 0.85

The same `askISO9001` query with the Task-8 topic probe **"How should our
organization determine external and internal issues relevant to its purpose?"**
SHALL return a grounded response where:
- Grounding score >= 0.85 (L1 check passes).
- The response is NOT the honest-miss template.
- Retrieved chunks are relevant to ISO 9001 clause 4.1.

**Live probe:** Invoke `askISO9001` via AppSync (fixture-token path) or equivalent
direct-invoke in resolver event shape (N-4). Verify in CloudWatch logs.

### ACC-3: Cross-Standard Clause-Ref Isolation

A clause-number query to `askISO9001` referencing "clause 4.1" SHALL retrieve
ISO 9001 4.1 content, NOT ISO 14001 4.1 or ISO 45001 4.1 — the `metadata.standard`
filter prevents cross-standard noise.

**Live probe:** Verify all returned chunks have `metadata.standard === 'ISO9001'`
(under 1:1 term retrieval the filtered set is typically a single chunk — N-3).

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

## Resolved Decisions (formerly Open Questions)

### OQ-1 RESOLVED: Source-File Layout — dedicated `docs/kb/` per-standard files

Expanded content lives in dedicated files: `docs/kb/iso-9001.md`, `docs/kb/iso-14001.md`,
`docs/kb/iso-45001.md`. The `docs/architecture/iso-requirements-map.md` remains an
architecture reference document and is NO LONGER load-bearing for the KB.

**Design constraints (BINDING):**
- Source loading = STATIC esbuild text-loader imports, one per file. The "dynamic
  directory read at build time" option is STRUCK — the text loader has no glob/dynamic
  capability; anything dynamic reintroduces the D-1/prompt-library incident class.
- CDK re-seed trigger must fingerprint ALL content files (`FileSystem.fingerprint` on
  the `docs/kb/` directory, or a stable hash-of-fingerprints).
- Chunker consumes explicit `(source: string, standard: Standard)` inputs;
  deterministic output preserved.

### OQ-2 RESOLVED: Chunk Granularity — one chunk per sub-clause (option a)

The 1:1 clauseRef-to-chunk mapping is load-bearing for LEG-2 hybrid term retrieval.
Expected count stays 109 (108 ISO + 1 HLS). Re-pin only if the split legitimately
adds/removes sub-clauses (with justification in the commit).

### OQ-3 RESOLVED: Clause-Ref Parsing Location — middle path

Parser is a pure function module in `services/agents/shared/` (own file). Hybrid
retrieval strategy is implemented in the shared retrieval layer. Each guru handler
passes its known `standard` as a parameter to the hybrid retrieval call.

---

## Design-Binding Notes (from architect review)

- **N-1 (false-positive safety):** Bare-number parsing ("4.1") will false-positive on
  non-clause numerics. RETRIEVAL-2f's zero-result→kNN fallback makes this safe. A unit
  test SHALL cover at least one false-positive input (e.g., "improve efficiency by 4.1
  percent").
- **N-2 (quote-first wording):** ANSWER-1a wording must apply the FIX-T29-3 lesson:
  prohibited-patterns-by-example outperforms abstract instruction. Design budgets a
  live A/B iteration for the wording — exact phrasing finalized empirically.
- **N-3 (ACC-3 phrasing):** Under 1:1 term retrieval, the filtered set is typically a
  single chunk. ACC-3 states "all returned chunks" (not "top-5").
- **N-4 (probe transport):** AppSync fixture-token path is primary; direct-invoke in
  resolver event shape is an acceptable equivalent if fixture auth is unavailable at
  probe time — transport is unchanged by this spec and separately proven.
- **N-5 (content floor):** CONTENT-3c >=200-char floor applies to the full chunk TEXT
  (prefix + title + guidance body), asserted in the unit lane.
- **N-6 (cost):** NFR-3 cost arithmetic is order-of-magnitude correct and non-binding.

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
| `contracts/clause-corpus-map.md` | COMMITTED | 152 tuples for clause validation; 108/108 coverage PRE-VERIFIED |
| `docs/kb/` content files | TO BE AUTHORED | Per-standard expanded guidance (this spec creates them) |
| `EXPECTED_CHUNK_COUNT` constant | DEPLOYED | Currently 109, expected to remain 109 |

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
- `#[[file:.kiro/evidence/iso-kb-content-depth/requirements-review.md]]` — architect review
- `#[[file:.kiro/specs/iso-kb-seeding/requirements.md]]` — seeder spec (conventions)
- `#[[file:.kiro/specs/iso-kb-seeding/design.md]]` — seeder design (chunker, metadata)
- `#[[file:docs/architecture/iso-requirements-map.md]]` — architecture reference (no longer KB source)
- `#[[file:services/agents/shared/retrieval.ts]]` — existing retrieval implementation
- `#[[file:services/agents/guru-9001/handler.ts]]` — guru handler pattern
- `#[[file:services/agents/guru-9001/prompt.ts]]` — current guru system prompt
- `#[[file:services/agents/shared/constants.ts]]` — ISO_CANON_TENANT_ID, EXPECTED_CHUNK_COUNT
- `#[[file:services/iso-kb-seeder/src/chunker.ts]]` — deterministic chunker
- `#[[file:.kiro/specs/guardrails-antihallucination/design.md]]` — L4 prompt library, L1 grounding
- `#[[file:contracts/clause-corpus-map.md]]` — clause-canon (152 tuples)
- `#[[file:contracts/events.md]]` — event taxonomy (no new events in this spec)
