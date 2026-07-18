# Design — ISO KB Content Depth

> **Spec:** iso-kb-content-depth
> **Requirements:** `#[[file:.kiro/specs/iso-kb-content-depth/requirements.md]]` (rev 2, approved)
> **Status:** APPROVED (rev 2 — D-1'..D-4' corrections folded)
> **Base commit:** 167f16a (develop)
> **Review:** `.kiro/evidence/iso-kb-content-depth/design-review.md`

---

## 1. Architecture Overview

```
LEG-1 (CONTENT)                    LEG-2 (RETRIEVAL)              LEG-3 (ANSWER STYLE)
┌──────────────────────┐           ┌──────────────────────┐       ┌─────────────────────┐
│ docs/kb/             │           │ services/agents/     │       │ services/agents/    │
│   iso-9001.md        │           │   shared/            │       │   guru-*/prompt.ts  │
│   iso-14001.md       │           │   clause-ref-        │       │   + quote-first     │
│   iso-45001.md       │           │     parser.ts        │       │     fragment        │
│   hls.md             │           │   retrieval.ts       │       │                     │
└────────┬─────────────┘           │   (hybrid strategy)  │       └─────────────────────┘
         │ esbuild text-loader     └──────────┬───────────┘
         │ (STATIC imports)                   │
         ▼                                    ▼
┌──────────────────────┐           ┌──────────────────────┐
│ iso-kb-seeder/       │           │ Guru Handler         │
│   handler.ts         │           │ (9001/14001/45001)   │
│   chunker.ts         │           │  parseClauseRef(q)   │
│   (updated API)      │           │  → retrieve(hybrid)  │
└────────┬─────────────┘           │  → invokeFn(...)     │
         │ deploy (CDK CR)         └──────────────────────┘
         ▼
┌──────────────────────┐
│ cumplify-iso-kb      │
│ (AOSS, 109 chunks,   │
│  expanded content)   │
└──────────────────────┘
```

---

## 2. LEG-1: Content Source Files & Chunker

### 2.1 File Layout

```
docs/kb/
├── iso-9001.md      # 50 clause entries (clauses 4–10, ISO 9001:2015)
├── iso-14001.md     # 26 clause entries (clauses 4–10, ISO 14001:2015)
├── iso-45001.md     # 32 clause entries (clauses 4–10, ISO 45001:2018)
└── hls.md           # 1 HLS cross-reference entry
```

