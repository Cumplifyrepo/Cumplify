# Guardrails Anti-Hallucination — Design

**Spec:** `guardrails-antihallucination` (spec 35)
**Phase:** P1
**Revision:** D2 (2026-07-16)
**Requirements:** R2 (approved 2026-07-10)
**Base commit:** cc64741 (develop)

---

## 0. Design-Time Verification Results

### 0.1 Live Probe Results (architect, 2026-07-16)

| Probe | Result | Design Impact |
|-------|--------|---------------|
| OQ-1a: AR availability in us-east-1 (697114252993) | **AVAILABLE** — `list-automated-reasoning-policies` succeeds, zero policies exist | L2 IS IN SCOPE |
| OQ-1b: `InvokeGuardrailChecks` existence | **DOES NOT EXIST** — bedrock-runtime's only guardrail action is `apply-guardrail` | L3 uses `ApplyGuardrail` on hop payloads (L3-4 fallback) |
| OQ-3: Per-call threshold override | **NOT SUPPORTED** — thresholds baked into guardrail config at creation time | CDK-4: TWO grounding guardrails (advisory 0.85 + record-write 0.90) |
| Titan Embed v2 model access | **LIVE-ACCESSIBLE** — architect micro-invoke 2026-07-16 returned 1024 dims + `inputTextTokenCount: 2` | Task 4 scope reduces to IAM-sufficiency sign-off only |

### 0.2 CFN/CDK Verification (aws-docs MCP, 2026-07-16)

| Feature | CFN Support | Shape |
|---------|-------------|-------|
| `ContextualGroundingPolicyConfig` | **YES** — `AWS::Bedrock::Guardrail` property | `FiltersConfig: [{Type: GROUNDING, Threshold: N}, {Type: RELEVANCE, Threshold: N}]` |
| `AutomatedReasoningPolicyConfig` | **YES** — `AWS::Bedrock::Guardrail` property | `Policies: [policyArn]` — REQUIRES `CrossRegionConfig` with `guardrailProfileArn` |
| `AWS::Bedrock::AutomatedReasoningPolicy` | **YES** — standalone CFN resource | Deploys pre-authored `PolicyDefinition` (Variables + Rules). Does NOT run build workflow. |
| `CrossRegionConfig` for AR | **REQUIRED** when AR attached | `guardrailProfileArn: arn:aws:bedrock:us-east-1:<account>:guardrail-profile/us.guardrail.v1:0` |
| IAM for AR | `bedrock:InvokeAutomatedReasoningPolicy` | Resource: policy ARN (versioned) |
| CDK L1 typed props | **CONFIRMED** — aws-cdk-lib 2.261.0 has all typed props | No `addPropertyOverride` needed |

### 0.3 Converse API Grounding Mechanics (aws-docs MCP)

Grounding checks evaluate **OUTPUT only**. The invoker passes context via `guardContent` blocks with qualifiers:
- `["grounding_source"]` — retrieval chunks (excluded from other policies); **max 100,000 chars**
- `["query"]` — user question (excluded from other policies); **max 1,000 chars**
- Response content to guard: **max 5,000 chars** (section-wise splitting for longer responses)
- Unqualified / `["guard_content"]` — evaluated by ALL policies including grounding

**Skip-when-absent behavior:** When no `grounding_source` block is present in the input,
contextual grounding checks are skipped (grounding requires all three components: source,
query, and response). Pinned empirically in Task 7 readback (M-4a).

---

## 1. Guardrail Topology

### 1.1 Four-Guardrail Architecture (H-2 + CDK-4 Resolution)

Since per-call threshold override is NOT supported (OQ-3), the doc-gen guardrail must NOT
have grounding (spec-40), and AR policies require `CrossRegionConfig` which carries cost
and data-residency implications, the topology is:

| Guardrail | Construct ID | Grounding | Relevance | AR | Content/PII | CrossRegionConfig | Routing |
|-----------|-------------|-----------|-----------|-----|-------------|-------------------|---------|
| Agent (advisory) | `AgentGuardrail` (existing) | 0.85 | 0.75 | NONE | PROMPT_ATTACK HIGH + 5 PII | NO | All seats EXCEPT doc-composer and record-write feature |
| Record-write | `RecordWriteGuardrail` (NEW) | 0.90 | 0.75 | NONE | PROMPT_ATTACK HIGH + 5 PII | NO | `InvokeRequest.feature === 'record-write'` |
| AR-check | `ArCheckGuardrail` (NEW) | NONE | NONE | clause-canon, role-permissions, plan-entitlements | NONE | YES (`us.guardrail.v1:0`) | Post-response AR evaluation only (ar-check.ts) |
| Doc-gen | `DocGenGuardrail` (existing) | NONE | NONE | NONE | PROMPT_ATTACK HIGH + SSN/card BLOCK | NO | `seat === 'doc-composer'` |

**Rationale (H-2):** AR is quarantined on a dedicated `ArCheckGuardrail` that carries ONLY
`automatedReasoningPolicyConfig` + `crossRegionConfig`. This avoids:
1. Every advisory call paying AR evaluation cost (AR attached to AgentGuardrail would evaluate
   on ALL inline Converse calls — not just clause-citing paths per L2-7)
