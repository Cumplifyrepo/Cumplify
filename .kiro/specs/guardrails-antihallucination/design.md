# Guardrails Anti-Hallucination — Design

**Spec:** `guardrails-antihallucination` (spec 35)
**Phase:** P1
**Revision:** D3 (2026-07-16)
**Requirements:** R2 (approved 2026-07-10)
**Base commit:** 44eea09 (develop)

---

## 0. Design-Time Verification Results

### 0.1 Live Probe Results (architect, 2026-07-16)

| Probe | Result | Design Impact |
|-------|--------|---------------|
| OQ-1a: AR availability in us-east-1 (697114252993) | **AVAILABLE** — `list-automated-reasoning-policies` succeeds, zero policies exist | L2 IS IN SCOPE |
| OQ-1b: `InvokeGuardrailChecks` existence | **DOES NOT EXIST** — bedrock-runtime's only guardrail action is `apply-guardrail` | L3 uses `ApplyGuardrail` on hop payloads (L3-4 fallback) |
| OQ-3: Per-call threshold override | **NOT SUPPORTED** — thresholds baked into guardrail config at creation time | CDK-4: TWO grounding guardrails (advisory 0.85 + record-write 0.90) |
| Titan Embed v2 model access | **LIVE-ACCESSIBLE** — architect micro-invoke 2026-07-16 returned 1024 dims + `inputTextTokenCount: 2` | Task 4 scope = IAM-sufficiency sign-off only |
| AR policies per guardrail limit | **maxItems: 2** — `AutomatedReasoningPolicyConfig.Policies` (CFN registry, describe-type) | TWO AR guardrails required (clause vs advisory) |
| AR-only guardrail validity | **VALID** — only Name + both blocked-messagings required | ArClause/ArAdvisory guardrails carry no content/PII/grounding |
| ApplyGuardrail AR response shape | `automatedReasoningPolicy: GuardrailAutomatedReasoningPolicyAssessment` (SDK) | Task 27's {invalidClaim, reason, suggestedCorrection} derivable from findings |

### 0.2 CFN/CDK Verification (aws-docs MCP + describe-type, 2026-07-16)

| Feature | CFN Support | Shape |
|---------|-------------|-------|
| `ContextualGroundingPolicyConfig` | **YES** | `FiltersConfig: [{Type: GROUNDING, Threshold: N}, {Type: RELEVANCE, Threshold: N}]` |
| `AutomatedReasoningPolicyConfig` | **YES** | `Policies: [arn]` (minItems:1, **maxItems:2**, required) + optional `ConfidenceThreshold` |
| `AWS::Bedrock::AutomatedReasoningPolicy` | **YES** — standalone resource | Deploys pre-authored `PolicyDefinition` (Variables + Rules). Does NOT run build workflow. |
| `CrossRegionConfig` for AR | **REQUIRED** when AR attached | `guardrailProfileArn: arn:aws:bedrock:us-east-1:<account>:guardrail-profile/us.guardrail.v1:0` |
| CDK L1 typed props | **CONFIRMED** — aws-cdk-lib 2.261.0 | All props typed; property is `guardrailProfileArn` (NOT `guardrailProfileIdentifier`) |
| IAM for AR | `bedrock:InvokeAutomatedReasoningPolicy` | Resource: policy ARN (versioned) |

### 0.3 Converse API Grounding Mechanics (aws-docs MCP)

Grounding checks evaluate **OUTPUT only**. The invoker passes context via `guardContent` blocks with qualifiers:
- `["grounding_source"]` — retrieval chunks (excluded from other policies); **max 100,000 chars**
- `["query"]` — user question (excluded from other policies); **max 1,000 chars**
- Response content to guard: **max 5,000 chars** (section-wise splitting for longer responses)

**Skip-when-absent behavior:** When no `grounding_source` block is present in the input,
contextual grounding checks are skipped (grounding requires all three components: source,
query, and response). Pinned empirically in Task 7 readback.

---

## 1. Guardrail Topology

### 1.1 Five-Guardrail Architecture (H-1 D3: AR maxItems=2 constraint)

