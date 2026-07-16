# Guardrails Anti-Hallucination — Design

**Spec:** `guardrails-antihallucination` (spec 35)
**Phase:** P1
**Revision:** D1 (2026-07-16)
**Requirements:** R2 (approved 2026-07-10)
**Base commit:** 4322672 (develop)

---

## 0. Design-Time Verification Results

### 0.1 Live Probe Results (architect, 2026-07-16)

| Probe | Result | Design Impact |
|-------|--------|---------------|
| OQ-1a: AR availability in us-east-1 (697114252993) | **AVAILABLE** — `list-automated-reasoning-policies` succeeds, zero policies exist | L2 IS IN SCOPE |
| OQ-1b: `InvokeGuardrailChecks` existence | **DOES NOT EXIST** — bedrock-runtime's only guardrail action is `apply-guardrail` | L3 uses `ApplyGuardrail` on hop payloads (L3-4 fallback) |
| OQ-3: Per-call threshold override | **NOT SUPPORTED** — thresholds baked into guardrail config at creation time | CDK-4: TWO grounding guardrails (advisory 0.85 + record-write 0.90) |

### 0.2 CFN/CDK Verification (aws-docs MCP, 2026-07-16)

| Feature | CFN Support | Shape |
|---------|-------------|-------|
| `ContextualGroundingPolicyConfig` | **YES** — `AWS::Bedrock::Guardrail` property | `FiltersConfig: [{Type: GROUNDING, Threshold: N}, {Type: RELEVANCE, Threshold: N}]` |
| `AutomatedReasoningPolicyConfig` | **YES** — `AWS::Bedrock::Guardrail` property | `Policies: [policyArn]` — REQUIRES `CrossRegionConfig` with `guardrailProfileArn` |
| `AWS::Bedrock::AutomatedReasoningPolicy` | **YES** — standalone CFN resource | Deploys pre-authored `PolicyDefinition` (Variables + Rules). Does NOT run build workflow. |
| `CrossRegionConfig` for AR | **REQUIRED** when AR attached | `guardrailProfileArn: arn:aws:bedrock:us-east-1:<account>:guardrail-profile/us.guardrail.v1:0` |
| IAM for AR | `bedrock:InvokeAutomatedReasoningPolicy` | Resource: policy ARN (versioned) |

### 0.3 Converse API Grounding Mechanics (aws-docs MCP)

Grounding checks evaluate **OUTPUT only**. The invoker passes context via `guardContent` blocks with qualifiers:
- `["grounding_source"]` — retrieval chunks (excluded from other policies)
- `["query"]` — user question (excluded from other policies)
- Unqualified / `["guard_content"]` — evaluated by ALL policies including grounding

---

## 1. Guardrail Topology

### 1.1 Three-Guardrail Architecture (CDK-4 Resolution)

Since per-call threshold override is NOT supported (OQ-3), and the doc-gen guardrail must NOT
have grounding (spec-40 deterministic checker owns that), the topology becomes:

| Guardrail | Construct ID | Grounding | Relevance | AR | Content/PII | Routing |
|-----------|-------------|-----------|-----------|-----|-------------|---------|
| Agent (advisory) | `AgentGuardrail` (existing) | 0.85 | 0.75 | clause-canon, role-permissions, plan-entitlements | PROMPT_ATTACK HIGH + 5 PII | All seats EXCEPT doc-composer and record-write feature |
| Record-write | `RecordWriteGuardrail` (NEW) | 0.90 | 0.75 | clause-canon | PROMPT_ATTACK HIGH + 5 PII | `InvokeRequest.feature === 'record-write'` |
| Doc-gen | `DocGenGuardrail` (existing) | NONE | NONE | NONE | PROMPT_ATTACK HIGH + SSN/card BLOCK | `seat === 'doc-composer'` |

**Rationale:** The architect recommended a THIRD guardrail for record-writing (grounding 0.90)
rather than multiplexing the same guardrail with different thresholds. This keeps each guardrail
statically configured — no runtime threshold manipulation needed.

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
```

### 1.3 CDK Configuration (ai-stack.ts additions)

```typescript
// NEW: Record-write guardrail (grounding 0.90 + relevance 0.75)
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