2. `CrossRegionConfig` on grounding-only guardrails (dissolves DQ-1)
3. Double-evaluation on grounding + AR paths

**Data-residency note (owner visibility):** AR evaluation routes through guardrail profile
`us.guardrail.v1:0` which enables cross-region inference within US regions (us-east-1,
us-east-2, us-west-2). All data stays within the US geographic boundary.

**Scope boundary:** The DocGen guardrail gets NO grounding/AR config. Document composition
grounding is owned by spec-40's deterministic checker + assertion ledger. This spec does not
touch `DocGenGuardrail`.

### 1.2 Routing Logic (extended `buildGuardrailConfig`)

```typescript
// services/ai-invoker/src/guardrail.ts (extended)
export function buildGuardrailConfig(
  seat: SeatId,
  feature?: string,
): GuardrailConfig | undefined {
  // Priority 1: doc-composer seat → docgen guardrail (no grounding)
  if (seat === 'doc-composer') {
    return envGuardrail('DOCGEN_GUARDRAIL');
  }
  // Priority 2: record-write feature → record-write guardrail (0.90 grounding)
  if (feature === 'record-write') {
    return envGuardrail('RECORDWRITE_GUARDRAIL');
  }
  // Priority 3: all other seats → agent guardrail (0.85 grounding)
  return envGuardrail('GUARDRAIL');
}

// SEPARATE: AR check guardrail (invoked post-response by ar-check.ts only)
export function buildArCheckGuardrailConfig(): GuardrailConfig | undefined {
  return envGuardrail('ARCHECK_GUARDRAIL');
}
```

### 1.3 CDK Configuration (ai-stack.ts additions)

```typescript
// NEW: Record-write guardrail (grounding 0.90 + relevance 0.75, NO CrossRegionConfig)
const recordWriteGuardrail = new bedrock.CfnGuardrail(this, 'RecordWriteGuardrail', {
  name: `cumplify-recordwrite-guardrail-${envConfig.envName}`,
  blockedInputMessaging: 'Request blocked by content policy.',
  blockedOutputsMessaging: 'Response blocked by content policy.',
  contentPolicyConfig: {
    filtersConfig: [
      { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
    ],
  },
  sensitiveInformationPolicyConfig: {
    piiEntitiesConfig: [
      { type: 'EMAIL', action: 'ANONYMIZE' },
      { type: 'PHONE', action: 'ANONYMIZE' },
      { type: 'NAME', action: 'ANONYMIZE' },
      { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
      { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
    ],
  },
  contextualGroundingPolicyConfig: {
    filtersConfig: [
      { type: 'GROUNDING', threshold: 0.90 },
      { type: 'RELEVANCE', threshold: 0.75 },
    ],
  },
});

// NEW: AR-check guardrail (AR policies ONLY + CrossRegionConfig)
const arCheckGuardrail = new bedrock.CfnGuardrail(this, 'ArCheckGuardrail', {
  name: `cumplify-archeck-guardrail-${envConfig.envName}`,
  blockedInputMessaging: 'Response contains invalid claims.',
  blockedOutputsMessaging: 'Response contains invalid claims.',
  crossRegionConfig: {
    guardrailProfileIdentifier:
      `arn:aws:bedrock:us-east-1:${envConfig.account}:guardrail-profile/us.guardrail.v1:0`,
  },
  automatedReasoningPolicyConfig: {
    policies: [
      clauseCanonPolicy.attrPolicyArn,
      rolePermissionsPolicy.attrPolicyArn,
      planEntitlementsPolicy.attrPolicyArn,
    ],
  },
});

// EXPAND existing AgentGuardrail: add contextual grounding (0.85 + 0.75)
// NO CrossRegionConfig, NO AR — grounding only (L1-1, L1-2 preserved)
contextualGroundingPolicyConfig: {
  filtersConfig: [
    { type: 'GROUNDING', threshold: 0.85 },
    { type: 'RELEVANCE', threshold: 0.75 },
  ],
},
```

---

## 2. Embedding Door (EMB-1..6)

### 2.1 Architecture

The `embed()` function lives at `services/ai-invoker/src/embed.ts` — invoker-internal,
not exported to callers outside the invoker module.

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Handler (guru/copilot)                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Call invoker embed(query) → vector                 │  │
│  │ 2. AOSS retrieve(vector) under 45s budget (L1-11)     │  │
│  │ 3. invoke({..., groundingContext:{source, query}})     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  services/ai-invoker/src/embed.ts                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ embed({tenantId, agent, module, feature, text})       │  │
│  │  1. bedrock:InvokeModel → amazon.titan-embed-text-v2:0│  │
│  │     body: {inputText, dimensions: 1024}               │  │
│  │  2. Read inputTextTokenCount from response            │  │
│  │  3. Load MODELWEIGHT#amazon.titan-embed-text-v2:0     │  │
│  │  4. Compute credits (inputTokens * wIn / 1M)         │  │
│  │  5. incrementMeter(tenantId, credits)                 │  │
│  │  6. emitCreditsTelemetry({...attrs, modelId, seat})   │  │
│  │  7. Return {embedding: number[], tokenCount}          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Constraints

