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