// EXPAND existing AgentGuardrail: add contextual grounding (0.85 + 0.75)
// Added as a new property on the existing CfnGuardrail construct (L1-1, L1-2 preserved)
contextualGroundingPolicyConfig: {
  filtersConfig: [
    { type: 'GROUNDING', threshold: 0.85 },
    { type: 'RELEVANCE', threshold: 0.75 },
  ],
},
```

### 1.4 AR Policy Attachment (L2 — phased)

AR policies attach to guardrails via `AutomatedReasoningPolicyConfig.Policies: [arn]`.
When AR is attached, `CrossRegionConfig` is REQUIRED:

```typescript
crossRegionConfig: {
  guardrailProfileIdentifier:
    `arn:aws:bedrock:us-east-1:${envConfig.account}:guardrail-profile/us.guardrail.v1:0`,
},
automatedReasoningPolicyConfig: {
  policies: [clauseCanonPolicy.attrPolicyArn],
},
```

**Phasing decision:** AR attachment to the agent guardrail happens AFTER the AR policies
are authored and tested (L2-1..L2-4 tasks). The CDK update for AR attachment is a separate
task from the grounding expansion to de-risk deployments.

---

## 2. Embedding Door (EMB-1..6)

### 2.1 Architecture

The `embed()` function lives at `services/ai-invoker/src/embed.ts` — invoker-internal,
not exported to callers outside the invoker module.

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Handler (guru/copilot)                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. invoke({..., feature:'advisory'})                  │  │
│  │    └─ invoker calls embed() internally for retrieval  │  │
│  │       context preparation                             │  │
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

### 2.3 IAM Impact [REQUIRES-HUMAN]

The existing invoker IAM policy already grants `bedrock:InvokeModel` with
`resources: ['*']`. Titan Embed v2 is invoked via the same action. **No new
IAM statement is required** — the existing policy covers it.

However, EMB-6 mandates explicit verification that the model is accessible
in us-east-1 for account 697114252993. The REQUIRES-HUMAN gate verifies:
1. Model access is enabled for `amazon.titan-embed-text-v2:0` in Bedrock console
2. The invoker role's existing `bedrock:InvokeModel` + `Resource: '*'` is sufficient

---

## 3. Layer 1 — Contextual Grounding Flow

### 3.1 Invoker Grounding Sequence

```
invoke(request)
  ├── [existing] register-resolve → credit-precheck
  ├── [NEW] Prepare grounding context (if KB-grounded invocation)
  │     └── Inject guardContent blocks with qualifiers:
  │         - grounding_source: retrieved chunks (from caller)
  │         - query: user question (from caller)
  ├── converse(params) → raw response
  ├── [NEW] Post-response grounding check
  │     ├── If response > 5000 chars → split into sections (§3.2)
  │     ├── For each section: ApplyGuardrail with grounding context
  │     │     verdict = PASS | BLOCKED
  │     ├── If ANY section BLOCKED:
  │     │     ├── RETRY ONCE: re-invoke with chunks verbatim +
  │     │     │   "answer only from the source" instruction
  │     │     ├── Re-check grounding on retry response
  │     │     ├── If retry PASSES → use retry response
  │     │     └── If retry FAILS:
  │     │           ├── Replace response with honest-miss template
  │     │           ├── publishAuditEvent('Ai.GroundingBlocked', {...})
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
  // Split on ## or ### headers
  const headerSections = text.split(/(?=^#{2,3}\s)/m).filter(s => s.trim());
  if (headerSections.length > 1) return headerSections;
  // Fallback: 4000-char chunks at paragraph boundaries
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
  groundingSource: string;  // retrieved chunks
  query: string;            // user question
  content: string;          // response section to check
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
  // Extract verdict + scores from response
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
    source: string;   // concatenated retrieval chunks (≤100k chars)
    query: string;    // original user question
  };
}
```

When `groundingContext` is present, the invoker applies grounding checks post-response.
When absent, no grounding check is performed (non-KB-grounded invocations pass through).

**Blocker note (F-B):** Currently, guru handlers skip retrieval — AOSS 401 live-proven.
The EMB-1..6 embed door is what unblocks real grounding AND the frontend ACC-2
grounded-answer leg. Until embed + retrieval are wired, grounding checks have no
source to check against. The tasks reflect this dependency.

### 3.5 Non-Streaming Invariant (L1-9, INV-3)

Record-writing paths (`feature === 'record-write'`) MUST be non-streaming. The current
invoker is entirely non-streaming (Converse, not ConverseStream). This is a no-op today
but must be enforced as an invariant:

```typescript
// In invoke(): before calling converse()
if (request.feature === 'record-write' && params.streaming) {
  throw new InvokeError('STREAMING_BLOCKED',
    'Record-writing paths must be non-streaming (L1-9)');
}
```

---

## 4. Layer 2 — Automated Reasoning

### 4.1 AR Policy Authoring Workflow

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
   └── Attach to guardrail via AutomatedReasoningPolicyConfig

5. Attach to guardrail (CDK update)
   └── CrossRegionConfig REQUIRED
   └── IAM: bedrock:InvokeAutomatedReasoningPolicy
```