- **InvokeModel-only:** Titan Embed v2 has no Converse API, no `requestMetadata`,
  no application inference profiles (EMB-3). Cost attribution is entirely within
  our metering path.
- **No AOSS retry:** The embed function is a pure embedding call. Callers that
  use the resulting vector for AOSS retrieval handle the 45-second cold-start
  budget themselves (EMB-5, steering 02-aoss-rule).
- **Weight seed required:** A new `MODELWEIGHT#amazon.titan-embed-text-v2:0` entry
  must be added to `services/ai-invoker/data/model-weights-seed.json` with the
  Titan Embed v2 pricing (wIn only — no output tokens, no cache).
- **Live-confirmed:** Architect micro-invoke 2026-07-16 returned 1024 dims +
  `inputTextTokenCount: 2`. Model is accessible in dev account.

### 2.3 IAM Impact [REQUIRES-HUMAN]

The existing invoker IAM policy already grants `bedrock:InvokeModel` with
`resources: ['*']`. Titan Embed v2 is invoked via the same action. **No new
IAM statement is required** — the existing policy covers it.

Task 4's scope reduces to: owner sign-off confirming IAM sufficiency (model
access already proven live).

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
  │     ├── Emit Ai.GuardrailChecked telemetry (M-1)
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

When a response exceeds 5,000 characters, the invoker splits before grounding checks:

1. **Primary split:** Markdown headers `##` and `###` as boundaries
2. **Fallback split:** 4,000-char chunks at paragraph boundaries (`\n\n`)
3. Each section is grounding-checked independently via `ApplyGuardrail`
4. If ANY section fails, the entire response enters the retry flow

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

The grounding check is a **post-response** `ApplyGuardrail` call, NOT the inline
Converse guardrailConfig evaluation. Rationale:

- Converse guardrailConfig evaluates grounding inline but does NOT return a numeric
  score — only PASS/BLOCKED. We need the score for L5 HITL cards.
- `ApplyGuardrail` returns `contextualGroundingPolicy.filters[].score` in the
  trace output, giving us the numeric grounding score for telemetry and HITL.
- Section-wise splitting requires per-section evaluation — not possible inline.

```typescript
// services/ai-invoker/src/grounding.ts
export async function checkGrounding(params: {
  guardrailId: string;
  guardrailVersion: string;
  groundingSource: string;  // retrieved chunks (≤100k chars)
  query: string;            // user question (≤1,000 chars — validated/truncated)
  content: string;          // response section to check (≤5k chars)
}): Promise<GroundingResult> {
  const response = await bedrockRuntime.send(new ApplyGuardrailCommand({
    guardrailIdentifier: params.guardrailId,
    guardrailVersion: params.guardrailVersion,
    source: 'OUTPUT',
    content: [
      { text: { text: params.groundingSource, qualifiers: ['grounding_source'] } },
      { text: { text: params.query, qualifiers: ['query'] } },
      { text: { text: params.content } },  // unqualified = content to guard
    ],
  }));
  return parseGroundingResponse(response);
}
```

### 3.4 Grounding Source Contract (Caller Responsibility)

The invoker needs retrieval chunks and the user query to perform grounding checks.
The `InvokeRequest` interface is extended:

```typescript
export interface InvokeRequest {
  // ... existing fields ...
  /** Retrieved KB chunks for grounding check (L1). Omit for non-grounded calls. */
  groundingContext?: {
    source: string;   // concatenated retrieval chunks (≤100,000 chars)
    query: string;    // original user question (≤1,000 chars)
  };
}
```

**API limits (M-3):** The invoker validates and truncates:
- `groundingContext.source`: ≤ 100,000 chars (truncate with warning log if exceeded)
- `groundingContext.query`: ≤ 1,000 chars (truncate at word boundary if exceeded)

When `groundingContext` is present, the invoker applies grounding checks post-response.
When absent, no grounding check is performed (§0.3: grounding requires all three
components — skip-when-absent behavior pinned empirically in Task 7).

### 3.5 Non-Streaming Invariant (L1-9, INV-3)

Record-writing paths (`feature === 'record-write'`) MUST be non-streaming. The current
invoker is entirely non-streaming (Converse, not ConverseStream). This is a no-op today
but must be enforced as an invariant:

```typescript
if (request.feature === 'record-write' && params.streaming) {
  throw new InvokeError('STREAMING_BLOCKED',
    'Record-writing paths must be non-streaming (L1-9)');
}
```

---

## 4. Agent Handler Wiring (H-1)

### 4.1 Handler Retrieval Flow

Guru handlers (guru-9001, guru-14001, guru-45001) and ComplianceCopilot perform
KB-grounded retrieval. The wiring sequence:

```
Handler receives user question
  │
  ├── 1. Call invoker embed({text: question, ...}) → {embedding, tokenCount}
  │
  ├── 2. Call AOSS retrieve({vector: embedding, tenantId, ...})
  │      └── Under 45-second cold-start budget (L1-11):
  │          exponential backoff (base 500ms, factor 2, jitter, ceiling 45s)
  │          Lambda timeout ≥ 60s
  │
  ├── 3. Concatenate retrieved chunks → groundingSource (≤100k chars)
  │
  └── 4. Call invoker invoke({
           ...,
           groundingContext: {
             source: groundingSource,
             query: question.slice(0, 1000),  // API cap
           }
         })
```

### 4.2 AOSS Retry Budget (L1-11)

The 45-second cold-start retry budget lives in the **agent handler** layer (not
the invoker). This is correct per EMB-5: the embed function does NOT implement
AOSS retry — callers that use the resulting vector for AOSS retrieval are
responsible for the budget.

Implementation: the existing AOSS retrieve() wrapper in `services/agents/shared/`
already implements exponential backoff per steering 02-aoss-rule. Guru handlers
call this wrapper between embed() and invoke().

### 4.3 Citation Construction (invoker-side)

The invoker builds `Citation[]` from `groundingContext` chunks when grounding
checks execute:

```typescript
export interface Citation {
  clauseRef: string;      // extracted from chunk metadata or content
  sourceChunk: string;    // first 200 chars of the matched chunk
  score: number;          // grounding score for this chunk
}
```

Construction logic (in `services/ai-invoker/src/grounding.ts`):
1. Split `groundingContext.source` back into individual chunks (delimiter: `\n---\n`)
2. For each chunk, extract `clauseRef` from metadata prefix (format: `[ISO XXXXX X.X]`)
3. After grounding check, attach per-section scores to the matching chunks
4. Return top-N citations (N=5) sorted by relevance score

---

## 5. Layer 2 — Automated Reasoning

### 5.1 AR Policy Authoring Workflow

AR policies are authored via a multi-step process (NOT a single CDK deploy):

```
1. Author source document (contracts/clause-corpus-map.md)
   └── Tuples only: {standard, edition, clause_number, title}
   └── NO verbatim ISO text (BC-2)

2. Create AR policy via API/console
   └── bedrock:CreateAutomatedReasoningPolicy
   └── Upload source → build workflow extracts rules
   └── Review fidelity report

3. Save version → export PolicyDefinition JSON
   └── bedrock:CreateAutomatedReasoningPolicyVersion

4. Deploy via CFN (AWS::Bedrock::AutomatedReasoningPolicy)
   └── PolicyDefinition from step 3

5. Deploy ArCheckGuardrail with policy ARNs + CrossRegionConfig
   └── IAM: bedrock:InvokeAutomatedReasoningPolicy
```

### 5.2 Three AR Policies

| Policy | Source Document | Paths |
|--------|----------------|-------|
| `clause-canon` | `contracts/clause-corpus-map.md` | All clause-citing paths (gurus, copilot, record-write) |
| `role-permissions` | Part 13 permission matrix + SoD rules | Copilot advisory, role-related queries |
| `plan-entitlements` | Billing tier truth table | Billing/plan query paths |

All three attach to the single `ArCheckGuardrail` (§1.1). The invoker's `ar-check.ts`
selectively invokes this guardrail post-response on the relevant paths only (L2-7).

### 5.3 `clause-canon` Versioning (Part 32.2)

The clause-canon AR policy carries `{standard, edition}` metadata and is regenerated
from corpus maps on each canon release:

1. `contracts/clause-corpus-map.md` is the source of truth (tuples only)
2. A pipeline stage extracts the PolicyDefinition JSON from the corpus map
3. The CDK `AWS::Bedrock::AutomatedReasoningPolicy` resource is updated
4. The guardrail picks up the new version via the policy ARN

### 5.4 AR Steered-Regeneration Flow (L2-5, L2-6)

```
invoke(request) → response
  ├── [L1] Grounding check (§3.1) — pass
  ├── [L2] AR validation (post-grounding, ar-check.ts)
  │     ├── ApplyGuardrail using ArCheckGuardrail (AR-only, §1.1)
  │     ├── If AR REJECTS (invalid claim):
  │     │     ├── Extract: invalidClaim, reason, suggestedCorrection
  │     │     ├── RETRY ONCE: re-invoke with AR feedback injected
  │     │     │   system += "Your previous response contained an invalid claim:
  │     │     │   '{invalidClaim}'. Reason: {reason}. Correction: {suggestedCorrection}.
  │     │     │   Please regenerate without the invalid claim."
  │     │     ├── Re-check AR on retry response
  │     │     ├── If retry PASSES → use retry response
  │     │     └── If retry FAILS:
  │     │           ├── Flag draft for HITL with AR verdict attached
  │     │           ├── publish('Ai.ArRejected', {...})
  │     │           └── Return flagged response (deferred to human)
  │     └── If AR PASSES → continue
  └── [existing] schema-retry, metering, return
```