| Guardrail | Construct ID | Grounding | Relevance | AR Policies | Content/PII | CrossRegionConfig | Routing |
|-----------|-------------|-----------|-----------|-------------|-------------|-------------------|---------|
| Agent (advisory) | `AgentGuardrail` (existing) | 0.85 | 0.75 | NONE | PROMPT_ATTACK HIGH + 5 PII | NO | All seats EXCEPT doc-composer and record-write |
| Record-write | `RecordWriteGuardrail` (NEW) | 0.90 | 0.75 | NONE | PROMPT_ATTACK HIGH + 5 PII | NO | `feature === 'record-write'` |
| AR-clause | `ArClauseGuardrail` (NEW) | NONE | NONE | clause-canon (1 policy) | NONE | YES | Post-response AR on clause-citing paths |
| AR-advisory | `ArAdvisoryGuardrail` (NEW) | NONE | NONE | role-permissions + plan-entitlements (2 policies) | NONE | YES | Post-response AR on role/plan advisory paths |
| Doc-gen | `DocGenGuardrail` (existing) | NONE | NONE | NONE | PROMPT_ATTACK HIGH + SSN/card BLOCK | NO | `seat === 'doc-composer'` |

**Rationale (D3 H-1):** `AutomatedReasoningPolicyConfig.Policies` has `maxItems: 2` in
the CFN registry — three policies on one guardrail is undeployable. Splitting AR by
evaluation path gives stronger L2-7 conformance (only relevant policies evaluate per
check) and is cheaper (single-policy guardrail evaluations).

**Data-residency note:** Both AR guardrails route through guardrail profile
`us.guardrail.v1:0` (US-regions cross-region inference: us-east-1, us-east-2, us-west-2).
All data stays within the US geographic boundary. Surfaced for owner visibility.

**Scope boundary:** DocGenGuardrail gets NO grounding/AR. Document composition grounding
is owned by spec-40's deterministic checker + assertion ledger.

### 1.2 Routing Logic

```typescript
// services/ai-invoker/src/guardrail.ts
export function buildGuardrailConfig(seat: SeatId, feature?: string): GuardrailConfig | undefined {
  if (seat === 'doc-composer') return envGuardrail('DOCGEN_GUARDRAIL');
  if (feature === 'record-write') return envGuardrail('RECORDWRITE_GUARDRAIL');
  return envGuardrail('GUARDRAIL');
}

// AR guardrails (invoked post-response by ar-check.ts only)
export function buildArClauseGuardrailConfig(): GuardrailConfig | undefined {
  return envGuardrail('ARCLAUSE_GUARDRAIL');
}
export function buildArAdvisoryGuardrailConfig(): GuardrailConfig | undefined {
  return envGuardrail('ARADVISORY_GUARDRAIL');
}
```

### 1.3 CDK Configuration (ai-stack.ts)

