# Guardrails Anti-Hallucination — Tasks

**Spec:** `guardrails-antihallucination` (spec 35)
**Design:** D1 (2026-07-16)
**Lane legend:** [KIRO] = build agent, [ARCHITECT] = architect-witnessed deploy/readback,
[REQUIRES-HUMAN] = owner sign-off before execution

---

## Phase 0: Event Registration & Contracts (prerequisite for all layers)

- [ ] **Task 1 — Register Ai.* telemetry events** [KIRO] D2
  - Add `Ai.GroundingBlocked` (auditTrail: false), `Ai.HopBlocked` (auditTrail: false),
    `Ai.ArRejected` (auditTrail: false) to `contracts/events.md` (Ai domain section)
  - Add same three entries to `services/eventing/src/audit-trail-registry.ts`
  - entityId: draft/record row ID for GroundingBlocked and ArRejected; '' for HopBlocked
  - Parity test (existing) must pass after additions
  - **Evidence:** `npm run test` passes with parity assertion green
  - **ACC mapping:** TEL-6
  - **Refs:** TEL-1..4, BC-4, contracts/events.md envelope (entityId field)

---

## Phase 1: Embedding Door (EMB-1..6)

- [ ] **Task 2 — Add Titan Embed v2 to model-weights-seed.json** [KIRO] D2
  - Add `amazon.titan-embed-text-v2:0` entry to `services/ai-invoker/data/model-weights-seed.json`
  - wIn: priced from Bedrock pricing (verify via aws-pricing MCP); wOut: 0; wCache: null
  - sourceCommit: current HEAD
  - **Evidence:** JSON valid, unit test for computeCredits with embed weights passes
  - **ACC mapping:** EMB-3

- [ ] **Task 3 — Implement embed() function** [KIRO] D2
  - Create `services/ai-invoker/src/embed.ts`
  - Signature: `embed({tenantId, agent, module, feature, text}): Promise<EmbedResult>`
  - Calls `bedrock:InvokeModel` on `amazon.titan-embed-text-v2:0` (body: `{inputText, dimensions: 1024}`)
  - Reads `inputTextTokenCount` from response
  - Loads weights via existing `loadWeights('amazon.titan-embed-text-v2:0')`
  - Computes credits via existing `computeCredits()`
  - Calls `incrementMeter()` and `emitCreditsTelemetry()`
  - Returns `{embedding: number[], tokenCount: number, credits: number}`
  - NOT exported from package index (invoker-internal only, EMB-2)
  - Does NOT implement AOSS retry/backoff (EMB-5)
  - **Evidence:** Unit tests with mocked BedrockRuntimeClient pass; metering logic verified
  - **ACC mapping:** EMB-1, EMB-2, EMB-4, EMB-5

- [ ] **Task 4 — Verify Titan Embed v2 model access** [REQUIRES-HUMAN] D3
  - Confirm `amazon.titan-embed-text-v2:0` model access is enabled in Bedrock console
    for account 697114252993 (us-east-1)
  - Confirm existing IAM (`bedrock:InvokeModel`, Resource: `'*'`) covers Titan Embed
  - No new IAM statement needed — existing policy is sufficient (design §10.1)
  - Note: `cumplify-dev-readonly` profile is DENIED `bedrock:ListAutomatedReasoningPolicies`
    (action too new for ReadOnlyAccess). BC-5 verification goes through `get-guardrail`
    or is architect-witnessed.
  - **Evidence:** Architect-witnessed console screenshot or CLI probe showing model accessible
  - **ACC mapping:** EMB-6, ACC-7 (partial)

---

## Phase 2: CDK Guardrail Expansion (L1-1, L1-2, CDK-1..5)