**Key difference from L1:** AR rejection does NOT replace the response with
honest-miss. Instead, it defers to HITL — the draft is delivered with the AR
verdict attached so a human can review and decide.

### 5.5 IAM for AR [REQUIRES-HUMAN]

New IAM statement required on the invoker role:

```json
{
  "Sid": "AutomatedReasoningChecks",
  "Effect": "Allow",
  "Action": ["bedrock:InvokeAutomatedReasoningPolicy"],
  "Resource": [
    "arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*"
  ]
}
```

**Rationale for wildcard on policy ID:** AR policies are versioned and replaced
during canon releases. Pinning to a specific ARN would require IAM updates on
every policy version change. The account-scoped wildcard is the documented pattern.

---

## 6. Layer 3 — Hop Guardrail Check

### 6.1 Architecture

When the invoker handles a mid-chain agent hop (tool selection, event routing,
agent-to-agent handoff), it applies `ApplyGuardrail` on the inter-agent payload
to screen for prompt injection and content policy violations.

```
Agent A (via invoker)
  │
  ├── Response includes tool_use → route to Agent B
  │
  ├── [NEW] Hop guardrail check (invoker-side):
  │     ├── ApplyGuardrail({
  │     │     guardrailIdentifier: agentGuardrailId,
  │     │     guardrailVersion: agentGuardrailVersion,
  │     │     source: 'INPUT',
  │     │     content: [{ text: { text: serializedHopPayload } }]
  │     │   })
  │     ├── Emit Ai.GuardrailChecked telemetry
  │     ├── If BLOCKED:
  │     │     ├── Halt chain
  │     │     ├── publish('Ai.HopBlocked', {...})
  │     │     └── Return structured error to Agent A
  │     └── If PASS → deliver payload to Agent B
  │
  └── Continue chain
```

### 6.2 Hop Detection

The invoker detects hops by examining the `stopReason` from Converse:
- `tool_use` stop reason = potential hop (if the tool routes to another agent)
- The invoker checks the tool name against a registered agent-routing tool list

### 6.3 Payload Sanitization

The `Ai.HopBlocked` event includes a sanitized summary (no PII):
- Tool name, source agent, target agent
- The blocked policy type (PROMPT_ATTACK, content filter)
- NO raw payload content in the event (may contain PII)

---

## 7. Layer 4 — Shared Prompt Library

### 7.1 Location and Structure

```
prompts/
├── shared/
│   ├── structural-honesty.md       # L4-2: citation-or-silence
│   ├── licensed-uncertainty.md     # L4-3: "standard does not specify"
│   ├── retrieval-first.md          # L4-6: retrieve before asserting
│   └── relative-date.md            # L4-7: no absolute dates from memory
└── templates/
    ├── honest-miss.en.md           # INV-2: EN honest-miss template
    ├── honest-miss.es.md           # INV-2: ES honest-miss template
    └── honest-miss.pt.md           # INV-2: PT honest-miss template
```

### 7.2 System Prompt Injection

The invoker prepends shared prompt instructions to every agent system prompt:

```typescript
// services/ai-invoker/src/prompt-library.ts
export function buildSystemPrompt(basePrompt: string): string {
  return [
    STRUCTURAL_HONESTY,   // L4-2: citation-or-silence rule
    LICENSED_UNCERTAINTY, // L4-3: "not found in the standard"
    RETRIEVAL_FIRST,      // L4-6: retrieve before assert
    RELATIVE_DATE,        // L4-7: no absolute dates
    basePrompt,
  ].join('\n\n');
}
```

### 7.3 Temperature Enforcement (L4-5)

Record-writing paths enforce temperature ≤ 0.3:

```typescript
const defaults = SEAT_DEFAULTS[tier];
let temperature = request.temperature ?? defaults.temperature;
// L4-5: record-writing paths MUST use ≤ 0.3
if (request.feature === 'record-write' && temperature > 0.3) {
  temperature = 0.3;
}
```

Current `SEAT_DEFAULTS` compliance:
- workhorse=0.3 ✓, guru=0.1 ✓, legal-ledger=0.2 ✓, doc-composer=0.2 ✓
- **editor-ai=0.4** — when used for record-write, override to 0.3

### 7.4 clauseRef Validation (L4-8)

L4-8 is satisfied by the L2 response-level AR check (`ar-check.ts`) on clause-citing
paths. The `clause-canon` AR policy validates the entire response — a non-existent
clause, wrong title, or wrong-edition citation is formally rejected at response level.

**Optional deterministic pre-filter (spec-40 checker pattern):** Before invoking
the AR guardrail (which carries per-check pricing), a free offline pre-filter can
validate extracted clauseRefs against `contracts/clause-corpus-map.md` — a regex
extraction + hash-set lookup. This catches obvious fabrications (e.g., "ISO 9001 15.3")
without an API call. Failed pre-filter → steered-regeneration immediately (no AR cost).

---

## 8. Layer 5 — HITL Card Data Contract & Producer Chain (H-3)

### 8.1 Extended GuardrailEvidence Type

The existing `GuardrailEvidence` GraphQL type (schema.graphql ~691) is extended:

```graphql
type GuardrailEvidence @aws_lambda {
  groundingScore: Float
  arVerdict: String              # 'pass' | 'fail'
  arDetails: String              # AR rejection reason (if fail)
  citations: [Citation!]
  relevanceScore: Float          # NEW: relevance check score
  flagged: Boolean               # NEW: whether any guardrail layer flagged this
  flaggedApproval: FlaggedApproval  # NEW: populated on L5-2 approval
}

type FlaggedApproval @aws_lambda {
  justification: String!
  approverSub: String!
  timestamp: AWSDateTime!
}
```

### 8.2 Flagged vs. Evidence-Presence

**Critical distinction:** Evidence-presence ≠ flagged. Every KB-grounded response
carries guardrailEvidence (score, citations). Only responses that FAILED a guardrail
check (grounding below threshold on first pass but passed on retry, or AR rejection
on retry) are marked `flagged: true`.

The `flagged` field drives L5-2: when `flagged === true` and a human approves,
the system requires a typed justification.

### 8.3 Producer Chain: InvokeResponse → DDB HitlItem (H-3)

Spec-9 Task 17 proved the READ surface with a simulated DDB item. This spec produces
real `guardrailEvidence` through the full chain:

```
invoke() returns InvokeResponse.guardrailEvidence
  │
  ├── Agent handler receives evidence alongside response text
  │
  ├── Handler calls enterHitlGate({..., guardrailEvidence})
  │     └── Passes evidence in the StoreTokenInput.input payload
  │
  ├── store-token.ts (SFN WaitForApproval state)
  │     └── Writes guardrailEvidence to DDB HitlItem:
  │         SET guardrailEvidence = :evidence
  │
  └── Frontend reads guardrailEvidence from GSI9 query
      └── Renders HITL card with scores, citations, flagged state
```

**store-token.ts extension:** Add `guardrailEvidence?: GuardrailEvidenceData` to
`StoreTokenInput.input` interface. The UpdateExpression adds
`guardrailEvidence = :evidence` (marshalled as DynamoDB map).

### 8.4 Flagged Approval Seal (L5-3)

When a human approves a flagged draft:
1. The `Hitl.Approved` event (existing, `auditTrail: true`) carries the
   `flaggedApproval` object in its payload
2. The approval is sealed to the immutable audit trail via the existing
   audit-sink (R-3) path
3. No separate telemetry event — TEL-5 clarifies this is part of the
   existing HITL approval flow

---

## 9. Telemetry & Events

### 9.1 Event Registrations (TEL-6 + M-1)

All four events are registered with `auditTrail: false` (telemetry, not domain transitions):

| detailType | auditTrail | entityId | Source |
|-----------|------------|----------|--------|
| `Ai.GuardrailChecked` | false | '' | `cumplify.ai-invoker` |
| `Ai.GroundingBlocked` | false | '' (or hitlItemId when known) | `cumplify.ai-invoker` |
| `Ai.HopBlocked` | false | '' | `cumplify.ai-invoker` |
| `Ai.ArRejected` | false | '' (or hitlItemId when known) | `cumplify.ai-invoker` |

**entityId rationale (L-1):** These events are `auditTrail: false` and never reach
the immutable ledger. The entityId field is type-required but cosmetic here — use ''
consistently (the invoker does not always have a domain row ID at grounding-check time).
When the hitlItemId is known (HITL-deferred outcomes), it may be passed for tracing.

Registration in `contracts/events.md` AND `services/eventing/src/audit-trail-registry.ts`
BEFORE any publish code (publisher throws on unregistered detailType).

### 9.2 Publishing Mechanism (L-2)

The invoker publishes via `services/eventing/src/publisher.ts` `publish()` directly
(same pattern as the agent-writeback precedent). NOT via api resolvers' shared module.
The `publish()` function validates against the registry and stamps `auditTrail` from
the compile-time map.

### 9.3 Event Payloads

```typescript
// Ai.GuardrailChecked (TEL-1, per-invocation telemetry)
interface GuardrailCheckedPayload {
  tenantId: string;
  agent: string;
  guardrailPolicy: string;  // 'grounding' | 'relevance' | 'ar:clause-canon' | 'hop:prompt-attack'
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
  blockedPolicy: string;
  payload: string;        // sanitized summary, NO PII
}

// Ai.ArRejected (TEL-4)
interface ArRejectedPayload {
  tenantId: string;
  agent: string;
  arPolicy: string;
  invalidClaim: string;
  reason: string;
  suggestedCorrection: string;
  retriedOnce: boolean;
  finalOutcome: 'corrected' | 'hitl-deferred';
}
```

---

## 10. Honest-Miss Templates (INV-2)

### 10.1 Template Design

Templates are locale-aware (EN/ES/PT) and make NO factual claims:

```markdown
<!-- prompts/templates/honest-miss.en.md -->
I was unable to provide a sufficiently grounded answer to your question.
The information available in the knowledge base did not meet the confidence
threshold required for this type of response.

**What you can do:**
- Rephrase your question with more specific terms
- Contact your IMS Lead for guidance on this topic
- Check the relevant standard clause directly

_This response was generated because the AI system's grounding check
indicated insufficient evidence to support a reliable answer._
```