```typescript
// EXPAND existing AgentGuardrail: add contextual grounding (NO CrossRegionConfig, NO AR)
contextualGroundingPolicyConfig: {
  filtersConfig: [
    { type: 'GROUNDING', threshold: 0.85 },
    { type: 'RELEVANCE', threshold: 0.75 },
  ],
},

// NEW: Record-write guardrail (grounding 0.90, NO CrossRegionConfig, NO AR)
const recordWriteGuardrail = new bedrock.CfnGuardrail(this, 'RecordWriteGuardrail', {
  name: `cumplify-recordwrite-guardrail-${envConfig.envName}`,
  blockedInputMessaging: 'Request blocked by content policy.',
  blockedOutputsMessaging: 'Response blocked by content policy.',
  contentPolicyConfig: { filtersConfig: [
    { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
  ]},
  sensitiveInformationPolicyConfig: { piiEntitiesConfig: [
    { type: 'EMAIL', action: 'ANONYMIZE' },
    { type: 'PHONE', action: 'ANONYMIZE' },
    { type: 'NAME', action: 'ANONYMIZE' },
    { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
    { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
  ]},
  contextualGroundingPolicyConfig: { filtersConfig: [
    { type: 'GROUNDING', threshold: 0.90 },
    { type: 'RELEVANCE', threshold: 0.75 },
  ]},
});

// NEW: AR-clause guardrail (clause-canon only; created in Task 25 wave)
const arClauseGuardrail = new bedrock.CfnGuardrail(this, 'ArClauseGuardrail', {
  name: `cumplify-arclause-guardrail-${envConfig.envName}`,
  blockedInputMessaging: 'Response contains invalid clause citation.',
  blockedOutputsMessaging: 'Response contains invalid clause citation.',
  crossRegionConfig: {
    guardrailProfileArn:
      `arn:aws:bedrock:us-east-1:${this.account}:guardrail-profile/us.guardrail.v1:0`,
  },
  automatedReasoningPolicyConfig: {
    policies: [clauseCanonPolicy.attrPolicyArn],
    confidenceThreshold: 0.9,
  },
});

// NEW: AR-advisory guardrail (role-permissions + plan-entitlements; created in Task 25 wave)
const arAdvisoryGuardrail = new bedrock.CfnGuardrail(this, 'ArAdvisoryGuardrail', {
  name: `cumplify-aradvisory-guardrail-${envConfig.envName}`,
  blockedInputMessaging: 'Response contains invalid advisory claim.',
  blockedOutputsMessaging: 'Response contains invalid advisory claim.',
  crossRegionConfig: {
    guardrailProfileArn:
      `arn:aws:bedrock:us-east-1:${this.account}:guardrail-profile/us.guardrail.v1:0`,
  },
  automatedReasoningPolicyConfig: {
    policies: [rolePermissionsPolicy.attrPolicyArn, planEntitlementsPolicy.attrPolicyArn],
    confidenceThreshold: 0.9,
  },
});
```

---

## 2. Embedding Door (EMB-1..6)

### 2.1 Architecture & Transport (H-2 D3)

The `embed()` function lives at `services/ai-invoker/src/embed.ts` and executes
**inside the invoker Lambda**. Agent handlers (separate Lambdas) reach it exclusively
via the one-door Lambda transport — they NEVER import embed.ts directly.

**EMB-2 restated:** "invoker-internal" means the code executes inside the invoker Lambda
process. Handlers access it only through the transport embed operation (`createEmbedFn()`
in `invoke-transport.ts`). This preserves C-1 (one-door), handler IAM minimality
(no bedrock:InvokeModel, no metering-DDB perms), and the import ban.

```
┌────────────────────────────────────────────────────────────────────┐
│  Agent Handler Lambda (guru/copilot)                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ const embedFn = createEmbedFn(); // invoke-transport.ts      │  │
│  │ const {embedding} = await embedFn({text: question, ...});    │  │
│  │ const chunks = await retrieve({vector: embedding, ...});     │  │
│  │ const response = await invokeFn({                            │  │
│  │   ..., groundingContext: {source: chunks, query: question}   │  │
│  │ });                                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
         │ Lambda Invoke (AI_INVOKER_ARN)
         ▼
┌────────────────────────────────────────────────────────────────────┐
│  AI Invoker Lambda — entry dispatch (services/ai-invoker/src/)     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ if (event.op === 'embed') → embed.ts handler                 │  │
│  │ else (absent op or op === 'invoke') → existing invoke path   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  embed.ts:                                                         │
│    1. bedrock:InvokeModel → amazon.titan-embed-text-v2:0           │
│    2. Read inputTextTokenCount, compute credits, meter, emit       │
│    3. Return {embedding: number[], tokenCount, credits}            │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 Invoker Entry Dispatch (F-1: Lambda binding)

The invoker Lambda entry point is `handler` (not `invoke`). `ai-stack.ts` binds
`handler: 'handler'`. The existing `invoke()` function STAYS exported (tests + type
consumers use it directly), but the Lambda runtime calls `handler()`.

```typescript
// services/ai-invoker/src/index.ts
// Lambda entry — dispatches on op discriminator
export async function handler(event: InvokeRequest | EmbedOp): Promise<InvokeResponse | EmbedResult> {
  if ('op' in event && event.op === 'embed') {
    return embed(event);  // routes to embed.ts
  }
  // Default: existing invoke path (back-compat — no op field = invoke)
  return invoke(event as InvokeRequest);
}

