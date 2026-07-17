# Design — ISO KB Seeding

> **Spec:** iso-kb-seeding
> **Requirements:** `#[[file:.kiro/specs/iso-kb-seeding/requirements.md]]` (rev 2, approved)
> **Status:** APPROVED (rev 2 — D-1..D-5 corrections folded)
> **Review:** `.kiro/evidence/iso-kb-seeding/design-review.md`

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CDK Deploy (AiStack)                                                    │
│  ┌──────────────────────┐                                                │
│  │ cr.AwsCustomResource │── physicalResourceId includes source hash ──┐  │
│  │ (provider timeout    │                                             │  │
│  │  >= 300s — R-3)      │                                             │  │
│  └──────────────────────┘                                             │  │
│            │ invoke (RequestResponse)                                  │  │
│            ▼                                                          │  │
│  ┌──────────────────────────────────────────────────────────────────┐ │  │
│  │  ISO KB Seeder Lambda (VPC-placed, 512MB, 300s timeout)          │ │  │
│  │                                                                  │ │  │
│  │  1. Chunk: iso-requirements-map.md → Chunk[]                     │ │  │
│  │  2. Hash: SHA-256 over serialized chunks                         │ │  │
│  │  3. Check: read _meta doc from AOSS → compare hash              │ │  │
│  │     ├─ match → SKIP (no-op, log skipped:true)                   │ │  │
│  │     └─ mismatch/absent →                                        │ │  │
│  │        4. Verify: verifyTemplate() — fail-closed                 │ │  │
│  │        5. Delete: existing index (accepted-degraded window — R-5)│ │  │
│  │        6. Create: new index                                      │ │  │
│  │        7. Embed: for each chunk → one-door {op:'embed',          │ │  │
│  │                  systemOp:true} via createEmbedFn()               │ │  │
│  │        8. Index: bulk-index docs to AOSS (SigV4)                 │ │  │
│  │        9. Write: _meta doc with contentHash                      │ │  │
│  └──────────────────────────────────────────────────────────────────┘ │  │
│            │                          │                               │  │
│            │ Lambda invoke            │ SigV4 AOSS (via VPCE)         │  │
│            ▼                          ▼                               │  │
│  ┌─────────────────┐      ┌──────────────────────────┐               │  │
│  │  AI Invoker     │      │  cumplify-iso-kb (AOSS)  │               │  │
│  │  (one-door)     │      │  - index: cumplify-iso-kb│               │  │
│  │  op:'embed'     │      │  - 1024-dim knn_vector   │               │  │
│  │  systemOp:true  │      │  - metadata: tenantId,   │               │  │
│  │  → Titan Embed  │      │    standard, clauseRef,  │               │  │
│  │    v2 1024-dim  │      │    lang                  │               │  │
│  └─────────────────┘      └──────────────────────────┘               │  │
└──────────────────────────────────────────────────────────────────────────┘

Post-seed (runtime):
┌────────────────────────┐        ┌──────────────────────────┐
│ Guru Handler (AppSync) │        │  cumplify-iso-kb (AOSS)  │
│ tenantId for retrieval │──kNN──▶│  filter: metadata.       │
│ = ISO_CANON_TENANT_ID  │        │  tenantId='__ISO_CANON__'│
│ = '__ISO_CANON__'      │◀─chunks│                          │
└────────────────────────┘        └──────────────────────────┘
```

---

## 2. Component Design

### 2.1 Chunker (`services/iso-kb-seeder/src/chunker.ts`)

Pure function, no I/O. Unit-testable in isolation.

**Algorithm:**

```
INPUT: raw markdown string (iso-requirements-map.md, 422 lines)
OUTPUT: Chunk[] where each Chunk = { text, metadata: { tenantId, standard, clauseRef, lang } }

1. Split into three standard sections by detecting:
   - "# Section A — ISO 9001:2015" → standard = 'ISO9001', stdNum = '9001'
   - "# Section B — ISO 14001:2015" → standard = 'ISO14001', stdNum = '14001'
   - "# Section C — ISO 45001:2018" → standard = 'ISO45001', stdNum = '45001'
   - "# Shared vs Standard-Specific Clauses" → standard = 'HLS'

2. Within each standard section, identify sub-clause entries by pattern:
   - Bold heading: **<clauseNum> <title>** at line start or after "- "
   - Followed by (b) and (c) content lines