### 4.2 Three AR Policies

| Policy | Source Document | Guardrail Attachment | Paths |
|--------|----------------|---------------------|-------|
| `clause-canon` | `contracts/clause-corpus-map.md` | Agent + Record-write | All clause-citing paths (gurus, copilot, record-write) |
| `role-permissions` | Part 13 permission matrix + SoD rules | Agent only | Copilot advisory, role-related queries |
| `plan-entitlements` | Billing tier truth table | Agent only | Billing/plan query paths |

### 4.3 `clause-canon` Versioning (Part 32.2)

The clause-canon AR policy carries `{standard, edition}` metadata and is regenerated
from corpus maps on each canon release:

1. `contracts/clause-corpus-map.md` is the source of truth (tuples only)
2. A pipeline stage extracts the PolicyDefinition JSON from the corpus map
3. The CDK `AWS::Bedrock::AutomatedReasoningPolicy` resource is updated
4. The guardrail picks up the new version via the policy ARN

### 4.4 AR Steered-Regeneration Flow (L2-5, L2-6)

```
invoke(request) → response
  ├── [L1] Grounding check (§3.1) — pass
  ├── [L2] AR validation (post-grounding)
  │     ├── ApplyGuardrail with AR policy attached
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
  │     │           ├── publishAuditEvent('Ai.ArRejected', {...})
  │     │           └── Return flagged response (not replaced — deferred to human)
  │     └── If AR PASSES → continue
  └── [existing] schema-retry, metering, return
```

**Key difference from L1:** AR rejection does NOT replace the response with
honest-miss. Instead, it defers to HITL — the draft is delivered with the AR
verdict attached so a human can review and decide.

### 4.5 IAM for AR [REQUIRES-HUMAN]

New IAM statement required on the invoker role:

```typescript
aiInvoker.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['bedrock:InvokeAutomatedReasoningPolicy'],
  resources: [
    clauseCanonPolicy.attrPolicyArn,
    rolePermissionsPolicy.attrPolicyArn,
    planEntitlementsPolicy.attrPolicyArn,
  ],
}));
```

---

## 5. Layer 3 — Hop Guardrail Check

### 5.1 Architecture

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
  │     ├── If BLOCKED:
  │     │     ├── Halt chain
  │     │     ├── publishAuditEvent('Ai.HopBlocked', {...})
  │     │     └── Return structured error to Agent A
  │     └── If PASS → deliver payload to Agent B
  │
  └── Continue chain