// invoke() stays exported for tests and type consumers
export async function invoke(request: InvokeRequest): Promise<InvokeResponse> { ... }
```

**CDK binding (ai-stack.ts):** `handler: 'handler'` (changed from `'invoke'`).

### 2.3 Transport Extension

```typescript
// services/agents/shared/invoke-transport.ts (addition)
import type { EmbedRequest, EmbedResult } from '../../ai-invoker/src/types.js';

export type EmbedFn = (request: EmbedRequest) => Promise<EmbedResult>;

export function createEmbedFn(): EmbedFn {
  return async (request: EmbedRequest): Promise<EmbedResult> => {
    const payload = { op: 'embed' as const, ...request };
    const result = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: AI_INVOKER_ARN,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(payload)),
      }),
    );
    if (result.FunctionError) {
      const err = result.Payload ? JSON.parse(Buffer.from(result.Payload).toString()) : {};
      throw new Error(`AI Invoker embed error: ${err.errorMessage ?? 'unknown'}`);
    }
    return JSON.parse(Buffer.from(result.Payload!).toString()) as EmbedResult;
  };
}
```

### 2.4 Key Constraints

- **InvokeModel-only:** Titan Embed v2 has no Converse API, no `requestMetadata`,
  no application inference profiles (EMB-3). Cost attribution is entirely within
  our metering path.
- **No AOSS retry:** The embed function is a pure embedding call. Callers handle
  the 45-second cold-start budget (EMB-5, steering 02-aoss-rule).
- **Weight seed required:** `MODELWEIGHT#amazon.titan-embed-text-v2:0` entry in seed JSON.
- **Live-confirmed:** Architect micro-invoke returned 1024 dims + inputTextTokenCount.

### 2.5 IAM Impact [REQUIRES-HUMAN]

Existing invoker IAM grants `bedrock:InvokeModel` with `resources: ['*']`. No new
statement needed. Task 4 = owner sign-off confirming IAM sufficiency.

---

## 3. Layer 1 — Contextual Grounding Flow

### 3.1 Invoker Grounding Sequence

```
invoke(request)
  ├── [existing] register-resolve → credit-precheck
  ├── converse(params) → raw response
  ├── [NEW] Post-response grounding check (if groundingContext present)
  │     ├── If response > 5000 chars → split into sections (§3.2)
  │     ├── For each section: ApplyGuardrail with grounding context
  │     │     verdict = PASS | BLOCKED
  │     ├── Emit Ai.GuardrailChecked telemetry
  │     ├── If ANY section BLOCKED:
  │     │     ├── RETRY ONCE: re-invoke with chunks verbatim +
  │     │     │   "answer only from the source" instruction
  │     │     ├── Re-check grounding on retry response
  │     │     ├── If retry PASSES → use retry response (flag evidence)
  │     │     └── If retry FAILS:
  │     │           ├── Replace response with honest-miss template
  │     │           ├── publish('Ai.GroundingBlocked', {...})
  │     │           └── Return honest-miss to caller
  │     └── If ALL sections PASS → continue normal flow
  ├── [existing] schema-retry (if outputSchema)
  ├── [existing] metering
  └── Return response (with guardrailEvidence metadata)
```

### 3.2 Section-Wise Splitting (L1-6, INV-4)

```typescript
// services/ai-invoker/src/grounding.ts
export function splitForGroundingCheck(text: string): string[] {
  if (text.length <= 5000) return [text];
  const headerSections = text.split(/(?=^#{2,3}\s)/m).filter(s => s.trim());
  if (headerSections.length > 1) return headerSections;
  return chunkAtParagraphs(text, 4000);
}
```

### 3.3 Grounding Check via ApplyGuardrail (Post-Converse)

Post-response `ApplyGuardrail` call (NOT inline Converse guardrailConfig). Rationale:
numeric score needed for L5 HITL cards; section-wise splitting requires per-section eval.

```typescript
export async function checkGrounding(params: {
  guardrailId: string;
  guardrailVersion: string;
  groundingSource: string;  // ≤100k chars
  query: string;            // ≤1,000 chars (validated/truncated)
  content: string;          // response section ≤5k chars
}): Promise<GroundingResult> {
  const response = await bedrockRuntime.send(new ApplyGuardrailCommand({
    guardrailIdentifier: params.guardrailId,
    guardrailVersion: params.guardrailVersion,
    source: 'OUTPUT',
    content: [
      { text: { text: params.groundingSource, qualifiers: ['grounding_source'] } },
      { text: { text: params.query, qualifiers: ['query'] } },
      { text: { text: params.content } },
    ],
  }));
  return parseGroundingResponse(response);
}
```