3. For each sub-clause entry:
   - Extract clauseNum (e.g., "4.1", "8.3.4", "7.1.5.2")
   - Extract title
   - Collect all (b) requirement text and (c) SaaS-must-provide text
   - Compose chunk text:
     "[ISO <stdNum> <clauseNum>] <title> — (b) <requirement> (c) <provision>"
   - Set metadata:
     { tenantId: '__ISO_CANON__', standard, clauseRef: 'ISO <stdNum> <clauseNum>', lang: 'en' }

4. Parent headers without (b)/(c) content → NO chunk emitted.

5. HLS section → single chunk:
   - text: "[Annex SL HLS] <full HLS section text>"
   - metadata: { tenantId: '__ISO_CANON__', standard: 'HLS', clauseRef: 'Annex SL HLS', lang: 'en' }
   - NOTE: prefix is "[Annex SL HLS]" (R-4 — outside [ISO …] citation pattern)
```

**Type definitions:**

```typescript
export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  tenantId: string;     // always '__ISO_CANON__'
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001' | 'HLS';
  clauseRef: string;    // e.g., 'ISO 9001 4.1' or 'Annex SL HLS'
  lang: string;         // 'en' for this spec
}

export const ISO_CANON_TENANT_ID = '__ISO_CANON__';

/**
 * D-5: Golden chunk count — pinned so source drift is caught in the unit
 * lane, not discovered at deploy. Updated only when iso-requirements-map.md
 * legitimately gains/loses sub-clauses.
 */
export const EXPECTED_CHUNK_COUNT = 79; // pinned by unit test
```

### 2.2 Source Inlining (D-1 — MANDATORY, incident-class prevention)

The source markdown (`docs/architecture/iso-requirements-map.md`) is loaded at
**BUILD TIME** via esbuild's text loader — NOT via runtime `fs.readFileSync`.

**Why:** A `readFileSync(resolve(__dirname, '…'))` path works in unit tests
(repo cwd) but the repo-relative path does NOT exist in `/var/task` at deploy.
This is the exact shape of the prompt-library incident. Build-time inlining
guarantees the content is embedded in the Lambda bundle and zero runtime fs
access is needed.

**CDK bundling config:**

```typescript
bundling: {
  externalModules: [],
  target: 'node22',
  loader: { '.md': 'text' }, // D-1: esbuild text loader for .md files
},
```

**Handler import:**

```typescript
// Build-time inline — esbuild text loader resolves at bundle, NOT runtime fs
import source from '../../../docs/architecture/iso-requirements-map.md';
```

The `source` variable is a plain string containing the full markdown content.
The chunker receives it as an argument — remains a pure function.

### 2.3 Seeder Lambda (`services/iso-kb-seeder/src/handler.ts`)

**Entry point:** CDK custom resource invocation (event: `{ action: 'seed', sourceHash: string }`).

**Flow (pseudocode):**

```typescript
// D-1: source inlined at build time — no runtime fs read
import source from '../../../docs/architecture/iso-requirements-map.md';