### 10.2 Locale Selection (L-3)

The honest-miss template locale comes from the tenant's `documentLocale` setting
(spec-41 T8 precedent). The invoker resolves this from the `InvokeRequest`:

```typescript
// services/ai-invoker/src/honest-miss.ts
export type SupportedLocale = 'en' | 'es' | 'pt';

export function getHonestMissTemplate(locale: SupportedLocale): string {
  return HONEST_MISS_TEMPLATES[locale] ?? HONEST_MISS_TEMPLATES['en'];
}
```

The caller (agent handler) passes the tenant's documentLocale. The invoker does NOT
look up tenant settings — it receives the locale via a new optional field:

```typescript
export interface InvokeRequest {
  // ... existing fields ...
  /** Tenant document locale for honest-miss template (defaults to 'en') */
  locale?: SupportedLocale;
}
```

---

## 11. IAM Statements [REQUIRES-HUMAN]

### 11.1 Existing (already deployed, no change needed)

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:ApplyGuardrail"],
  "Resource": ["*"]
}
```

This already covers:
- `bedrock:InvokeModel` for Titan Embed v2 (EMB-6)
- `bedrock:ApplyGuardrail` for L1/L3 guardrail checks (INV-5)

### 11.2 New Statement Required (AR — L2)

```json
{
  "Sid": "AutomatedReasoningChecks",
  "Effect": "Allow",
  "Action": ["bedrock:InvokeAutomatedReasoningPolicy"],
  "Resource": [
    "arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*"
  ]
}
```

### 11.3 Human Gate

The only NET NEW IAM change is 11.2 (`bedrock:InvokeAutomatedReasoningPolicy`).
The human gate verifies:
1. IAM sufficiency for Titan Embed (existing InvokeModel + Resource:'*' — Task 4)
2. AR policy IAM statement approved (Task 24)
3. CDK Nag: existing IAM5 suppression covers InvokeModel; AR statement uses
   account-scoped resource — no new suppression needed

---

## 12. InvokeRequest/InvokeResponse Extensions

### 12.1 InvokeRequest Additions

```typescript
export interface InvokeRequest {
  // ... existing fields ...
  /** Retrieved KB chunks for grounding check (L1). Omit for non-grounded calls. */
  groundingContext?: {
    source: string;   // concatenated retrieval chunks (≤100,000 chars)
    query: string;    // original user question (≤1,000 chars)
  };
  /** Tenant document locale for honest-miss template (defaults to 'en') */
  locale?: 'en' | 'es' | 'pt';
}
```

### 12.2 InvokeResponse Additions

```typescript
export interface InvokeResponse {
  // ... existing fields ...
  /** Guardrail evidence for HITL cards (L5) */
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
  sourceChunk: string;  // first 200 chars of matched chunk
  score: number;
}
```

---

## 13. Dependencies & Sequencing

### 13.1 Dependency Graph

```
TEL (event registration) ──────────────┐
                                        ├── L1 grounding (invoker)
EMB (embed door) ──────────────────────┤
                                        ├── Handler wiring (H-1)
CDK (grounding guardrails) ────────────┘     │
                                             ├── L3 hop checks
                                             │
L1 (grounding) + Handler wiring ────────── L5 producer chain (H-3)
                                             │
                                        L4 (prompt library)
                                             │
                                        L2 (AR policies → ArCheckGuardrail)