- [ ] **Task 5 — Expand AgentGuardrail with contextual grounding** [KIRO] D2
  - In `infra/lib/ai-stack.ts`, add `contextualGroundingPolicyConfig` to existing
    `AgentGuardrail` CfnGuardrail construct:
    ```
    contextualGroundingPolicyConfig: {
      filtersConfig: [
        { type: 'GROUNDING', threshold: 0.85 },
        { type: 'RELEVANCE', threshold: 0.75 },
      ],
    }
    ```
  - Preserve ALL existing properties verbatim (L1-2): contentPolicyConfig (PROMPT_ATTACK)
    and sensitiveInformationPolicyConfig (5 PII entities) — NO changes to those
  - Do NOT touch `DocGenGuardrail` (scope boundary: spec-40 deterministic checker)
  - **Evidence:** `cdk synth` passes, CDK Nag clean, NagReport CSV shows no new findings
  - **ACC mapping:** L1-1, L1-2, CDK-1, CDK-2

- [ ] **Task 6 — Add RecordWriteGuardrail** [KIRO] D2
  - Add NEW `RecordWriteGuardrail` CfnGuardrail construct to `infra/lib/ai-stack.ts`
  - Name: `cumplify-recordwrite-guardrail-${envConfig.envName}`
  - Same content + PII policies as AgentGuardrail (PROMPT_ATTACK + 5 PII)
  - Grounding threshold: 0.90, Relevance threshold: 0.75
  - Pass ID/version as env vars: `RECORDWRITE_GUARDRAIL_ID`, `RECORDWRITE_GUARDRAIL_VERSION`
  - Emit `CfnOutput` for guardrail ID and version (F-9 convention, CDK-3)
  - **Evidence:** `cdk synth` passes, CDK Nag clean, outputs present in cdk-outputs.json
  - **ACC mapping:** CDK-1, CDK-3, CDK-4, INV-1

- [ ] **Task 7 — Deploy guardrail expansion to dev** [ARCHITECT] D3
  - Deploy AiStack update to dev account (697114252993)
  - Readback via `aws bedrock get-guardrail` (readonly profile) confirms:
    - AgentGuardrail: PROMPT_ATTACK present, 5 PII present, grounding 0.85, relevance 0.75
    - RecordWriteGuardrail: PROMPT_ATTACK present, 5 PII present, grounding 0.90, relevance 0.75
    - DocGenGuardrail: UNCHANGED (PROMPT_ATTACK + SSN/card only, no grounding)
  - **Evidence:** Readback table with timestamp, exit code, guardrail IDs, policy configs
  - **ACC mapping:** ACC-6

---

## Phase 3: Invoker Integration (L1, INV-1..4)

- [ ] **Task 8 — Extend guardrail routing (3-guardrail)** [KIRO] D2
  - Update `services/ai-invoker/src/guardrail.ts`:
    - `buildGuardrailConfig(seat, feature?)` — add `feature` parameter
    - Route: doc-composer → DOCGEN, feature==='record-write' → RECORDWRITE, else → GUARDRAIL
  - Update `services/ai-invoker/src/index.ts` to pass `feature` to `buildGuardrailConfig`
  - Add `RECORDWRITE_GUARDRAIL_ID` and `RECORDWRITE_GUARDRAIL_VERSION` env var reads
  - **Evidence:** Unit tests for all three routing paths pass
  - **ACC mapping:** INV-1, CDK-4

- [ ] **Task 9 — Implement grounding check module** [KIRO] D2
  - Create `services/ai-invoker/src/grounding.ts`:
    - `splitForGroundingCheck(text: string): string[]` — markdown header split, 4k fallback
    - `checkGrounding(params): Promise<GroundingResult>` — ApplyGuardrail call with qualifiers
    - `parseGroundingResponse(response): GroundingResult` — extract scores + verdict
  - GroundingResult: `{verdict: 'pass'|'blocked', groundingScore: number, relevanceScore: number}`
  - Uses ApplyGuardrail with `source: 'OUTPUT'` and qualifier blocks (design §3.3)
  - **Evidence:** Unit tests with mocked ApplyGuardrail responses (pass + block scenarios)
  - **ACC mapping:** L1-3, L1-4, L1-5, L1-6, INV-4