export async function handler(event: { action: string; sourceHash: string }) {
  const start = Date.now();

  // 1. Chunk (pure function, build-time-inlined source)
  const chunks = chunkIsoRequirementsMap(source);
  logger.info('Chunked', { chunksTotal: chunks.length });

  // 2. Compute content hash
  const contentHash = computeContentHash(chunks);

  // 3. Check existing hash (read _meta doc from AOSS — D-2: tenantId='__META__')
  const existingHash = await readMetaHash();
  if (existingHash === contentHash) {
    logger.info('Content unchanged — skipping', { contentHash, skipped: true });
    return { status: 'skipped', contentHash, chunksTotal: chunks.length };
  }

  // 4. Verify template (fail-closed)
  await verifyTemplate('cumplify-iso-kb', AOSS_ENDPOINT);

  // 5. Delete existing index (accepted-degraded window starts — R-5)
  await deleteIndexIfExists();

  // 6. Create index
  await createIndex();

  // 7. Embed all chunks via one-door (systemOp: true)
  const embeddings = await embedAllChunks(chunks);

  // 8. Bulk-index to AOSS
  await bulkIndex(chunks, embeddings);

  // 9. Write _meta doc (contentHash, D-2: tenantId='__META__', no embedding)
  await writeMetaDoc(contentHash, chunks.length);
  // Accepted-degraded window ends

  logger.info('Seeding complete', {
    chunksTotal: chunks.length,
    chunksIndexed: chunks.length,
    contentHash,
    skipped: false,
    durationMs: Date.now() - start,
  });

  return { status: 'seeded', contentHash, chunksTotal: chunks.length, chunksIndexed: chunks.length };
}
```

### 2.3.1 `_meta` Document Isolation (D-2)

The `_meta` document stores the content hash for idempotent re-seed detection.
It MUST NOT be retrievable as a grounding chunk:

- `metadata.tenantId = '__META__'` (NOT `__ISO_CANON__`) — kNN queries with
  `filter: { term: { 'metadata.tenantId': '__ISO_CANON__' } }` will never match it.
- **No `embedding` field** — even if the tenant filter were absent, kNN search
  cannot match a document without a vector.

**Document shape:**

```json
{
  "text": "",
  "metadata": {
    "tenantId": "__META__",
    "standard": "SYSTEM",
    "clauseRef": "_meta",
    "lang": "en"
  },
  "contentHash": "<sha256>",
  "chunksTotal": 79,
  "seededAt": "2026-07-17T…Z"
}
```

**Unit test assertion:** _meta doc tenantId is always `'__META__'` and doc has
no `embedding` field.

### 2.4 One-Door Embed Integration

**Type change to `EmbedRequest`** (additive, non-breaking):

```typescript
export interface EmbedRequest {
  tenantId: string;
  agent: string;
  module: string;
  feature: string;
  text: string;
  /** System operation — bypasses credit pre-check (SERVE-9 exempt), meters as COGS */
  systemOp?: boolean;
}
```

**Change to `embed.ts`** (line ~45):

```typescript
// Before: await checkCreditBalance(tenantId, false);
// After:
await checkCreditBalance(tenantId, request.systemOp ?? false);
```

**Change to `emitCreditsTelemetry` call in `embed.ts`:**

```typescript
await emitCreditsTelemetry({
  tenantId,
  agent,
  module,
  feature,
  inputTokens: result.inputTextTokenCount,
  outputTokens: 0,
  cacheReadTokens: 0,
  creditsConsumed: credits,
  modelId: MODEL_ID,
  seat: 'embed',
  systemOp: request.systemOp ?? false, // NEW — billing consumer excludes
});
```

**Change to `emitCreditsTelemetry` signature** (additive):

```typescript
export async function emitCreditsTelemetry(opts: {
  // ... existing fields ...
  /** System op marker — billing consumer excludes from tenant invoicing */
  systemOp?: boolean;
}): Promise<void> {
  // ... Detail JSON gains: systemOp: opts.systemOp ?? false
}
```

### 2.5 Index Template Update (`services/agents/shared/aoss-index-template.json`)

Add `lang` field to `metadata.properties`:

```json
{
  "metadata": {
    "properties": {
      "tenantId": { "type": "keyword" },
      "standard": { "type": "keyword" },
      "clauseRef": { "type": "keyword" },
      "lang": { "type": "keyword" }
    }
  }
}
```

**`verifyTemplate()` update** — add lang check:

```typescript
const langType = props?.metadata?.properties?.lang?.type;
if (langType !== 'keyword') {
  throw new Error(`FAIL-CLOSED ${name}: metadata.lang.type=${langType}, expected keyword`);
}
```

### 2.6 Guru Handler Change (`services/agents/guru-*/handler.ts`)

Replace the tenantId used for iso-kb retrieval with the canon constant:

```typescript
import { ISO_CANON_TENANT_ID } from '../shared/constants.js';

// In handleQuery():
const results = await retrieve({
  tenantId: ISO_CANON_TENANT_ID, // was: tenantId (user's)
  collectionEndpoint: AOSS_ISO_KB_ENDPOINT,
  indexName: 'cumplify-iso-kb',
  queryText: truncatedQuery,
  queryVector: embedding,
  topK: 5,
});
```

The user's `tenantId` continues to flow to:
- The invoke call (metering attribution to the real tenant)
- Any future tenant-docs-kb retrieval leg
- The grounding/AR guardrail events

### 2.7 Shared Constants (`services/agents/shared/constants.ts`)

```typescript
/**
 * Canon tenant ID for the ISO standards knowledge base.
 * Used as the metadata.tenantId filter value for guru retrieval against
 * the ISO-KB collection. NOT a real tenant — platform-owned content.
 */