```

### 5.2 Hop Detection

The invoker detects hops by examining the `stopReason` from Converse:
- `tool_use` stop reason = potential hop (if the tool routes to another agent)
- The invoker checks the tool name against a registered agent-routing tool list

### 5.3 Payload Sanitization

The `Ai.HopBlocked` event includes a sanitized summary (no PII):
- Tool name, source agent, target agent
- The blocked policy type (PROMPT_ATTACK, content filter)
- NO raw payload content in the event (may contain PII)

---

## 6. Layer 4 — Shared Prompt Library

### 6.1 Location and Structure

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

### 6.2 System Prompt Injection

The invoker prepends shared prompt instructions to every agent system prompt:

```typescript
// services/ai-invoker/src/prompt-library.ts
export function buildSystemPrompt(basePrompt: string, locale: string): string {
  return [
    STRUCTURAL_HONESTY,   // L4-2: citation-or-silence rule
    LICENSED_UNCERTAINTY, // L4-3: "not found in the standard"
    RETRIEVAL_FIRST,      // L4-6: retrieve before assert
    RELATIVE_DATE,        // L4-7: no absolute dates
    basePrompt,
  ].join('\n\n');
}
```

### 6.3 Temperature Enforcement (L4-5)

Record-writing paths enforce temperature ≤ 0.3:

```typescript
// In invoke(): resolve temperature
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

### 6.4 clauseRef Validation (L4-8)

Post-generation, the invoker validates `clauseRef` values in every response against
the `clause-canon` AR policy. This is effectively the L2 flow applied specifically
to clause references. Invalid references trigger the L2-5 steered-regeneration.

Implementation: extract `clauseRef` patterns from response text (regex: ISO standard
number + clause number), validate each against the AR policy via `ApplyGuardrail`.

---

## 7. Layer 5 — HITL Card Data Contract

### 7.1 Extended GuardrailEvidence Type

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

### 7.2 Flagged vs. Evidence-Presence

**Critical distinction:** Evidence-presence ≠ flagged. Every KB-grounded response
carries guardrailEvidence (score, citations). Only responses that FAILED a guardrail
check (grounding below threshold on first pass but passed on retry, or AR rejection
on retry) are marked `flagged: true`.

The `flagged` field drives L5-2: when `flagged === true` and a human approves,
the system requires a typed justification.

### 7.3 Flagged Approval Seal (L5-3)

When a human approves a flagged draft:
1. The `Hitl.Approved` event (existing, `auditTrail: true`) carries the
   `flaggedApproval` object in its payload
2. The approval is sealed to the immutable audit trail via the existing
   audit-sink (R-3) path
3. No separate telemetry event — TEL-5 clarifies this is part of the
   existing HITL approval flow

---

## 8. Telemetry & Events

### 8.1 Event Registrations (TEL-6)

All three events are registered with `auditTrail: false` (telemetry, not domain transitions):

| detailType | auditTrail | entityId | Source |
|-----------|------------|----------|--------|
| `Ai.GroundingBlocked` | false | Draft/record row ID (when one exists) | `cumplify.ai-invoker` |
| `Ai.HopBlocked` | false | '' (no domain row — inter-agent payload) | `cumplify.ai-invoker` |
| `Ai.ArRejected` | false | Draft/record row ID (when one exists) | `cumplify.ai-invoker` |

Registration in `contracts/events.md` AND `services/eventing/src/audit-trail-registry.ts`
BEFORE any publish code (publisher throws on unregistered detailType).

### 8.2 Event Payloads

```typescript
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

### 8.3 General Guardrail Telemetry (TEL-1)

Every guardrail invocation (L1, L2, L3) emits a structured telemetry event:

```typescript
interface GuardrailTelemetry {
  tenantId: string;
  agent: string;
  guardrailPolicy: string;  // 'grounding' | 'relevance' | 'ar:clause-canon' | 'hop:prompt-attack'
  verdict: 'pass' | 'block' | 'flag';
  score: number | null;     // numeric for grounding/relevance; null for AR/hop
  latencyMs: number;
  timestamp: string;
}
```

This is emitted via the existing `emitCreditsTelemetry` pattern (non-blocking
EventBridge put). The consuming dashboards are out of scope (genai-observability spec).

---

## 9. Honest-Miss Templates (INV-2)

### 9.1 Template Design

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

### 9.2 Template Selection

```typescript
// services/ai-invoker/src/honest-miss.ts
export function getHonestMissTemplate(locale: 'en' | 'es' | 'pt'): string {
  return HONEST_MISS_TEMPLATES[locale];
}
```

---

## 10. IAM Statements [REQUIRES-HUMAN]

### 10.1 Existing (already deployed, no change needed)

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:ApplyGuardrail"],
  "Resource": ["*"]
}
```