### 3.4 Grounding Source Contract

```typescript
export interface InvokeRequest {
  // ... existing fields ...
  groundingContext?: {
    source: string;   // ≤100,000 chars (truncated with warning if exceeded)
    query: string;    // ≤1,000 chars (truncated at word boundary if exceeded)
  };
  locale?: 'en' | 'es' | 'pt';  // tenant documentLocale for honest-miss
}
```

When `groundingContext` absent → no grounding check (skip-when-absent, §0.3).

### 3.5 Non-Streaming Invariant (L1-9, INV-3)

Record-writing paths enforce non-streaming. Current invoker is entirely non-streaming;
enforce as invariant for when streaming is introduced.

---

## 4. Agent Handler Wiring (H-1 D2)

### 4.1 Handler Retrieval Flow

```
Handler receives user question
  ├── 1. const embedFn = createEmbedFn();  // invoke-transport.ts (§2.3)
  │      const {embedding} = await embedFn({tenantId, agent, module, feature, text: question});
  ├── 2. const chunks = await retrieve({vector: embedding, tenantId, ...})
  │      └── Under 45-second AOSS budget (L1-11, steering 02-aoss-rule)
  ├── 3. Concatenate chunks (delimiter: \n---\n) → groundingSource (≤100k)
  └── 4. const response = await invokeFn({
           ..., groundingContext: { source: groundingSource, query: question.slice(0,1000) },
           locale: tenantDocumentLocale
         });
```

### 4.2 AOSS Retry Budget (L1-11)

Lives in the **agent handler** layer. The existing shared `retrieve()` wrapper
implements exponential backoff (BACKOFF_CEILING_MS=45,000, base 500ms, factor 2, jitter).

### 4.3 Citation Construction (invoker-side)

The invoker builds `Citation[]` from `groundingContext` chunks post-grounding-check:
1. Split `groundingContext.source` on `\n---\n` delimiter
2. Extract `clauseRef` from chunk metadata prefix `[ISO XXXXX X.X]`
3. Attach per-section grounding scores
4. Return top-5 citations sorted by score

---

## 5. Layer 2 — Automated Reasoning

### 5.1 AR Policy Authoring Workflow

```
1. Author source (contracts/clause-corpus-map.md) — tuples only (BC-2)
2. Create AR policy via API/console → build workflow → review fidelity
3. Save version → export PolicyDefinition JSON
4. Deploy via CFN (AWS::Bedrock::AutomatedReasoningPolicy)
5. Deploy AR guardrails (ArClause + ArAdvisory) with policy ARNs + CrossRegionConfig
```

### 5.2 Three AR Policies → Two Guardrails

| Policy | Guardrail | Paths |
|--------|-----------|-------|
| `clause-canon` | `ArClauseGuardrail` (1 policy) | Clause-citing paths (gurus, copilot, record-write) |
| `role-permissions` + `plan-entitlements` | `ArAdvisoryGuardrail` (2 policies) | Role/plan advisory paths |

`ar-check.ts` selects the AR guardrail by invocation path — stronger L2-7 conformance.

### 5.3 `clause-canon` Versioning (Part 32.2)

The clause-canon AR policy is regenerated from corpus maps on each canon release.
**Named carry:** The pipeline regeneration workflow (Part 32.2 Standards Update Manager)
is owned by the future `standards-update` spec, not this spec. This spec provides the
initial policy and the CDK resource; the regeneration lifecycle is a declared dependency.

### 5.4 AR Steered-Regeneration Flow (L2-5, L2-6)