- [ ] **Task 10 — Implement grounding retry + honest-miss flow** [KIRO] D2
  - In `services/ai-invoker/src/grounding.ts`:
    - `retryWithGroundingInjection(request, chunks): Promise<InvokeResponse>` — re-invoke
      with chunks verbatim + "answer only from the source" instruction (L1-7)
    - On second failure: replace response with honest-miss template (L1-8)
    - Emit `Ai.GroundingBlocked` via `publishAuditEvent` with entityId
  - Temperature enforcement: record-write paths capped at 0.3 (L4-5)
  - Non-streaming invariant: throw if record-write + streaming attempted (L1-9, INV-3)
  - **Evidence:** Unit tests: retry-pass path, retry-fail→honest-miss path, event emission
  - **ACC mapping:** L1-7, L1-8, L1-9, INV-3, ACC-2 (unit-level)

- [ ] **Task 11 — Honest-miss templates (EN/ES/PT)** [KIRO] D2
  - Create `prompts/templates/honest-miss.en.md`, `.es.md`, `.pt.md`
  - Templates make NO factual claims about standards (INV-2)
  - Create `services/ai-invoker/src/honest-miss.ts` — locale-aware template loader
  - **Evidence:** Templates exist, loader returns correct locale content, no clauseRefs in text
  - **ACC mapping:** INV-2

- [ ] **Task 12 — Extend InvokeRequest/InvokeResponse types** [KIRO] D2
  - In `services/ai-invoker/src/types.ts`:
    - Add `groundingContext?: { source: string; query: string }` to `InvokeRequest`
    - Add `guardrailEvidence?: GuardrailEvidenceData` to `InvokeResponse`
    - Add `'GROUNDING_BLOCKED' | 'AR_REJECTED' | 'HOP_BLOCKED' | 'STREAMING_BLOCKED'`
      to `InvokeErrorCode`
  - Define `GuardrailEvidenceData` and `Citation` interfaces
  - **Evidence:** TypeScript compiles clean (`tsc --noEmit`)
  - **ACC mapping:** L5-4 (data contract)

- [ ] **Task 13 — Integrate grounding into invoke() orchestration** [KIRO] D2
  - Update `services/ai-invoker/src/index.ts`:
    - After `converse()`, if `request.groundingContext` is present:
      1. Call `splitForGroundingCheck()` on response text
      2. For each section: `checkGrounding()` using appropriate guardrail (advisory vs record-write)
      3. On block: `retryWithGroundingInjection()` flow
    - Attach `guardrailEvidence` to InvokeResponse
    - Pass `feature` to `buildGuardrailConfig(seat, feature)`
  - Grounding check is DORMANT when `groundingContext` is absent (no-op path)
  - **Evidence:** Integration test (mocked Bedrock): full invoke with groundingContext triggers
    grounding check; invoke without groundingContext skips it
  - **ACC mapping:** ACC-1, ACC-2 (mocked level)

---

## Phase 4: Layer 3 — Hop Check

- [ ] **Task 14 — Implement hop guardrail check** [KIRO] D2
  - Create `services/ai-invoker/src/hop-check.ts`:
    - `checkHopPayload(params): Promise<HopCheckResult>` — ApplyGuardrail on
      serialized tool-use payload with `source: 'INPUT'`
    - Uses agent guardrail (content + PII policies, grounding not relevant for hops)
    - On BLOCK: emit `Ai.HopBlocked`, return structured error
    - Payload sanitization: summary only, no PII in event
  - **Evidence:** Unit tests: clean payload passes, injection payload blocks + event emitted
  - **ACC mapping:** L3-1, L3-2, L3-3, L3-4, ACC-4 (unit-level)

- [ ] **Task 15 — Integrate hop check into invoke() tool-use path** [KIRO] D2
  - In `services/ai-invoker/src/index.ts`:
    - When `stopReason === 'tool_use'` and tool name matches agent-routing pattern:
      serialize the tool input, call `checkHopPayload()`
    - On block: halt, return error (do not route to target agent)
  - Define agent-routing tool name registry (which tools represent agent hops)
  - **Evidence:** Integration test (mocked): tool-use response with injection → blocked
  - **ACC mapping:** ACC-4

---

## Phase 5: Layer 4 — Shared Prompt Library