export const ISO_CANON_TENANT_ID = '__ISO_CANON__';
```

---

## 3. CDK Integration (AiStack)

### 3.1 Seeder Lambda Resource

```typescript
const isoKbSeederFn = new NodejsFunction(this, 'IsoKbSeederFn', {
  entry: 'services/iso-kb-seeder/src/handler.ts',
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_22_X,
  architecture: lambda.Architecture.ARM_64,
  memorySize: 512,
  timeout: cdk.Duration.seconds(300), // SEED-1f: >= 300s
  bundling: {
    externalModules: [],
    target: 'node22',
    loader: { '.md': 'text' }, // D-1: esbuild text loader — build-time inline
  },
  vpc: props.vpc,
  vpcSubnets: { subnets: props.privateSubnets }, // SEED-1a: VPC-placed
  environment: {
    AOSS_ENDPOINT: collectionEndpoints['cumplify-iso-kb'],
    AOSS_INDEX_NAME: 'cumplify-iso-kb',
    AI_INVOKER_ARN: aiInvoker.functionArn,
    POWERTOOLS_SERVICE_NAME: 'iso-kb-seeder',
  },
});
```

### 3.2 IAM Policies

```typescript
// One-door: invoke AI Invoker for embeddings
aiInvoker.grantInvoke(isoKbSeederFn);