```
invoke(request) → response
  ├── [L1] Grounding check — pass
  ├── [L2] AR validation (ar-check.ts, post-grounding)
  │     ├── Select AR guardrail: clause-citing → ArClause; role/plan → ArAdvisory
  │     ├── ApplyGuardrail on response
  │     ├── If AR REJECTS:
  │     │     ├── Extract: invalidClaim, reason, suggestedCorrection
  │     │     │   (from automatedReasoningPolicy.findings in ApplyGuardrail response)
  │     │     ├── RETRY ONCE with AR feedback injected
  │     │     ├── If retry PASSES → use retry response
  │     │     └── If retry FAILS → flag for HITL, publish('Ai.ArRejected')
  │     └── If AR PASSES → continue
  └── schema-retry, metering, return
```

### 5.5 IAM for AR [REQUIRES-HUMAN]

```json
{
  "Sid": "AutomatedReasoningChecks",
  "Effect": "Allow",
  "Action": ["bedrock:InvokeAutomatedReasoningPolicy"],
  "Resource": ["arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*"]
}
```

---

## 6. Layer 3 — Hop Guardrail Check

### 6.1 Architecture

Hop detection: `stopReason === 'tool_use'` + tool name in agent-routing registry.
Uses AgentGuardrail (content+PII) via `ApplyGuardrail` with `source: 'INPUT'`.
On BLOCK: halt chain, publish `Ai.HopBlocked`, return structured error.
Payload sanitization: summary only, no PII in event.

---

## 7. Layer 4 — Shared Prompt Library

### 7.1 Location

```
prompts/shared/{structural-honesty,licensed-uncertainty,retrieval-first,relative-date}.md
prompts/templates/honest-miss.{en,es,pt}.md
```

### 7.2 System Prompt Injection

```typescript
// services/ai-invoker/src/prompt-library.ts
export function buildSystemPrompt(basePrompt: string): string {
  return [STRUCTURAL_HONESTY, LICENSED_UNCERTAINTY, RETRIEVAL_FIRST, RELATIVE_DATE, basePrompt].join('\n\n');
}
```

### 7.3 Temperature Enforcement (L4-5)

Record-write paths cap temperature at 0.3. editor-ai (0.4 default) overridden when feature='record-write'.

### 7.4 clauseRef Validation (L4-8)

L4-8 satisfied by the L2 response-level AR check on clause-citing paths. Optional
deterministic pre-filter: regex extraction + hash-set lookup against corpus-map (free,
catches obvious fabrications before AR API cost).

---

## 8. Layer 5 — HITL Card Data Contract & Producer Chain

### 8.1 Extended GuardrailEvidence Type

```graphql
type GuardrailEvidence @aws_lambda {
  groundingScore: Float
  arVerdict: String
  arDetails: String
  citations: [Citation!]
  relevanceScore: Float          # NEW
  flagged: Boolean               # NEW
  flaggedApproval: FlaggedApproval  # NEW
}
type FlaggedApproval @aws_lambda {
  justification: String!
  approverSub: String!
  timestamp: AWSDateTime!
}
```

### 8.2 Flagged vs. Evidence-Presence

Evidence-presence ≠ flagged. `flagged: true` only when a guardrail layer failed
(grounding below threshold on first pass but passed on retry, or AR rejection on retry).

### 8.3 Producer Chain: InvokeResponse → DDB HitlItem

```
invoke() → InvokeResponse.guardrailEvidence
  → handler (tool-loop.ts: InvokeResponse in hand)
    → enterHitlGate (hitl.ts: HitlGateInput + sfnInput)
      → store-token.ts: writes guardrailEvidence to DDB HitlItem
        → Frontend reads from GSI9
```

store-token.ts extension: `guardrailEvidence?: GuardrailEvidenceData` in `StoreTokenInput.input`.

### 8.4 Flagged Approval Seal (L5-3)

`Hitl.Approved` event (auditTrail:true) carries `flaggedApproval` → sealed via R-3.

---

## 9. Telemetry & Events

### 9.1 Event Registrations

| detailType | auditTrail | entityId | Source |
|-----------|------------|----------|--------|
| `Ai.GuardrailChecked` | false | '' | `cumplify.ai-invoker` |
| `Ai.GroundingBlocked` | false | '' (or hitlItemId when known) | `cumplify.ai-invoker` |
| `Ai.HopBlocked` | false | '' | `cumplify.ai-invoker` |
| `Ai.ArRejected` | false | '' (or hitlItemId when known) | `cumplify.ai-invoker` |