```

### 13.2 Blocking Dependencies

| Task | Blocked By | Reason |
|------|-----------|--------|
| Handler wiring (live grounding) | EMB + AOSS retrieve() | No grounding source without real embeddings |
| L2 AR policy CDK | AR policy authoring (interactive) | CFN deploys pre-authored PolicyDefinition only |
| L2 AR IAM | [REQUIRES-HUMAN] approval | bedrock:InvokeAutomatedReasoningPolicy |
| ACC-1/2 live readback | Handler wiring deployed | Needs real embed→retrieve→grounding path |
| L5 producer (HITL evidence) | L1 grounding + handler wiring | guardrailEvidence only produced when grounding runs |

### 13.3 What Ships Without Embeddings

Even before handler wiring is live:
- CDK guardrail expansion (grounding policies baked into guardrail config)
- L3 hop checks (no embedding dependency)
- L4 prompt library (pure prompt engineering)
- L5 HITL contract extension (GraphQL type + store-token extension)
- TEL event registration
- Honest-miss templates
- Grounding module code (structurally complete, dormant without groundingContext)

---

## 14. SOC 2 Impact

### Trust Services Criteria Touched

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC7.2 (Monitoring) | Guardrail telemetry events feed genai-observability | `Ai.GuardrailChecked`, `Ai.GroundingBlocked`, `Ai.HopBlocked`, `Ai.ArRejected` |
| CC8.1 (Change Management) | AR policy versioning via pipeline | `AWS::Bedrock::AutomatedReasoningPolicy` in CDK, version-controlled |
| PI1.4 (Processing Integrity) | Hash-chained audit trail for flagged approvals | L5-3 flagged-approval sealed via `Hitl.Approved` (auditTrail: true) |
| CC6.1 (Logical Access) | AR policies encode permission matrix | `role-permissions` AR policy validates advisory responses |
| C1.2 (Confidentiality) | Hop payload screening | L3 blocks prompt injection in inter-agent payloads |

### Evidence Emitted Automatically

- Per-invocation guardrail telemetry (`Ai.GuardrailChecked`)
- Block events (`Ai.GroundingBlocked` / `Ai.HopBlocked` / `Ai.ArRejected`)
- Flagged-approval justification sealed to immutable trail (on human override)
- CDK Nag reports (compliance check at synth time)

---

## 15. Routed Findings (incorporated from prior specs)

| Finding | Resolution in This Design |
|---------|--------------------------|
| F-B (guru handlers skip retrieval — AOSS 401) | §4 handler wiring: embed→retrieve→groundingContext (H-1). No longer permanently dormant. |
| F-C (imperative-prompt dependence) | §7 shared prompt library — structural honesty instructions in `prompts/shared/` |
| spec-4 carry #5 (relative-date hallucination) | §7.1 relative-date instruction in shared prompt library |

---

## 16. Open Questions (Design-Time)

| # | Status | Question | Impact |
|---|--------|----------|--------|
| DQ-1 | **DISSOLVED (H-2)** | CrossRegionConfig requirement scope. | Quarantined to ArCheckGuardrail only; grounding guardrails have no CrossRegionConfig. |
| DQ-2 | **ANSWERED** | Grounding check numeric score availability. | `ApplyGuardrail` trace includes `contextualGroundingPolicy.filters[].score`. |
| DQ-3 | OPEN | AR policy source document format. The aws-docs show Variables+Rules+Types format, not natural-language documents. Confirm whether the build workflow can ingest our corpus-map markdown or whether we need to manually author Variables/Rules. | L2 task scope (Tasks 20-22) |

---

## 17. File Inventory (new/modified)

### New Files
| Path | Purpose |
|------|---------|
| `services/ai-invoker/src/embed.ts` | EMB-1..5: embedding door |
| `services/ai-invoker/src/grounding.ts` | L1: grounding check + section splitting + citation construction |
| `services/ai-invoker/src/ar-check.ts` | L2: AR validation + steered-regeneration (uses ArCheckGuardrail) |
| `services/ai-invoker/src/hop-check.ts` | L3: hop payload screening |
| `services/ai-invoker/src/prompt-library.ts` | L4: shared prompt injection |
| `services/ai-invoker/src/honest-miss.ts` | INV-2: honest-miss template loader (locale from documentLocale) |
| `prompts/shared/structural-honesty.md` | L4-2 |
| `prompts/shared/licensed-uncertainty.md` | L4-3 |
| `prompts/shared/retrieval-first.md` | L4-6 |
| `prompts/shared/relative-date.md` | L4-7 |
| `prompts/templates/honest-miss.en.md` | INV-2 EN |
| `prompts/templates/honest-miss.es.md` | INV-2 ES |
| `prompts/templates/honest-miss.pt.md` | INV-2 PT |
| `contracts/clause-corpus-map.md` | L2-1 prerequisite |
| `infra/data/ar-policies/clause-canon.json` | Exported AR PolicyDefinition |
| `infra/data/ar-policies/role-permissions.json` | Exported AR PolicyDefinition |
| `infra/data/ar-policies/plan-entitlements.json` | Exported AR PolicyDefinition |

### Modified Files
| Path | Change |
|------|--------|
| `infra/lib/ai-stack.ts` | Add grounding to AgentGuardrail, add RecordWriteGuardrail, add ArCheckGuardrail, env vars, IAM |
| `services/ai-invoker/src/types.ts` | Extend InvokeRequest/InvokeResponse, add error codes, add locale |
| `services/ai-invoker/src/guardrail.ts` | Extended routing (4-guardrail) + buildArCheckGuardrailConfig |
| `services/ai-invoker/src/index.ts` | Orchestration: grounding → AR → hop checks, prompt-library wrap |
| `services/ai-invoker/data/model-weights-seed.json` | Add titan-embed-text-v2:0 weights |
| `services/eventing/src/audit-trail-registry.ts` | Register Ai.* events (4 entries) |
| `contracts/events.md` | Register Ai.* events (4 entries) |
| `services/api/schema/schema.graphql` | Extend GuardrailEvidence + add FlaggedApproval |
| `services/agents/shared/store-token.ts` | Add guardrailEvidence to StoreTokenInput.input + DDB write |
| `services/agents/guru-9001/handler.ts` | Embed → retrieve → groundingContext wiring |
| `services/agents/guru-14001/handler.ts` | Embed → retrieve → groundingContext wiring |
| `services/agents/guru-45001/handler.ts` | Embed → retrieve → groundingContext wiring |
| `services/agents/copilot/handler.ts` | Embed → retrieve → groundingContext wiring |