- [ ] **Task 16 — Create shared prompt library** [KIRO] D2
  - Create `prompts/shared/structural-honesty.md` (L4-2: citation-or-silence rule)
  - Create `prompts/shared/licensed-uncertainty.md` (L4-3: "standard does not specify")
  - Create `prompts/shared/retrieval-first.md` (L4-6: retrieve before asserting)
  - Create `prompts/shared/relative-date.md` (L4-7: no absolute dates from memory; spec-4 carry #5)
  - Prompts are factual instructions, not themselves making claims about standards
  - **Evidence:** Files exist, content reviewed for factual-claim-freedom
  - **ACC mapping:** L4-1, L4-2, L4-3, L4-6, L4-7

- [ ] **Task 17 — Implement prompt-library injection in invoker** [KIRO] D2
  - Create `services/ai-invoker/src/prompt-library.ts`:
    - `buildSystemPrompt(basePrompt: string): string` — prepends shared instructions
    - Loads prompt files at build time (esbuild inline or template literals)
  - Update `services/ai-invoker/src/index.ts`:
    - Wrap `request.system` through `buildSystemPrompt()` before passing to `converse()`
  - **Evidence:** Unit test: `buildSystemPrompt('base')` contains all four shared blocks
  - **ACC mapping:** L4-1

- [ ] **Task 18 — Temperature enforcement for record-write** [KIRO] D2
  - In `services/ai-invoker/src/index.ts`:
    - After resolving temperature from request/defaults:
      if `feature === 'record-write' && temperature > 0.3` → cap to 0.3
  - **Evidence:** Unit test: editor-ai seat (0.4 default) + feature='record-write' → temp=0.3
  - **ACC mapping:** L4-5

---

## Phase 6: Layer 2 — Automated Reasoning Policies

- [ ] **Task 19 — Author contracts/clause-corpus-map.md** [KIRO] D2
  - Extract `{standard, edition, clause_number, title}` tuples from
    `docs/architecture/iso-requirements-map.md`
  - Format as structured markdown table (BC-2: tuples only, NO ISO body text)
  - Covers ISO 9001:2015, ISO 14001:2015, ISO 45001:2018 — all sub-clauses
  - **Evidence:** File exists, grep confirms no prose beyond tuple fields,
    all three standards represented
  - **ACC mapping:** L2-1 (prerequisite)

- [ ] **Task 20 — Create clause-canon AR policy (interactive)** [ARCHITECT] D3
  - Using Bedrock console or API (`create-automated-reasoning-policy`):
    1. Upload `contracts/clause-corpus-map.md` as source document
    2. Review extracted Variables/Rules/Types in fidelity report
    3. If build workflow cannot ingest markdown tuples: manually author
       Variables + Rules encoding valid clause tuples (DQ-3 resolution)
    4. Save version, export PolicyDefinition JSON
  - **Evidence:** Policy ARN recorded, PolicyDefinition JSON exported to
    `infra/data/ar-policies/clause-canon.json`
  - **ACC mapping:** L2-1, L2-4

- [ ] **Task 21 — Author role-permissions AR policy** [ARCHITECT] D3
  - Encode Part 13 permission matrix (12 roles x module permissions) and SoD rules:
    - author ≠ approver
    - auditor-independence
    - incident-investigator ≠ area-supervisor
  - Interactive authoring via console/API, export PolicyDefinition
  - **Evidence:** Policy ARN recorded, PolicyDefinition JSON at
    `infra/data/ar-policies/role-permissions.json`
  - **ACC mapping:** L2-2

- [ ] **Task 22 — Author plan-entitlements AR policy** [ARCHITECT] D3
  - Encode tier → standards/seats/features truth table from billing architecture
  - Interactive authoring via console/API, export PolicyDefinition
  - **Evidence:** Policy ARN recorded, PolicyDefinition JSON at
    `infra/data/ar-policies/plan-entitlements.json`
  - **ACC mapping:** L2-3

- [ ] **Task 23 — Deploy AR policies via CDK** [KIRO] D2
  - Add `AWS::Bedrock::AutomatedReasoningPolicy` resources to `infra/lib/ai-stack.ts`:
    - `ClauseCanonPolicy` — PolicyDefinition from `infra/data/ar-policies/clause-canon.json`
    - `RolePermissionsPolicy` — from `infra/data/ar-policies/role-permissions.json`
    - `PlanEntitlementsPolicy` — from `infra/data/ar-policies/plan-entitlements.json`
  - Attach to guardrails via `AutomatedReasoningPolicyConfig`:
    - AgentGuardrail: all three policies
    - RecordWriteGuardrail: clause-canon only
  - Add `CrossRegionConfig` to both guardrails (REQUIRED for AR):
    ```
    crossRegionConfig: {
      guardrailProfileIdentifier:
        `arn:aws:bedrock:us-east-1:${account}:guardrail-profile/us.guardrail.v1:0`
    }
    ```
  - **Evidence:** `cdk synth` passes, CDK Nag clean
  - **ACC mapping:** L2-7, CDK-1
  - **Blocked by:** Tasks 20, 21, 22 (PolicyDefinition JSONs must exist)

- [ ] **Task 24 — AR IAM statement** [REQUIRES-HUMAN] D3
  - Add `bedrock:InvokeAutomatedReasoningPolicy` to invoker role:
    ```
    Resource: arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*
    ```
  - Owner sign-off before deploy
  - **Evidence:** Architect-witnessed IAM readback showing the new statement
  - **ACC mapping:** ACC-7 (partial)

- [ ] **Task 25 — Implement AR check module** [KIRO] D2
  - Create `services/ai-invoker/src/ar-check.ts`:
    - `checkArPolicy(params): Promise<ArCheckResult>` — ApplyGuardrail with AR-attached guardrail
    - `steeredRegeneration(request, arFeedback): Promise<InvokeResponse>` — retry with
      AR rejection feedback injected (same pattern as schema-retry.ts)
    - On second failure: flag for HITL, emit `Ai.ArRejected`
  - ArCheckResult: `{verdict, invalidClaim?, reason?, suggestedCorrection?}`
  - **Evidence:** Unit tests: AR pass, AR reject→corrected on retry, AR reject→HITL-deferred
  - **ACC mapping:** L2-5, L2-6, ACC-3 (unit-level)

- [ ] **Task 26 — Integrate AR into invoke() orchestration** [KIRO] D2
  - In `services/ai-invoker/src/index.ts`:
    - After grounding check passes (or if no grounding context):
      if invocation path is clause-citing (guru seats, copilot, record-write):
      call `checkArPolicy()` using the appropriate guardrail
    - On AR rejection: `steeredRegeneration()` flow
    - Attach AR verdict to `guardrailEvidence` on InvokeResponse
  - AR check is DORMANT until AR policies are deployed (Task 23)
  - **Evidence:** Integration test (mocked): AR rejection triggers regen; double-fail → HITL flag
  - **ACC mapping:** ACC-3

- [ ] **Task 27 — Deploy AR expansion to dev** [ARCHITECT] D3
  - Deploy AiStack with AR policies + IAM to dev account
  - Readback: `aws bedrock get-guardrail` confirms AR policies attached
  - Readback: IAM role has `bedrock:InvokeAutomatedReasoningPolicy`
  - **Evidence:** Readback table with timestamp, exit code, policy ARNs, guardrail configs
  - **ACC mapping:** ACC-6, ACC-7
  - **Blocked by:** Tasks 23, 24

---

## Phase 7: Layer 5 — HITL Card Data Contract

- [ ] **Task 28 — Extend GuardrailEvidence GraphQL type** [KIRO] D2
  - In `services/api/schema/schema.graphql`:
    - Add `relevanceScore: Float` to `GuardrailEvidence`
    - Add `flagged: Boolean` to `GuardrailEvidence`
    - Add `flaggedApproval: FlaggedApproval` to `GuardrailEvidence`
    - Add new type: `FlaggedApproval @aws_lambda { justification: String!, approverSub: String!, timestamp: AWSDateTime! }`
  - Schema-guard test must pass (no extend blocks, directives present)
  - **Evidence:** `npm run test` passes (schema-guard + tsc)
  - **ACC mapping:** L5-1, L5-4
  - **Note:** Single-source SDL edit only (no duplicate type definitions)

- [ ] **Task 29 — L5-2 flagged-approval justification enforcement** [KIRO] D2
  - In the HITL approval resolver (existing `Hitl.Approved` path):
    - When `guardrailEvidence.flagged === true`:
      REQUIRE `justification` field in mutation input (reject without it)
    - Stamp `flaggedApproval` object on the sealed event payload
  - The sealed event routes to audit-sink via existing R-3 pattern (`auditTrail: true`)
  - **Evidence:** Unit test: approve flagged item without justification → error;
    with justification → sealed event contains flaggedApproval
  - **ACC mapping:** L5-2, L5-3, ACC-5

---

## Phase 8: Integration Acceptance Tests

- [ ] **Task 30 — ACC-1: Grounded advisory response passes** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Invoke with groundingContext, response grounding score > 0.85
    - Assert: response delivered unmodified, no `Ai.GroundingBlocked` event
    - Assert: `guardrailEvidence.groundingScore` present on response
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-1

- [ ] **Task 31 — ACC-2: Ungrounded response → honest-miss** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Invoke with groundingContext, response grounding score < 0.85
    - First retry also fails
    - Assert: response replaced by honest-miss template
    - Assert: `Ai.GroundingBlocked` event emitted with correct payload
  - **Note:** Full live ACC-2 requires real embeddings (EMB-1..6 + AOSS retrieval).
    This test validates the invoker flow with mocked ApplyGuardrail responses.
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-2

- [ ] **Task 32 — ACC-3: Invalid clause → AR reject → HITL** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Record-write invoke, response cites non-existent clause
    - AR policy rejects, steered-regeneration also fails
    - Assert: draft flagged for HITL with AR verdict
    - Assert: `Ai.ArRejected` event emitted
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-3

- [ ] **Task 33 — ACC-4: Hop injection → blocked** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Invoke returns tool_use with prompt-injection in payload
    - Hop check blocks
    - Assert: `Ai.HopBlocked` event emitted, chain halted
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-4

- [ ] **Task 34 — ACC-5: Flagged draft approval requires justification** [KIRO] D2
  - Integration test:
    - Create HitlItem with `guardrailEvidence.flagged = true`
    - Attempt approval without justification → assert error
    - Approve with justification → assert sealed event contains `flaggedApproval`
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-5

- [ ] **Task 35 — ACC-6/7: Deployed guardrail + IAM readback** [ARCHITECT] D3
  - Post-deploy readback (dev account, readonly profile):
    - AgentGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.85 + relevance 0.75 + AR policies
    - RecordWriteGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.90 + relevance 0.75 + clause-canon
    - DocGenGuardrail: UNCHANGED (no grounding, no AR)
    - IAM: `bedrock:InvokeModel` (Resource:*) + `bedrock:ApplyGuardrail` (Resource:*) +
      `bedrock:InvokeAutomatedReasoningPolicy` (account-scoped)
  - **Evidence:** Readback table with all guardrail configs, IAM statements, timestamp, exit code,
    git blob SHA of cdk-outputs.json
  - **ACC mapping:** ACC-6, ACC-7
  - **Blocked by:** Tasks 7, 27

---

## Summary: ACC → Task Mapping

| ACC | Primary Tasks | D-Rung |
|-----|---------------|--------|
| ACC-1 | Task 30 (test), Tasks 9+13 (implementation) | D2 (mocked); live when embed + retrieval wired |
| ACC-2 | Task 31 (test), Tasks 10+11+13 (implementation) | D2 (mocked); live when embed + retrieval wired |
| ACC-3 | Task 32 (test), Tasks 25+26 (implementation) | D2 (mocked); D3 after Task 27 deploy |
| ACC-4 | Task 33 (test), Tasks 14+15 (implementation) | D2 (mocked); D3 after Task 7 deploy |
| ACC-5 | Task 34 (test), Tasks 28+29 (implementation) | D2 |
| ACC-6 | Task 35 (readback) | D3 — deployed + read back |
| ACC-7 | Task 35 (readback) | D3 — deployed + read back |

---

## Lane Distribution

| Lane | Tasks |
|------|-------|
| [KIRO] | 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 28, 29, 30, 31, 32, 33, 34 |
| [ARCHITECT] | 7, 20, 21, 22, 27, 35 |
| [REQUIRES-HUMAN] | 4, 24 |