Total: 108 ISO + 1 HLS = 109 chunks (matches EXPECTED_CHUNK_COUNT).
Per-standard counts (50/26/32) are live-witnessed (architect prover terms agg
2026-07-18) and pinned in unit tests (D-2').

### 2.2 Content File Format

Each per-standard file uses a simple, chunker-friendly format — one entry per
sub-clause, separated by blank lines:

```markdown
[ISO 9001 4.1] Understanding the organization and its context
This clause requires the organization to identify external and internal issues
that affect its ability to achieve intended QMS outcomes. Organizations typically
conduct PESTEL analysis, SWOT reviews, or similar structured assessments to
catalog these issues and link them to strategic direction. In Cumplify, the M6
Context & Stakeholder Studio provides a context register with issue type
classification, ownership, review dates, and linkage to strategic direction.
The ContextCartographer agent assists in drafting and refreshing context issues.

[ISO 9001 4.2] Understanding the needs and expectations of interested parties
...
```

**Format rules:**
- Line 1: `[ISO <NNNN> <clauseNum>] <title>` — the chunk prefix (unchanged format).
- Lines 2+: Multi-sentence guidance body (3-6 sentences covering requirement essence,
  implementation guidance, and Cumplify feature mapping).
- Entries separated by a single blank line.
- No markdown headers (`#`, `##`) inside entries — headers are reserved for optional
  section-level comments that the chunker skips.

**HLS file format (`docs/kb/hls.md`):**
```markdown
[Annex SL HLS] High-Level Structure for Integrated Management Systems
The Annex SL High-Level Structure (HLS) defines a common framework that all ISO
management system standards share. Clauses 4 through 10 follow an identical
numbering and intent across ISO 9001, 14001, and 45001, enabling organizations
to build a single integrated management system rather than maintaining separate
silos. Cumplify leverages this shared structure by providing unified process maps,
cross-standard audit checklists, and a single ControlTower agent that governs
clauses common to all three standards (4.4, 5.1, 5.3). Standard-specific
requirements (e.g., 8.3 Design & Development in 9001, 6.1.2 Environmental
Aspects in 14001, 6.1.2.1 Hazard Identification in 45001) are handled by their
respective guru agents and domain modules.
```

### 2.3 Chunker Update

The chunker signature changes from a single-source parser to a multi-source aggregator.
The old section-detection logic (searching for `# Section A`, `# Section B`, etc.) is
replaced by explicit per-file parsing with a simpler algorithm.

**New public API (`services/iso-kb-seeder/src/chunker.ts`):**

```typescript
import { ISO_CANON_TENANT_ID } from '../../agents/shared/constants.js';

export type Standard = 'ISO9001' | 'ISO14001' | 'ISO45001' | 'HLS';

export interface ChunkMetadata {
  tenantId: string;
  standard: Standard;
  clauseRef: string;
  lang: string;
}

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface ContentSource {
  source: string;    // raw markdown content (esbuild text-loader inline)
  standard: Standard;
  stdNum: string;    // '9001', '14001', '45001', or '' (HLS)
}

/**
 * Chunk multiple content source files into retrieval units.
 * One chunk per entry (1:1 clauseRef mapping, OQ-2 resolved).
 * Deterministic: same inputs → same output (CONTENT-2d).
 */
export function chunkContentSources(sources: ContentSource[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const src of sources) {
    if (src.standard === 'HLS') {
      chunks.push(...parseHlsSource(src.source));
    } else {
      chunks.push(...parseStandardSource(src.source, src.standard, src.stdNum));
    }
  }
  return chunks;
}

// D-4': chunkIsoRequirementsMap is DELETED (not wrapped). The old map is no longer
// KB authority (OQ-1b). Its tests are retired with the migration.
```

**Parsing algorithm (per-standard file):**

```
INPUT: source markdown string, standard ('ISO9001'), stdNum ('9001')
OUTPUT: Chunk[]

1. Split source on blank-line boundaries (double newline).
2. For each entry block:
   a. First line MUST match: /^\[ISO \d{4,5} (\d+(?:\.\d+)+)\] (.+)$/
      → extract clauseNum, title
   b. Remaining lines = guidance body (joined with spaces, trimmed)
   c. Compose chunk text: "[ISO <stdNum> <clauseNum>] <title>\n<guidance body>"
   d. Set metadata: { tenantId: ISO_CANON_TENANT_ID, standard, clauseRef: 'ISO <stdNum> <clauseNum>', lang: 'en' }
3. Skip blocks that don't match the prefix pattern (comments, blank sections).
```

**HLS parsing:** Single-entry file. Same algorithm but prefix pattern is
`/^\[Annex SL HLS\] (.+)$/` and metadata uses `standard: 'HLS'`,
`clauseRef: 'Annex SL HLS'`.

### 2.4 Seeder Handler Update (Static Imports — D-1 Compliance)

The handler changes from a single source import to four static imports:

```typescript
// D-1: Build-time inline — esbuild text loader resolves at bundle, NOT runtime fs
// OQ-1 RESOLVED: STATIC imports only. Dynamic directory read is STRUCK (D-1 incident class).
import iso9001Source from '../../../docs/kb/iso-9001.md';
import iso14001Source from '../../../docs/kb/iso-14001.md';
import iso45001Source from '../../../docs/kb/iso-45001.md';
import hlsSource from '../../../docs/kb/hls.md';

import { chunkContentSources, ContentSource } from './chunker.js';

const CONTENT_SOURCES: ContentSource[] = [
  { source: iso9001Source, standard: 'ISO9001', stdNum: '9001' },
  { source: iso14001Source, standard: 'ISO14001', stdNum: '14001' },
  { source: iso45001Source, standard: 'ISO45001', stdNum: '45001' },
  { source: hlsSource, standard: 'HLS', stdNum: '' },
];

export async function seed(): Promise<SeederResult> {
  const start = Date.now();
  // 1. Chunk (pure function, build-time-inlined sources)
  const chunks = chunkContentSources(CONTENT_SOURCES);
  // ... rest unchanged (hash, meta-check, verify, delete, create, embed, index, write-meta)
}
```

**esbuild bundling config (unchanged):**
```typescript
bundling: {
  externalModules: [],
  target: 'node22',
  loader: { '.md': 'text' }, // D-1: esbuild text loader for .md files
},
```

### 2.5 CDK Fingerprint Update

The CDK custom resource trigger must fingerprint ALL content files. Since
`FileSystem.fingerprint` accepts a directory path, fingerprinting `docs/kb/` covers
all four files:

```typescript
// BEFORE (single file):
// const isoKbSourceHash = cdk.FileSystem.fingerprint(
//   'docs/architecture/iso-requirements-map.md',
// );

// AFTER (directory — covers all files in docs/kb/):
const isoKbSourceHash = cdk.FileSystem.fingerprint('docs/kb');
```

`FileSystem.fingerprint` on a directory produces a stable hash of all file contents
within it (recursively). Any file change in `docs/kb/` produces a new hash, triggering
the custom resource update.

**Note:** The old fingerprint on `docs/architecture/iso-requirements-map.md` is removed.
That file is no longer KB source material.

---

## 3. LEG-2: Hybrid Clause-Ref Retrieval

### 3.1 Clause-Ref Parser (`services/agents/shared/clause-ref-parser.ts`)

Pure function module — no I/O, no side effects, unit-testable in isolation (OQ-3 resolved).

```typescript
export interface ParsedClauseRef {
  /** Formatted for metadata.clauseRef match, e.g., 'ISO 9001 4.1' */
  clauseRef: string | null;
  /** Formatted for metadata.standard match, e.g., 'ISO9001' — inferred from question or null */
  standard: string | null;
}

/**
 * Parse a clause reference from a user question.
 * Returns { clauseRef, standard } or { null, null } if no clause-ref detected.
 *
 * RETRIEVAL-1a patterns (priority order):
 *   1. "ISO 9001 4.1" / "ISO 9001:2015 clause 4.1" → clauseRef='ISO 9001 4.1', standard='ISO9001'
 *   2. "clause 4.1" / "section 7.1.5.2" → clauseRef=null (no stdNum), standard=null
 *   3. "4.1" (bare number) → clauseRef=null (no stdNum), standard=null
 *
 * When the guru handler knows its standard, it composes the full clauseRef:
 *   parsed.clauseRef ?? (parsedClauseNum ? `ISO ${guruStdNum} ${parsedClauseNum}` : null)
 */
export function parseClauseRef(question: string): ParsedClauseRef & { clauseNum: string | null } {
  // Priority 1: Full ISO reference — "ISO 9001 4.1" or "ISO 9001:2015 clause 4.1"
  const fullMatch = question.match(
    /\bISO\s+(9001|14001|45001)(?::20\d{2})?\s+(?:clause\s+|section\s+)?(\d+(?:\.\d+)+)\b/i,
  );
  if (fullMatch) {
    const [, stdNum, clauseNum] = fullMatch;
    return {
      clauseRef: `ISO ${stdNum} ${clauseNum}`,
      standard: `ISO${stdNum}` as string,
      clauseNum,
    };
  }

  // Priority 2: "clause X.Y" / "section X.Y" (no standard specified)
  const labeledMatch = question.match(
    /\b(?:clause|section)\s+(\d+(?:\.\d+)+)\b/i,
  );
  if (labeledMatch) {
    return { clauseRef: null, standard: null, clauseNum: labeledMatch[1] };
  }

  // Priority 3: Bare clause number — X.Y where X is 4-10 (valid ISO clause range)
  // N-1: bare-number parsing will false-positive on non-clause numerics
  // (e.g., "4.1 percent"). RETRIEVAL-2f fallback makes this safe.
  const bareMatch = question.match(
    /\b((?:[4-9]|10)(?:\.\d+)+)\b/,
  );
  if (bareMatch) {
    return { clauseRef: null, standard: null, clauseNum: bareMatch[1] };
  }

  return { clauseRef: null, standard: null, clauseNum: null };
}
```

**Key design decisions:**
- The parser returns `clauseNum` separately from `clauseRef` so the guru handler can
  compose the full `clauseRef` using its known standard when the question doesn't
  specify one (e.g., "clause 4.1" asked to ISO9001Guru → `ISO 9001 4.1`).
- Bare-number regex restricts leading digit to 4-10 (the valid ISO clause range) to
  reduce false positives, but N-1 acknowledges this isn't perfect.
- First match wins (RETRIEVAL-1c: first/primary clause reference).

### 3.2 Hybrid Retrieval Strategy (`services/agents/shared/retrieval.ts`)

The existing `retrieve()` function gains an optional `HybridRetrievalOptions` parameter.
The core kNN logic is unchanged for topic-phrased questions (NFR-4 backward compat).

**Extended interface:**

```typescript
export interface HybridRetrievalOptions {
  /** Clause reference to filter on (metadata.clauseRef exact match) */
  clauseRef?: string;
  /** Standard to filter on (metadata.standard exact match) */
  standard?: string;
}

export interface RetrievalRequest {
  tenantId: string;              // MANDATORY (REQ-RET-1, unchanged)
  collectionEndpoint: string;
  indexName: string;
  queryText: string;
  queryVector: number[];         // 1024-dim (Titan Embed v2)
  topK?: number;
  scoreThreshold?: number;
  /** NEW: hybrid clause-ref filtering */
  hybrid?: HybridRetrievalOptions;
}
```

**Query construction (updated `buildKnnQuery`):**

```typescript
function buildKnnQuery(
  vector: number[],
  tenantId: string,
  topK: number,
  scoreThreshold?: number,
  hybrid?: HybridRetrievalOptions,
): Record<string, unknown> {
  // Build filter — always includes tenantId (REQ-RET-1)
  const filterClauses: Record<string, unknown>[] = [
    { term: { 'metadata.tenantId': tenantId } },
  ];

  // Add clauseRef term filter when hybrid parsing detected a clause reference
  if (hybrid?.clauseRef) {
    filterClauses.push({ term: { 'metadata.clauseRef': hybrid.clauseRef } });
  }

  // Add standard term filter when guru's standard is known (RETRIEVAL-2b)
  if (hybrid?.standard) {
    filterClauses.push({ term: { 'metadata.standard': hybrid.standard } });
  }

  // Compose filter: single term or bool.must array
  const filter = filterClauses.length === 1
    ? filterClauses[0]
    : { bool: { must: filterClauses } };

  const query: Record<string, unknown> = {
    size: topK,
    query: {
      knn: {
        embedding: {
          vector,
          k: topK,
          filter,  // RETRIEVAL-3a: kNN within filter
        },
      },
    },
    _source: ['text', 'metadata'],
  };

  if (scoreThreshold !== undefined) {
    (query as any).min_score = scoreThreshold;
  }

  return query;
}
```

**RETRIEVAL-2f fallback (zero-result → kNN-only):**

```typescript
export async function retrieve(
  request: RetrievalRequest,
  httpClient?: AossHttpClient,
): Promise<RetrievalResult> {
  // ... existing validation (tenantId, vector dimensions) ...

  // First attempt: with hybrid filters if present
  const result = await executeWithRetry(request, httpClient);

  // RETRIEVAL-2f: if hybrid filters returned zero results, retry without clauseRef/standard
  if (result.chunks.length === 0 && request.hybrid?.clauseRef) {
    logger.info('Hybrid clause-ref returned 0 results — falling back to kNN-only', {
      clauseRef: request.hybrid.clauseRef,
    });
    const fallbackRequest = { ...request, hybrid: undefined };
    return executeWithRetry(fallbackRequest, httpClient);
  }

  return result;
}
```

**Design rationale:**
- The `bool.must` compound filter is evaluated server-side within AOSS before kNN scoring
  — zero additional latency for the client (NFR-1).
- When `hybrid.clauseRef` targets a 1:1 chunk (the norm under OQ-2), the kNN scoring is
  trivial (single document in the filtered set). The vector is still required because
  AOSS kNN queries always need one.
- Fallback ensures false-positive parser outputs (N-1) never result in empty retrieval
  when content exists.

### 3.3 Guru Handler Integration

Each guru handler calls the parser and passes the result to `retrieve()`.
**D-3': When the parser returns an explicit `standard` (priority-1 match), it WINS
over the guru's own standard.** The guru's standard is used only when composing a
ref from bare/labeled clauseNum (priority 2/3).

```typescript
// services/agents/guru-9001/handler.ts (representative — 14001/45001 identical pattern)
import { parseClauseRef } from '../shared/clause-ref-parser.js';

const GURU_STANDARD = 'ISO9001';
const GURU_STD_NUM = '9001';

export async function handleQuery(tenantId: string, question: string, locale?: string): Promise<string> {
  const truncatedQuery = question.slice(0, 1000);

  // LEG-2: parse clause reference from question
  const parsed = parseClauseRef(truncatedQuery);

  // D-3': parsed standard WINS when question names one explicitly (priority 1)
  const clauseRef = parsed.clauseRef
    ?? (parsed.clauseNum ? `ISO ${GURU_STD_NUM} ${parsed.clauseNum}` : null);
  const standard = parsed.standard ?? (clauseRef ? GURU_STANDARD : undefined);

  const { embedding } = await embedFn({ ... });

  let groundingSource = '';
  try {
    const results = await retrieve({
      tenantId: ISO_CANON_TENANT_ID,
      collectionEndpoint: AOSS_ISO_KB_ENDPOINT,
      indexName: 'cumplify-iso-kb',
      queryText: truncatedQuery,
      queryVector: embedding,
      topK: 5,
      // NEW: hybrid options (null/undefined values omitted)
      ...(clauseRef && {
        hybrid: { clauseRef, standard },
      }),
    });
    groundingSource = results.chunks.map((c) => c.text).join('\n---\n');
  } catch { /* dormant path unchanged */ }

  // ... rest unchanged (invokeFn with groundingContext) ...
}
```

**D-3' semantics:** If a user asks ISO9001Guru "What does ISO 14001 4.1 require?",
priority-1 parsing yields `clauseRef='ISO 14001 4.1'` and `standard='ISO14001'`.
The handler uses BOTH from the parser (not overriding with its own 'ISO9001').
This avoids contradictory filters (clauseRef=14001 + standard=9001) that would
guarantee zero results and force a wasteful fallback cycle.

---

## 4. LEG-3: Quote-First Prompt Fragment

### 4.1 Prompt Fragment (`prompts/shared/grounded-composition.md`)

Placed alongside existing L4 prompt library files. Applied only to guru seats.

```markdown
## Grounded Composition Rules

Your answer MUST stay within the retrieved source material. Follow these rules strictly:

1. Start your response by closely paraphrasing the most relevant sentence from the
   retrieved clauses. Use the same terminology and structure as the source.

2. You may add 1-2 sentences of brief practical commentary, but ONLY if it directly
   restates or logically follows from information already present in the source.

3. NEVER do the following (prohibited patterns):
   - Add requirements or obligations not stated in the retrieved source
   - Introduce examples, scenarios, or analogies not present in the source
   - Expand abbreviations or terms beyond what the source defines
   - State "organizations should" or "best practice is" unless the source says so
   - Provide implementation steps not explicitly described in the source material

4. If the retrieved source does not contain enough information to answer the question,
   respond: "The standard does not specify this — the retrieved guidance does not
   address this question directly."

5. Keep responses to 2-4 sentences. Accuracy and grounding outweigh completeness.
```

**N-2 compliance:** The fragment uses prohibited-patterns-by-example (showing the
model what NOT to do) per FIX-T29-3 lesson. The exact wording is subject to a live
A/B iteration — the design budgets one refinement cycle based on measured grounding
scores after initial deployment.

### 4.2 Prompt Integration (Guru Prompts Only)

The fragment is appended to each guru's system prompt. The existing L4 prompt-library
injection (`buildSystemPrompt` in `services/ai-invoker/src/prompt-library.ts`) applies
structural-honesty and licensed-uncertainty to ALL agents. The grounded-composition
fragment is guru-specific and injected at the handler level, NOT via the global
prompt-library (it would harm non-retrieval agents).

```typescript
// services/agents/guru-9001/prompt.ts
import groundedComposition from '../../../prompts/shared/grounded-composition.md';

export const ISO9001_GURU_PROMPT = `You are ISO9001Guru, the ISO 9001:2015 clause expert...

${groundedComposition}`;
```

Same pattern for guru-14001/prompt.ts and guru-45001/prompt.ts.

### 4.2.1 CDK Bundling: `.md` Text Loader for Agent Handlers (D-1')

The guru prompt.ts files now import `.md` files. The guru Lambdas are bundled via
`createAgentHandler` (or equivalent shared factory in ai-stack.ts). That factory's
bundling config currently has NO `.md` loader — esbuild will fail the bundle at synth.

**Fix:** Add `loader: { '.md': 'text' }` to the shared `createAgentHandler` bundling
config. This applies to all agent handler Lambdas (harmless where no `.md` import
exists — esbuild only invokes the loader when it encounters the extension).

```typescript
// infra/lib/ai-stack.ts — createAgentHandler or equivalent shared bundling
bundling: {
  externalModules: [],
  target: 'node22',
  loader: { '.md': 'text' }, // D-1': guru prompts import .md fragment
},
```

**CDK assertion test:** The ai-stack unit test asserts guru Lambda bundling metadata
includes the `.md` text loader (or validates via synth that guru functions resolve
their `.md` imports without error).

### 4.3 Parity Test Pattern

Per spec-35 L4 precedent, a unit test asserts that all three guru prompts include
the grounded-composition fragment (prevents drift where one guru is updated and
others are not):

```typescript
// services/agents/__tests__/guru-prompt-parity.test.ts
import { ISO9001_GURU_PROMPT } from '../guru-9001/prompt.js';
import { ISO14001_GURU_PROMPT } from '../guru-14001/prompt.js';
import { ISO45001_GURU_PROMPT } from '../guru-45001/prompt.js';

describe('guru prompt parity', () => {
  const GROUNDED_COMPOSITION_MARKER = 'Grounded Composition Rules';

  it.each([
    ['9001', ISO9001_GURU_PROMPT],
    ['14001', ISO14001_GURU_PROMPT],
    ['45001', ISO45001_GURU_PROMPT],
  ])('guru-%s includes grounded-composition fragment', (_std, prompt) => {
    expect(prompt).toContain(GROUNDED_COMPOSITION_MARKER);
  });
});
```

---

## 5. Re-Seed Flow (End-to-End)

The re-seed flow is identical to iso-kb-seeding's design §2.3 with two changes:
(1) source is four static imports instead of one, (2) CDK fingerprint covers
`docs/kb/` directory.

```
CDK Deploy (content change in docs/kb/)
  → FileSystem.fingerprint('docs/kb') produces new hash
  → Custom resource SourceHash property changes
  → CloudFormation fires Update on Custom::IsoKbSeed
  → Seeder Lambda invoked:
    1. chunkContentSources(CONTENT_SOURCES) → 109 chunks
    2. computeContentHash(chunks) → new SHA-256
    3. readMetaHash() → old hash (mismatch)
    4. verifyTemplate() → OK (fail-closed)
    5. deleteIndexIfExists() → accepted-degraded window starts
    6. createIndex()
    7. embedAllChunks() → 109 embeddings via one-door (systemOp: true)
    8. bulkIndex() → 109 documents indexed
    9. writeMetaDoc() → new hash persisted
  → Accepted-degraded window ends (~130-140s typical)
  → Custom resource returns SUCCESS
  → Stack update completes
```

**Degradation behavior unchanged:** During the re-seed window, guru retrieval
gets 404 (index_not_found) → fast-fail (non-retryable) → dormant path. This is
proven live behavior from iso-kb-seeding (R-5).

---

## 6. File Change Summary

| File | Change Type | Purpose |
|------|-------------|---------|
| `docs/kb/iso-9001.md` | NEW | 50 expanded clause entries |
| `docs/kb/iso-14001.md` | NEW | 26 expanded clause entries |
| `docs/kb/iso-45001.md` | NEW | 32 expanded clause entries |
| `docs/kb/hls.md` | NEW | 1 HLS cross-reference entry |
| `services/iso-kb-seeder/src/chunker.ts` | REWRITE | New `chunkContentSources()` API; `chunkIsoRequirementsMap` DELETED (D-4') |
| `services/iso-kb-seeder/src/handler.ts` | MODIFY | Four static imports, `CONTENT_SOURCES` array |
| `services/iso-kb-seeder/__tests__/chunker.unit.test.ts` | REWRITE | Tests target new API; old-chunker tests retired (D-4') |
| `services/agents/shared/clause-ref-parser.ts` | NEW | Pure clause-ref parser |
| `services/agents/shared/retrieval.ts` | MODIFY | `HybridRetrievalOptions`, compound filter, zero-result fallback |
| `services/agents/guru-9001/handler.ts` | MODIFY | `parseClauseRef` integration, hybrid param, D-3' standard logic |
| `services/agents/guru-14001/handler.ts` | MODIFY | Same pattern as guru-9001 |
| `services/agents/guru-45001/handler.ts` | MODIFY | Same pattern as guru-9001 |
| `services/agents/guru-9001/prompt.ts` | MODIFY | Import + append grounded-composition fragment |
| `services/agents/guru-14001/prompt.ts` | MODIFY | Same |
| `services/agents/guru-45001/prompt.ts` | MODIFY | Same |
| `prompts/shared/grounded-composition.md` | NEW | Quote-first prompt fragment |
| `infra/lib/ai-stack.ts` | MODIFY | Fingerprint path: `docs/kb`; `.md` text-loader in agent handler bundling (D-1') |
| `services/agents/shared/constants.ts` | MODIFY | `EXPECTED_CHUNK_COUNT` re-pin if needed (expected: stays 109) |

---

## 7. Testing Strategy

### 7.1 Unit Tests

| Test File | Scope | Key Assertions |
|-----------|-------|----------------|
| `services/iso-kb-seeder/__tests__/chunker.unit.test.ts` | Chunker (rewritten, D-4') | Golden count = 109; **golden-SET equality: `Set(clauseRefs)` === pinned 108-ref fixture + 'Annex SL HLS' (D-2': kills silent drops/additions)**; per-standard count pins: ISO9001=50, ISO14001=26, ISO45001=32, HLS=1; every ISO chunk >= 200 chars (N-5: full text incl. prefix); correct prefix format; HLS prefix `[Annex SL HLS]`; determinism (two calls identical); no empty guidance bodies |
| `services/agents/shared/__tests__/clause-ref-parser.unit.test.ts` | Parser | Full ISO ref extracts correctly; "clause 4.1" extracts clauseNum; "section 7.1.5.2" works; bare "4.1" extracts; **false-positive test: "improve by 4.1 percent" → clauseNum='4.1' (known behavior, safe via fallback)** (N-1); **cross-standard test: ISO9001Guru asked "ISO 14001 4.1" → parser returns standard='ISO14001' (D-3')**; multiple refs → first wins; no match → all null |
| `services/agents/shared/__tests__/retrieval-hybrid.unit.test.ts` | Hybrid retrieval | With clauseRef → bool filter includes clauseRef term; with standard → includes standard term; without hybrid → unchanged kNN query; zero-result fallback fires; tenantId always present; **verified-clear pin: query contains NO `min_score` key when scoreThreshold is undefined** |
| `services/agents/__tests__/guru-prompt-parity.test.ts` | Prompt parity | All 3 guru prompts contain grounded-composition marker |
| `services/iso-kb-seeder/__tests__/content-canon.unit.test.ts` | Content-canon gate (CONTENT-3a/3b) | Every chunk's clauseRef exists in parsed `contracts/clause-corpus-map.md`; 108/108 coverage (PRE-VERIFIED by architect) |
| `infra/__tests__/ai-stack.unit.test.ts` (addition) | CDK assertions (D-1') | Guru Lambda bundling metadata includes `loader: { '.md': 'text' }` |

### 7.2 Property-Based Tests

```typescript
// Chunker: all chunks satisfy invariants regardless of internal content variations
fc.assert(fc.property(
  fc.constant(CONTENT_SOURCES),
  (sources) => {
    const chunks = chunkContentSources(sources);
    return chunks.length === EXPECTED_CHUNK_COUNT
      && chunks.every(c => c.metadata.tenantId === '__ISO_CANON__')
      && chunks.every(c => c.metadata.lang === 'en')
      && chunks.filter(c => c.metadata.standard !== 'HLS')
               .every(c => c.text.length >= 200)
      && chunks.every(c => c.text.startsWith('[ISO ') || c.text.startsWith('[Annex SL HLS]'));
  },
));
```

### 7.3 Integration Tests (Dev Account)

| Probe | Verifies | Method |
|-------|----------|--------|
| ACC-1 probe: "What does clause 4.1 require?" | Clause-number grounded >= 0.85 | AppSync `askISO9001` (fixture-token) or direct-invoke (N-4) |
| ACC-2 probe: "How should our organization determine external and internal issues?" | Topic grounded >= 0.85 | Same |
| ACC-3 probe: "clause 4.1" to ISO9001Guru | All returned chunks have standard=ISO9001 | Retrieval log inspection |
| ACC-4 probe: "clause 99.9" | Falls back to kNN, returns closest match | Direct handler invoke |
| ACC-7 probe: re-invoke seeder | Skipped: true (idempotent) | CloudWatch logs |

### 7.4 A/B Iteration Budget (N-2)

The quote-first prompt wording (§4.1) is deployed as v1. If grounding scores for
ACC-1/ACC-2 probes are >= 0.85, the wording is accepted. If scores are in the range
0.70-0.85 (close but not passing), one refinement iteration is budgeted:
- Adjust prohibited-patterns-by-example specificity
- Potentially strengthen the "paraphrase first" instruction
- Re-probe and measure

If scores remain < 0.70 after content expansion + hybrid retrieval, the root cause
is likely content depth (LEG-1) not prompt style — escalate to architect.

---

## 8. SOC 2 Impact

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC8 (Change Management) | Content changes deploy via CDK pipeline only (fingerprint-triggered re-seed on `docs/kb/` directory). No ad-hoc content injection path. | CloudTrail Lambda:Invoke from CloudFormation. |
| PI (Processing Integrity) | Deterministic chunker + content-hash idempotency ensures index state matches committed source. Content-canon unit test (CONTENT-3a) ensures no invalid clauseRefs enter the index. Grounding gate ensures answer quality. | Unit tests + live grounding scores in CloudWatch. |
| C1 (Confidentiality) | Canon content is NOT tenant-confidential. Tenant isolation unchanged. | Existing iso-kb-seeding ACC-2 (wrong-tenant re-proof). |

---

## 9. Audit Events

No new event types registered. This spec does not introduce new domain events.
Observability is via:
- Existing `telemetry.credits.consumed` with `systemOp: true` (seeder embeddings)
- Existing `Ai.GuardrailChecked` (grounding checks on guru responses)
- CloudWatch Logs (seeder + guru handlers)
- CloudTrail (Lambda invocations by CloudFormation)

---

## 10. Cost Estimate

| Resource | Qty | Unit cost | Total (one-time re-seed) |
|----------|-----|-----------|--------------------------|
| Titan Embed v2 input tokens | 109 chunks x ~200 tokens avg | $0.0002/1K tokens | ~$0.004 |
| AOSS indexing | 109 documents | Included in OCU-hours | ~$0 marginal |
| Lambda duration | 1 invocation x 300s max | $0.0000133/GB-s x 0.5GB | ~$0.002 |
| **Total per re-seed** | | | **< $0.01** |

No ongoing per-tenant cost change. Guru handler retrieval query cost unchanged
(same AOSS query, different filter composition — server-side, no additional OCU).

---

## 11. Open Design Questions

None — all requirements-level OQs resolved. Design proceeds to tasks.

---

## References

- `#[[file:.kiro/specs/iso-kb-content-depth/requirements.md]]` — requirements (rev 2)
- `#[[file:.kiro/evidence/iso-kb-content-depth/requirements-review.md]]` — architect review
- `#[[file:services/iso-kb-seeder/src/chunker.ts]]` — current chunker (to be updated)
- `#[[file:services/iso-kb-seeder/src/handler.ts]]` — current handler (to be updated)
- `#[[file:services/agents/shared/retrieval.ts]]` — current retrieval (to be extended)
- `#[[file:services/agents/guru-9001/handler.ts]]` — guru handler pattern
- `#[[file:services/agents/guru-9001/prompt.ts]]` — current guru prompt
- `#[[file:services/agents/shared/constants.ts]]` — EXPECTED_CHUNK_COUNT, ISO_CANON_TENANT_ID
- `#[[file:infra/lib/ai-stack.ts]]` — CDK stack (fingerprint trigger)
- `#[[file:contracts/clause-corpus-map.md]]` — clause-canon (152 tuples)
- `#[[file:.kiro/specs/iso-kb-seeding/design.md]]` — seeder design (conventions, D-1..D-5)
- `#[[file:.kiro/specs/guardrails-antihallucination/design.md]]` — L4 prompt library, L1 grounding