// AOSS: write access on iso-kb collection (ACCESS-1a)
isoKbSeederFn.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['aoss:APIAccessAll'],
    resources: [props.isoKbCollectionArn],
  }),
);
```

### 3.3 AOSS Data-Access Policy Amendment (ACCESS-1b)

The existing data-access policy for `cumplify-iso-kb` (in DataStack) must be
amended to include the seeder Lambda's role ARN as a principal with write
permissions. Implementation: the AiStack adds a separate `CfnAccessPolicy`
that grants the seeder role full index CRUD on `index/cumplify-iso-kb/*`.
AOSS data-access policies are additive unions — the new policy's permissions
combine with the existing placeholder policy; no priority ordering exists.

```typescript
new opensearchserverless.CfnAccessPolicy(this, 'IsoKbSeederAccessPolicy', {
  name: 'cumplify-iso-kb-seeder',
  type: 'data',
  policy: JSON.stringify([{
    Rules: [
      {
        ResourceType: 'collection',
        Resource: ['collection/cumplify-iso-kb'],
        Permission: ['aoss:CreateCollectionItems', 'aoss:UpdateCollectionItems',
                     'aoss:DescribeCollectionItems'],
      },
      {
        ResourceType: 'index',
        Resource: ['index/cumplify-iso-kb/*'],
        Permission: ['aoss:CreateIndex', 'aoss:DeleteIndex', 'aoss:UpdateIndex',
                     'aoss:DescribeIndex', 'aoss:ReadDocument', 'aoss:WriteDocument'],
      },
    ],
    Principal: [isoKbSeederFn.role!.roleArn],
  }]),
});
```

### 3.4 Custom Resource Trigger (DEPLOY-1a/b/c, R-3)

```typescript
const sourceFileHash = cdk.FileSystem.fingerprint(
  'docs/architecture/iso-requirements-map.md',
);

new cr.AwsCustomResource(this, 'IsoKbSeederTrigger', {
  onCreate: {
    service: 'Lambda',
    action: 'invoke',
    parameters: {
      FunctionName: isoKbSeederFn.functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ action: 'seed', sourceHash: sourceFileHash }),
    },
    physicalResourceId: cr.PhysicalResourceId.of(`iso-kb-seeder-${sourceFileHash}`),
  },
  onUpdate: {
    service: 'Lambda',
    action: 'invoke',
    parameters: {
      FunctionName: isoKbSeederFn.functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ action: 'seed', sourceHash: sourceFileHash }),
    },
    physicalResourceId: cr.PhysicalResourceId.of(`iso-kb-seeder-${sourceFileHash}`),
  },
  policy: cr.AwsCustomResourcePolicy.fromStatements([
    new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [isoKbSeederFn.functionArn],
    }),
  ]),
  // R-3 (CRITICAL): provider timeout MUST be >= seeder Lambda timeout.
  // cr.AwsCustomResource uses a singleton provider Lambda; its timeout is
  // controlled by the `timeout` prop. If unset, CDK defaults to 2 min
  // which is LESS than the seeder's 300s — CFN would report timeout while
  // the seeder is still running. Set explicitly.
  timeout: cdk.Duration.minutes(10), // 600s > 300s seeder timeout
});
```

**R-3 compliance note:** `cr.AwsCustomResource`'s `timeout` prop sets the
provider Lambda's timeout. We set it to 10 minutes (600s) which exceeds the
seeder Lambda's 300s. The provider invokes the seeder via RequestResponse
(synchronous), so provider timeout > seeder timeout guarantees the provider
never aborts while seeding is in progress.

---

## 4. Degradation & Recovery (R-5)

### 4.1 Accepted-Degraded Window

During a re-seed (SEED-2c: delete → create → bulk-index), the `cumplify-iso-kb`
index is transiently absent. In this window:

1. Guru handler calls `retrieve()` → AOSS returns `index_not_found_exception` (404).
2. `retrieve()` treats 404 as **non-retryable** (see `isAossRetryable` in
   retrieval.ts: only 5xx/503/429/timeout/connection errors retry). The call
   fails fast on the first attempt — no 45s retry burn.
3. The guru handler's `catch` block catches the error → `groundingSource = ''`.
4. The invokeFn call proceeds WITHOUT `groundingContext` → **dormant path**.
5. The user gets an answer without grounding (same behavior as today, pre-seeding).

**This is the proven live behavior** (fix-t20-3 evidence: "retrieval log now shows
an APPLICATION-level response from the AOSS data plane: 404 index_not_found_exception"
— attempts: 1, fast-fail).

**Note on the seeder's own AOSS operations:** The seeder's `withRetry` wrapper
(§5) DOES retry 404 — this covers index activation delays where a newly-created
index is not yet addressable. This distinction is correct: the guru retrieval
path fails fast on 404 (user-facing latency), while the seeder retries 404
(deploy-time, no user waiting).

### 4.2 Window Duration Estimate

- Delete index: ~1s
- Create index: ~2–5s
- Embed 79 chunks: ~79 × 1.5s (Lambda invoke round-trip) ≈ 120s
- Bulk-index 79 docs: ~10s (batched)
- Total: ~130–140s typical, plus AOSS cold-start overhead

The window is bounded by the Lambda timeout (300s max).

### 4.3 Mitigation

- This only occurs on content changes (the iso-requirements-map is expected to
  change rarely — quarterly at most for standards-update cycle).
- Guru agents degrade gracefully (live-proven dormant path).
- Zero-downtime swap (blue-green index) is the Part 32.2 standards-update carry.

---

## 5. AOSS Retry Strategy (02-aoss-rule compliance)

All AOSS operations **in the seeder** use the same retry pattern. Note: this
differs from the guru retrieval path (`retrieve()`) which treats 404 as
non-retryable (D-3). The seeder retries 404 because newly-created indexes
may not be immediately addressable (activation delay).

| Parameter | Value |
|-----------|-------|
| Base delay | 500ms |
| Backoff factor | 2 |
| Jitter | 20% of computed delay |
| Ceiling | 45,000ms |
| Max attempts | 12 |
| Retryable codes | 403 (policy propagation), 404 (index activation), 429, 5xx |

Implementation reuses `signedAossFetch` from `services/agents/shared/aoss-signed-client.ts`
with a `withRetry` wrapper following the same pattern as `aoss-apply-template.ts`.

---

## 6. File Layout

```
services/iso-kb-seeder/
├── src/
│   ├── handler.ts          # Lambda entry point (CDK custom resource event)
│   ├── chunker.ts          # Pure chunker function
│   ├── content-hash.ts     # SHA-256 over serialized chunks
│   ├── meta-doc.ts         # Read/write _meta document in AOSS
│   └── bulk-index.ts       # Embed + bulk-index orchestration
├── __tests__/
│   ├── chunker.unit.test.ts       # Deterministic output, correct prefixes, metadata
│   ├── handler.unit.test.ts       # Idempotent skip, full-seed, fail-closed
│   └── content-hash.unit.test.ts  # Hash determinism
└── package.json (workspace package)
```

Shared code imported from:
- `services/agents/shared/aoss-signed-client.ts` — SigV4 HTTP
- `services/agents/shared/aoss-apply-template.ts` — `verifyTemplate()`
- `services/agents/shared/invoke-transport.ts` — `createEmbedFn()`
- `services/agents/shared/constants.ts` — `ISO_CANON_TENANT_ID` (new file)

---

## 7. SOC 2 Impact

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC6 (Logical Access) | Seeder role is IAM-scoped to `cumplify-iso-kb` only; no cross-collection write. | IAM policy + data-access policy restrict to `index/cumplify-iso-kb/*`. |
| CC8 (Change Management) | Seeding triggered only via CDK pipeline deploy (custom resource). No ad-hoc invocation path. | CloudTrail Lambda:Invoke from CloudFormation service principal. |
| PI (Processing Integrity) | Content-hash idempotency ensures index state matches committed source. | `_meta` doc hash + CDK fingerprint physicalResourceId. |
| C1 (Confidentiality) | Canon content is NOT tenant-confidential (in-house paraphrase). Tenant isolation is unaffected: real tenants cannot read canon content because their tenantId ≠ `__ISO_CANON__`. | ACC-2 isolation re-proof. |

---

## 8. Audit Events

No new event types registered. The seeder does not emit domain events to
`cumplify-events` — it is an infrastructure-level operation (same as weight-seeder
and apply-template). Observability is via:

- CloudWatch Logs (Powertools structured logs from the seeder Lambda)
- `telemetry.credits.consumed` events with `systemOp: true` (existing event type,
  new marker field — no new registration needed per contracts/events.md rules)
- CloudTrail: Lambda invocations by CloudFormation

---

## 9. Testing Strategy

| Layer | Scope | Runner |
|-------|-------|--------|
| Unit | Chunker: golden count (EXPECTED_CHUNK_COUNT = 79, D-5), correct prefixes, metadata alignment, HLS prefix outside citation pattern, determinism, no chunk for parent-only headers | Vitest |
| Unit | Content hash: deterministic, changes on input change | Vitest |
| Unit | Handler: mock embed + AOSS → verify skip-on-match, full-seed-on-mismatch, abort-on-template-fail | Vitest |
| Unit | _meta doc: tenantId='__META__' (never '__ISO_CANON__'), no embedding field (D-2) | Vitest |
| Property | Chunker: `fc.assert(fc.property(fc.constant(SOURCE), (s) => chunkIsoRequirementsMap(s).length === EXPECTED_CHUNK_COUNT))` + every chunk has valid metadata + no chunk text starts with `[ISO HLS` | fast-check |
| Integration | Deploy to dev → ACC-1 through ACC-6 verified via Lambda invoke + DDB scan + retrieval probe | Dev account |

---

## 10. Cost Estimate

| Resource | Qty | Unit cost | Total (one-time seed) |
|----------|-----|-----------|----------------------|
| Titan Embed v2 input tokens | ~79 chunks × ~200 tokens avg | $0.0002/1K tokens | ~$0.003 |
| AOSS indexing | 79 documents | Included in OCU-hours | ~$0 marginal |
| Lambda duration | 1 invocation × 300s max | $0.0000133/GB-s × 0.5GB | ~$0.002 |
| **Total per seed** | | | **< $0.01** |

Re-seed cost is identical. Idempotent no-op = Lambda invocation only (~$0.0000002).
No ongoing per-tenant cost. Platform COGS: negligible.

---

## Open Design Questions

None — all requirements-level OQs resolved. Design proceeds to tasks.

---

## References

- `#[[file:.kiro/specs/iso-kb-seeding/requirements.md]]` — requirements (rev 2)
- `#[[file:services/agents/shared/aoss-index-template.json]]` — index mapping (to be updated)
- `#[[file:services/agents/shared/aoss-apply-template.ts]]` — verifyTemplate()
- `#[[file:services/agents/shared/aoss-signed-client.ts]]` — SigV4 HTTP client
- `#[[file:services/agents/shared/invoke-transport.ts]]` — createEmbedFn()
- `#[[file:services/ai-invoker/src/embed.ts]]` — embed implementation (systemOp change)
- `#[[file:services/ai-invoker/src/types.ts]]` — EmbedRequest type (systemOp field)
- `#[[file:services/ai-invoker/src/metering.ts]]` — emitCreditsTelemetry (systemOp marker)
- `#[[file:services/ai-invoker/src/credit-precheck.ts]]` — SERVE-9 exempt flag
- `#[[file:services/agents/guru-9001/handler.ts]]` — guru handler (canon tenantId change)
- `#[[file:infra/lib/ai-stack.ts]]` — CDK stack (seeder Lambda + custom resource)
- `#[[file:docs/architecture/iso-requirements-map.md]]` — source content
- `.kiro/evidence/iso-kb-seeding/requirements-review.md` — architect review