This already covers:
- `bedrock:InvokeModel` for Titan Embed v2 (EMB-6) — model uses InvokeModel action
- `bedrock:ApplyGuardrail` for L1/L3 guardrail checks (INV-5)

### 10.2 New Statement Required (AR — L2)

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

### 10.3 Human Gate

Both EMB-6 and INV-5 are marked [REQUIRES-HUMAN] in requirements. Since the existing
policy already covers InvokeModel + ApplyGuardrail, the only NET NEW IAM change is
10.2 (`bedrock:InvokeAutomatedReasoningPolicy`). The human gate verifies:

1. Model access enabled for `amazon.titan-embed-text-v2:0` in Bedrock console (EMB-6)
2. AR policy IAM statement approved (L2 prerequisite)
3. CDK Nag suppression for IAM5 (Resource:'*') already exists for the InvokeModel line;
   the AR statement uses account-scoped resource — no new suppression needed.

---

## 11. InvokeRequest/InvokeResponse Extensions

### 11.1 InvokeRequest Additions

```typescript
export interface InvokeRequest {
  // ... existing fields ...
  /** Retrieved KB chunks for grounding check (L1). Omit for non-grounded calls. */
  groundingContext?: {
    source: string;   // concatenated retrieval chunks (≤100k chars)
    query: string;    // original user question
  };
}
```

### 11.2 InvokeResponse Additions

```typescript
export interface InvokeResponse {
  // ... existing fields ...
  /** Guardrail evidence for HITL cards (L5) */
  guardrailEvidence?: {
    groundingScore: number | null;
    relevanceScore: number | null;
    arVerdict: 'pass' | 'fail' | null;
    arDetails: string | null;
    citations: Citation[];
    flagged: boolean;
  };
}

export interface Citation {
  clauseRef: string;
  sourceChunk: string;
  score: number;
}
```

---

## 12. Dependencies & Sequencing

### 12.1 Dependency Graph

```
TEL-6 (event registration) ──┐
                              ├── L1 (grounding checks)
EMB-1..6 (embed door) ───────┤
                              ├── L3 (hop checks)
CDK (guardrail expansion) ───┘
                              
L1 (grounding) ──── L4 (prompt library) ──── L2 (AR policies)
                                              │
                                              └── L5 (HITL contract)
```

### 12.2 Blocking Dependencies

| Task | Blocked By | Reason |
|------|-----------|--------|
| L1 grounding checks (real) | EMB-1..6 + AOSS retrieval | No grounding source without real embeddings (F-B) |
| L2 AR policy attachment | AR policy authoring (interactive) | CFN deploys pre-authored PolicyDefinition only |
| L2 AR IAM | [REQUIRES-HUMAN] approval | bedrock:InvokeAutomatedReasoningPolicy |
| ACC-2 (ungrounded response test) | EMB-1..6 live | Needs real retrieval to produce grounded vs ungrounded |

### 12.3 What Ships Without Embeddings

Even before EMB is live:
- CDK guardrail expansion (grounding policies baked into guardrail config)
- L3 hop checks (no embedding dependency)
- L4 prompt library (pure prompt engineering)
- L5 HITL contract extension (data contract only)
- TEL-6 event registration
- Honest-miss templates

The grounding checks are structurally complete but DORMANT until callers provide
`groundingContext` (which requires real embeddings from EMB + AOSS retrieval).

---

## 13. SOC 2 Impact

### Trust Services Criteria Touched

| Criterion | Control | Evidence |
|-----------|---------|----------|
| CC7.2 (Monitoring) | Guardrail telemetry events feed genai-observability | `Ai.GroundingBlocked`, `Ai.HopBlocked`, `Ai.ArRejected` events |
| CC8.1 (Change Management) | AR policy versioning via pipeline | `AWS::Bedrock::AutomatedReasoningPolicy` in CDK, version-controlled |
| PI1.4 (Processing Integrity) | Hash-chained audit trail for flagged approvals | L5-3 flagged-approval sealed via `Hitl.Approved` (auditTrail: true) |
| CC6.1 (Logical Access) | AR policies encode permission matrix | `role-permissions` AR policy validates advisory responses |
| C1.2 (Confidentiality) | Hop payload screening | L3 blocks prompt injection in inter-agent payloads |