### 9.2 Publishing Mechanism

Via `services/eventing/src/publisher.ts` `publish()` directly (agent-writeback precedent).

### 9.3 Event Payloads

```typescript
// Ai.GuardrailChecked (TEL-1: per-invocation telemetry)
interface GuardrailCheckedPayload {
  tenantId: string;
  agent: string;
  guardrailPolicy: string;  // 'grounding' | 'relevance' | 'ar:clause-canon' | 'ar:role-permissions' | 'ar:plan-entitlements' | 'hop:prompt-attack'
  verdict: 'pass' | 'block' | 'flag';
  score: number | null;     // numeric for grounding/relevance; null for AR/hop
  latencyMs: number;
  timestamp: string;
}

// Ai.GroundingBlocked (TEL-2)
interface GroundingBlockedPayload {
  tenantId: string;
  agent: string;
  module: string;
  groundingScore: number;
  relevanceScore: number;
  retryAttempted: boolean;
  finalOutcome: 'honest-miss' | 'hitl-deferred';
}

// Ai.HopBlocked (TEL-3)
interface HopBlockedPayload {
  tenantId: string;
  sourceAgent: string;
  targetAgent: string;
  blockedPolicy: string;  // e.g. 'PROMPT_ATTACK'
  payload: string;        // sanitized summary, NO PII
}

// Ai.ArRejected (TEL-4)
interface ArRejectedPayload {
  tenantId: string;
  agent: string;
  arPolicy: string;       // 'clause-canon' | 'role-permissions' | 'plan-entitlements'
  invalidClaim: string;
  reason: string;
  suggestedCorrection: string;
  retriedOnce: boolean;
  finalOutcome: 'corrected' | 'hitl-deferred';
}
```

---

## 10. Honest-Miss Templates (INV-2)

Locale from tenant `documentLocale` via `InvokeRequest.locale` (defaults to 'en').
Templates make NO factual claims. EN/ES/PT.

---

## 11. IAM Statements [REQUIRES-HUMAN]

### 11.1 Existing (no change)
`bedrock:InvokeModel` + `bedrock:ApplyGuardrail`, Resource:'*'.

### 11.2 New (AR)
`bedrock:InvokeAutomatedReasoningPolicy`, Resource: `arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*`.

---

## 12. InvokeRequest/InvokeResponse Extensions

### 12.1 Types

```typescript
// Embed operation (§2)
export interface EmbedRequest {
  tenantId: string;
  agent: string;
  module: string;
  feature: string;
  text: string;
}
export interface EmbedResult {
  embedding: number[];
  tokenCount: number;
  credits: number;
}
export type EmbedOp = { op: 'embed' } & EmbedRequest;

// InvokeRequest additions
export interface InvokeRequest {
  // ... existing ...
  groundingContext?: { source: string; query: string };
  locale?: 'en' | 'es' | 'pt';
}

// InvokeResponse additions
export interface InvokeResponse {
  // ... existing ...
  guardrailEvidence?: GuardrailEvidenceData;
}
export interface GuardrailEvidenceData {
  groundingScore: number | null;
  relevanceScore: number | null;
  arVerdict: 'pass' | 'fail' | null;
  arDetails: string | null;
  citations: Citation[];
  flagged: boolean;
}
export interface Citation {
  clauseRef: string;
  sourceChunk: string;
  score: number;
}
```

---

## 13. Dependencies & Sequencing

### 13.1 Blocking Dependencies

| Task | Blocked By | Reason |
|------|-----------|--------|
| Handler wiring (live grounding) | EMB + embed transport + AOSS retrieve | No grounding source without embed door |
| AR guardrail CDK (Task 25) | AR policy authoring (Tasks 22-24) | PolicyDefinition JSONs required |
| AR IAM (Task 26) | [REQUIRES-HUMAN] approval | bedrock:InvokeAutomatedReasoningPolicy |
| Live ACC-1/2 (Task 20) | Task 20 step-0 deploy of Phases 3-6 code | Invoker+handler code must be deployed |
| L5 producer (Task 31) | L1 grounding + handler wiring | guardrailEvidence only produced when grounding runs |