### Evidence Emitted Automatically

- Guardrail invocation telemetry (every check)
- `Ai.GroundingBlocked` / `Ai.HopBlocked` / `Ai.ArRejected` (on block)
- Flagged-approval justification sealed to immutable trail (on human override)
- CDK Nag reports (compliance check at synth time)

---

## 14. Routed Findings (incorporated from prior specs)

| Finding | Resolution in This Design |
|---------|--------------------------|
| F-B (guru handlers skip retrieval — AOSS 401) | EMB-1..6 embed door is the prerequisite. Grounding checks are structurally complete but dormant until callers provide `groundingContext`. |
| F-C (imperative-prompt dependence) | L4 shared prompt library (§6) — structural honesty instructions in `prompts/shared/` |
| spec-4 carry #5 (relative-date hallucination) | L4-7 relative-date instruction in shared prompt library |

---

## 15. Open Questions (Design-Time)

| # | Status | Question | Impact |
|---|--------|----------|--------|
| DQ-1 | OPEN | Whether `CrossRegionConfig` is required ONLY when AR is attached, or always. The docs say "required" for AR guardrails. Confirm during L2 CDK task — if required always, add to agent guardrail immediately. | CDK task ordering |
| DQ-2 | ANSWERED | Grounding check numeric score availability. | `ApplyGuardrail` trace output includes `contextualGroundingPolicy.filters[].score` — confirmed via aws-docs MCP. |
| DQ-3 | OPEN | AR policy source document format. The aws-docs show Variables+Rules+Types format, not natural-language documents. Confirm whether the build workflow can ingest our corpus-map markdown or whether we need to manually author Variables/Rules. | L2-1 task scope |

---

## 16. File Inventory (new/modified)

### New Files
| Path | Purpose |
|------|---------|
| `services/ai-invoker/src/embed.ts` | EMB-1..5: embedding door |
| `services/ai-invoker/src/grounding.ts` | L1: grounding check + section splitting |
| `services/ai-invoker/src/ar-check.ts` | L2: AR validation + steered-regeneration |
| `services/ai-invoker/src/hop-check.ts` | L3: hop payload screening |
| `services/ai-invoker/src/prompt-library.ts` | L4: shared prompt injection |
| `services/ai-invoker/src/honest-miss.ts` | INV-2: honest-miss template loader |
| `prompts/shared/structural-honesty.md` | L4-2 |
| `prompts/shared/licensed-uncertainty.md` | L4-3 |
| `prompts/shared/retrieval-first.md` | L4-6 |
| `prompts/shared/relative-date.md` | L4-7 |
| `prompts/templates/honest-miss.en.md` | INV-2 EN |
| `prompts/templates/honest-miss.es.md` | INV-2 ES |
| `prompts/templates/honest-miss.pt.md` | INV-2 PT |
| `contracts/clause-corpus-map.md` | L2-1 prerequisite |

### Modified Files
| Path | Change |
|------|--------|
| `infra/lib/ai-stack.ts` | Add grounding to AgentGuardrail, add RecordWriteGuardrail, env vars, IAM |
| `services/ai-invoker/src/types.ts` | Extend InvokeRequest/InvokeResponse, add error codes |
| `services/ai-invoker/src/guardrail.ts` | Extended routing (3-guardrail) |
| `services/ai-invoker/src/index.ts` | Orchestration: grounding → AR → hop checks |
| `services/ai-invoker/data/model-weights-seed.json` | Add titan-embed-text-v2:0 weights |
| `services/eventing/src/audit-trail-registry.ts` | Register Ai.* events |
| `contracts/events.md` | Register Ai.* events |
| `services/api/schema/schema.graphql` | Extend GuardrailEvidence + add FlaggedApproval |