---

## 14. SOC 2 Impact

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC7.2 | Guardrail telemetry | `Ai.GuardrailChecked/GroundingBlocked/HopBlocked/ArRejected` |
| CC8.1 | AR policy versioning | `AWS::Bedrock::AutomatedReasoningPolicy` in CDK |
| PI1.4 | Flagged approvals sealed | `Hitl.Approved` (auditTrail:true) + flaggedApproval |
| CC6.1 | Permission matrix in AR | `role-permissions` AR policy |
| C1.2 | Hop screening | L3 blocks injection in inter-agent payloads |

---

## 15. Routed Findings

| Finding | Resolution |
|---------|-----------|
| F-B (guru handlers skip retrieval) | §4 handler wiring (H-2 D3) was NOT sufficient — access failed 401 until FIX-T20-3 (VPC placement + Lambda endpoint, b226137). CLOSED 2026-07-17: retrieval leg proven live via real retrieve() wrapper (2 chunks + REQ-RET-1 isolation). Grounded end-to-end via the REAL index awaits KB content — no spec currently owns seeding cumplify-iso-kb (routed to owner/roadmap). |
| F-C (imperative-prompt dependence) | §7 shared prompt library |
| spec-4 carry #5 (relative-date) | §7.1 relative-date instruction |

---

## 16. Open Questions

| # | Status | Question | Impact |
|---|--------|----------|--------|
| DQ-1 | **DISSOLVED** | CrossRegionConfig scope | Only on AR guardrails (§1.1) |
| DQ-2 | **ANSWERED** | Grounding score availability | ApplyGuardrail trace includes score |
| DQ-3 | OPEN | AR policy source format (Variables+Rules vs markdown) | Tasks 22-24 scope |

---

## 17. File Inventory

### New Files
| Path | Purpose |
|------|---------|
| `services/ai-invoker/src/embed.ts` | Embedding door (EMB-1..5) |
| `services/ai-invoker/src/grounding.ts` | L1 grounding + splitting + citations |
| `services/ai-invoker/src/ar-check.ts` | L2 AR validation (selects ArClause/ArAdvisory) |
| `services/ai-invoker/src/hop-check.ts` | L3 hop screening |
| `services/ai-invoker/src/prompt-library.ts` | L4 shared prompt injection |
| `services/ai-invoker/src/honest-miss.ts` | INV-2 template loader |
| `prompts/shared/*.md` | L4-2, L4-3, L4-6, L4-7 |
| `prompts/templates/honest-miss.{en,es,pt}.md` | INV-2 |
| `contracts/clause-corpus-map.md` | L2-1 prerequisite |
| `infra/data/ar-policies/*.json` | AR PolicyDefinition exports |

### Modified Files
| Path | Change |
|------|--------|
| `infra/lib/ai-stack.ts` | Grounding on Agent, RecordWrite+ArClause+ArAdvisory guardrails, env vars, IAM |
| `services/ai-invoker/src/types.ts` | EmbedRequest/EmbedResult/EmbedOp, InvokeRequest/Response extensions |
| `services/ai-invoker/src/index.ts` | Entry dispatch (op:'embed'), grounding/AR/hop orchestration, prompt-library |
| `services/ai-invoker/src/guardrail.ts` | 5-guardrail routing |
| `services/ai-invoker/data/model-weights-seed.json` | titan-embed-text-v2:0 |
| `services/agents/shared/invoke-transport.ts` | `createEmbedFn()` |
| `services/agents/shared/store-token.ts` | guardrailEvidence in input + DDB write |
| `services/agents/shared/tool-loop.ts` | Pass guardrailEvidence to enterHitlGate |
| `services/agents/shared/hitl.ts` | HitlGateInput + sfnInput carry evidence |
| `services/agents/guru-*/handler.ts` | embed→retrieve→groundingContext |
| `services/agents/copilot/handler.ts` | embed→retrieve→groundingContext |
| `services/eventing/src/audit-trail-registry.ts` | 4 Ai.* events |
| `contracts/events.md` | 4 Ai.* events |
| `services/api/schema/schema.graphql` | GuardrailEvidence + FlaggedApproval |
