# Guardrails Anti-Hallucination — Tasks

**Spec:** `guardrails-antihallucination` (spec 35)
**Design:** D2 (2026-07-16)
**Lane legend:** [KIRO] = build agent, [ARCHITECT] = architect-witnessed deploy/readback,
[REQUIRES-HUMAN] = owner sign-off before execution

---

## Phase 0: Event Registration & Contracts (prerequisite for all layers)

- [ ] **Task 1 — Register Ai.* telemetry events** [KIRO] D2
  - Add to `contracts/events.md` (new Ai domain section):
    - `Ai.GuardrailChecked` (auditTrail: false) — per-invocation telemetry (M-1)
    - `Ai.GroundingBlocked` (auditTrail: false) — grounding block event
    - `Ai.HopBlocked` (auditTrail: false) — hop block event
    - `Ai.ArRejected` (auditTrail: false) — AR rejection event
  - Add same four entries to `services/eventing/src/audit-trail-registry.ts`
  - entityId: '' for all four (auditTrail:false, never ledgered; hitlItemId when known for tracing)
  - Parity test (existing) must pass after additions
  - **Evidence:** `npm run test` passes with parity assertion green
  - **ACC mapping:** TEL-6, TEL-1
  - **Refs:** BC-4, contracts/events.md envelope (entityId field), design §9.1

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

- [ ] **Task 4 — Confirm Titan Embed v2 IAM sufficiency** [REQUIRES-HUMAN] D3
  - Model access PROVEN LIVE (architect micro-invoke 2026-07-16: 1024 dims + inputTextTokenCount)
  - Remaining scope: owner sign-off confirming existing IAM (`bedrock:InvokeModel`, Resource:'*')
    is sufficient — no new statement needed (design §11.1)
  - **Evidence:** Owner sign-off recorded
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
  - NO CrossRegionConfig on this guardrail (H-2: grounding-only)
  - Do NOT touch `DocGenGuardrail` (scope boundary: spec-40 deterministic checker)
  - **Evidence:** `cdk synth` passes, CDK Nag clean, NagReport CSV shows no new findings
  - **ACC mapping:** L1-1, L1-2, CDK-1, CDK-2

- [ ] **Task 6 — Add RecordWriteGuardrail + ArCheckGuardrail** [KIRO] D2
  - Add NEW `RecordWriteGuardrail` CfnGuardrail construct to `infra/lib/ai-stack.ts`:
    - Name: `cumplify-recordwrite-guardrail-${envConfig.envName}`
    - Same content + PII policies as AgentGuardrail (PROMPT_ATTACK + 5 PII)
    - Grounding 0.90, Relevance 0.75; NO CrossRegionConfig
    - Pass ID/version as env vars: `RECORDWRITE_GUARDRAIL_ID`, `RECORDWRITE_GUARDRAIL_VERSION`
  - Add NEW `ArCheckGuardrail` CfnGuardrail construct:
    - Name: `cumplify-archeck-guardrail-${envConfig.envName}`
    - AR policies ONLY + CrossRegionConfig (`us.guardrail.v1:0`)
    - NO content/PII/grounding policies
    - Pass ID/version as env vars: `ARCHECK_GUARDRAIL_ID`, `ARCHECK_GUARDRAIL_VERSION`
    - Note: blocked until AR policies deployed (Task 23); stub with empty policies initially
  - Emit `CfnOutput` for all new guardrail IDs and versions (F-9 convention, CDK-3)
  - **Evidence:** `cdk synth` passes, CDK Nag clean, outputs present in synthesized template
  - **ACC mapping:** CDK-1, CDK-3, CDK-4, INV-1
  - **Note:** ArCheckGuardrail fully wired only after Tasks 20-23 (AR policy JSONs)

- [ ] **Task 7 — Deploy guardrail expansion to dev + empirical probes** [ARCHITECT] D3
  - Deploy AiStack update to dev account (697114252993)
  - Readback via `aws bedrock get-guardrail` (readonly profile) confirms:
    - AgentGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.85 + relevance 0.75, NO CrossRegionConfig
    - RecordWriteGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.90 + relevance 0.75
    - DocGenGuardrail: UNCHANGED (PROMPT_ATTACK + SSN/card only, no grounding)
  - **(M-4a) EMPIRICAL no-source probe:** live agent invoke WITHOUT grounding source,
    assert NOT blocked (pin skip-when-absent behavior; don't trust docs prose alone)
  - **(M-4b) Weight seed verification:** confirm DDB row `MODELWEIGHT#amazon.titan-embed-text-v2:0`
    exists (Task 2 edits seed JSON; the custom-resource seeder must have run to create the row)
  - **Evidence:** Readback table with timestamp, exit code, guardrail IDs, policy configs;
    no-source probe output; DDB GetItem result for weight row
  - **ACC mapping:** ACC-6 (partial)

---

## Phase 3: Invoker Integration (L1, INV-1..4)

- [ ] **Task 8 — Extend guardrail routing (4-guardrail)** [KIRO] D2
  - Update `services/ai-invoker/src/guardrail.ts`:
    - `buildGuardrailConfig(seat, feature?)` — add `feature` parameter
    - Route: doc-composer → DOCGEN, feature==='record-write' → RECORDWRITE, else → GUARDRAIL
    - NEW: `buildArCheckGuardrailConfig()` — returns ARCHECK_GUARDRAIL config
  - Update `services/ai-invoker/src/index.ts` to pass `feature` to `buildGuardrailConfig`
  - Add env var reads: `RECORDWRITE_GUARDRAIL_*`, `ARCHECK_GUARDRAIL_*`
  - **Evidence:** Unit tests for all four routing paths pass
  - **ACC mapping:** INV-1, CDK-4

- [ ] **Task 9 — Implement grounding check module** [KIRO] D2
  - Create `services/ai-invoker/src/grounding.ts`:
    - `splitForGroundingCheck(text: string): string[]` — markdown header split, 4k fallback
    - `validateGroundingContext(ctx)` — truncate source at 100k, query at 1,000 chars (M-3)
    - `checkGrounding(params): Promise<GroundingResult>` — ApplyGuardrail call with qualifiers
    - `parseGroundingResponse(response): GroundingResult` — extract scores + verdict
    - `buildCitations(groundingSource, scores): Citation[]` — citation construction (§4.3)
  - GroundingResult: `{verdict: 'pass'|'blocked', groundingScore: number, relevanceScore: number}`
  - Uses ApplyGuardrail with `source: 'OUTPUT'` and qualifier blocks (design §3.3)
  - **Evidence:** Unit tests with mocked ApplyGuardrail responses (pass + block scenarios);
    truncation tests for query > 1000 chars and source > 100k chars
  - **ACC mapping:** L1-3, L1-4, L1-5, L1-6, INV-4

- [ ] **Task 10 — Implement grounding retry + honest-miss flow** [KIRO] D2
  - In `services/ai-invoker/src/grounding.ts`:
    - `retryWithGroundingInjection(request, chunks): Promise<ConverseResult>` — re-invoke
      with chunks verbatim + "answer only from the source" instruction (L1-7)
    - On second failure: replace response with honest-miss template (L1-8)
    - Emit `Ai.GroundingBlocked` via eventing `publish()` (entityId: '')
  - Honest-miss locale from `request.locale` (defaults to 'en' — tenant documentLocale)
  - Temperature enforcement: record-write paths capped at 0.3 (L4-5)
  - Non-streaming invariant: throw if record-write + streaming attempted (L1-9, INV-3)
  - **Evidence:** Unit tests: retry-pass path, retry-fail→honest-miss path, event emission
  - **ACC mapping:** L1-7, L1-8, L1-9, INV-3, ACC-2 (unit-level)

- [ ] **Task 11 — Honest-miss templates (EN/ES/PT)** [KIRO] D2
  - Create `prompts/templates/honest-miss.en.md`, `.es.md`, `.pt.md`
  - Templates make NO factual claims about standards (INV-2)
  - Create `services/ai-invoker/src/honest-miss.ts`:
    - `getHonestMissTemplate(locale: SupportedLocale): string`
    - Locale from tenant documentLocale (passed as `InvokeRequest.locale`)
  - **Evidence:** Templates exist, loader returns correct locale content, no clauseRefs in text
  - **ACC mapping:** INV-2

- [ ] **Task 12 — Extend InvokeRequest/InvokeResponse types** [KIRO] D2
  - In `services/ai-invoker/src/types.ts`:
    - Add `groundingContext?: { source: string; query: string }` to `InvokeRequest`
    - Add `locale?: 'en' | 'es' | 'pt'` to `InvokeRequest`
    - Add `guardrailEvidence?: GuardrailEvidenceData` to `InvokeResponse`
    - Add `'GROUNDING_BLOCKED' | 'AR_REJECTED' | 'HOP_BLOCKED' | 'STREAMING_BLOCKED'`
      to `InvokeErrorCode`
  - Define `GuardrailEvidenceData` and `Citation` interfaces
  - **Evidence:** TypeScript compiles clean (`tsc --noEmit`)
  - **ACC mapping:** L5-4 (data contract)

- [ ] **Task 13 — Integrate grounding into invoke() orchestration** [KIRO] D2
  - Update `services/ai-invoker/src/index.ts`:
    - Wrap `request.system` through `buildSystemPrompt()` (§7.2)
    - After `converse()`, if `request.groundingContext` is present:
      1. `validateGroundingContext()` — enforce caps (M-3)
      2. `splitForGroundingCheck()` on response text
      3. For each section: `checkGrounding()` using appropriate guardrail
      4. Emit `Ai.GuardrailChecked` telemetry per check
      5. On block: `retryWithGroundingInjection()` flow
    - Attach `guardrailEvidence` (with citations) to InvokeResponse
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
    - Uses agent guardrail (content + PII policies; grounding not relevant for hops)
    - On BLOCK: emit `Ai.HopBlocked` via eventing `publish()`, return structured error
    - Emit `Ai.GuardrailChecked` telemetry for each check
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
    - Loads prompt content at build time (esbuild inline via static import)
  - Update `services/ai-invoker/src/index.ts`:
    - Wrap `request.system` through `buildSystemPrompt()` before passing to `converse()`
  - **Evidence:** Unit test: `buildSystemPrompt('base')` contains all four shared blocks +
    base prompt at the end
  - **ACC mapping:** L4-1

- [ ] **Task 18 — Temperature enforcement for record-write** [KIRO] D2
  - In `services/ai-invoker/src/index.ts`:
    - After resolving temperature from request/defaults:
      if `feature === 'record-write' && temperature > 0.3` → cap to 0.3
  - **Evidence:** Unit test: editor-ai seat (0.4 default) + feature='record-write' → temp=0.3
  - **ACC mapping:** L4-5

---

## Phase 6: Handler Wiring (H-1)

- [ ] **Task 19 — Wire guru + copilot handlers with embed→retrieve→groundingContext** [KIRO] D2
  - Update `services/agents/guru-9001/handler.ts`, `guru-14001/handler.ts`,
    `guru-45001/handler.ts`, `services/agents/copilot/handler.ts`:
    1. Call invoker `embed({text: userQuestion, tenantId, agent, module, feature: 'advisory'})`
    2. Call AOSS `retrieve({vector: embedding, tenantId, ...})` under 45-second budget (L1-11)
       using the existing shared retrieve() wrapper with exponential backoff
    3. Concatenate retrieved chunks (delimiter: `\n---\n`) → groundingSource
    4. Pass `groundingContext: { source: groundingSource, query: userQuestion.slice(0,1000) }`
       and `locale: tenantDocumentLocale` to `invoke()`
  - L1-11 lives HERE: the 45-second AOSS cold-start budget is the handler's
    responsibility (not the invoker's — per EMB-5 and design §4.2)
  - **Evidence:** Unit tests with mocked embed + mocked AOSS: groundingContext correctly
    assembled and passed to invoke; query truncated at 1000 chars
  - **ACC mapping:** L1-11, EMB-5 (caller contract)

- [ ] **Task 20 — Live ACC-1/ACC-2 readback** [ARCHITECT] D3
  - Post-deploy (handler wiring live in dev):
    - **(ACC-1)** Ask a grounded question (answer exists in KB) → assert: response delivered,
      no `Ai.GroundingBlocked` event emitted, `guardrailEvidence.groundingScore` present
    - **(ACC-2)** Ask a fabricated-clause question (no KB source) → assert: response is
      honest-miss template, `Ai.GroundingBlocked` event emitted with correct payload
  - **Evidence:** Readback with question/response pairs, event log, timestamps
  - **ACC mapping:** ACC-1, ACC-2 (live D3 proof)
  - **Blocked by:** Tasks 7, 19 deployed

---

## Phase 7: Layer 2 — Automated Reasoning Policies

- [ ] **Task 21 — Author contracts/clause-corpus-map.md** [KIRO] D2
  - Extract `{standard, edition, clause_number, title}` tuples from
    `docs/architecture/iso-requirements-map.md`
  - Format as structured markdown table (BC-2: tuples only, NO ISO body text)
  - Covers ISO 9001:2015, ISO 14001:2015, ISO 45001:2018 — all sub-clauses
  - **Evidence:** File exists, grep confirms no prose beyond tuple fields,
    all three standards represented
  - **ACC mapping:** L2-1 (prerequisite)

- [ ] **Task 22 — Create clause-canon AR policy (interactive)** [ARCHITECT] D3
  - Using Bedrock console or API (`create-automated-reasoning-policy`):
    1. Upload `contracts/clause-corpus-map.md` as source document
    2. Review extracted Variables/Rules/Types in fidelity report
    3. If build workflow cannot ingest markdown tuples (DQ-3): manually author
       Variables + Rules encoding valid clause tuples
    4. Save version, export PolicyDefinition JSON
  - **Evidence:** Policy ARN recorded, PolicyDefinition JSON exported to
    `infra/data/ar-policies/clause-canon.json`
  - **ACC mapping:** L2-1, L2-4

- [ ] **Task 23 — Author role-permissions AR policy** [ARCHITECT] D3
  - Encode Part 13 permission matrix (12 roles x module permissions) and SoD rules:
    - author ≠ approver, auditor-independence, incident-investigator ≠ area-supervisor
  - Interactive authoring via console/API, export PolicyDefinition
  - **Evidence:** Policy ARN recorded, PolicyDefinition JSON at
    `infra/data/ar-policies/role-permissions.json`
  - **ACC mapping:** L2-2

- [ ] **Task 24 — Author plan-entitlements AR policy** [ARCHITECT] D3
  - Encode tier → standards/seats/features truth table from billing architecture
  - Interactive authoring via console/API, export PolicyDefinition
  - **Evidence:** Policy ARN recorded, PolicyDefinition JSON at
    `infra/data/ar-policies/plan-entitlements.json`
  - **ACC mapping:** L2-3

- [ ] **Task 25 — Deploy AR policies + ArCheckGuardrail via CDK** [KIRO] D2
  - Add `AWS::Bedrock::AutomatedReasoningPolicy` resources to `infra/lib/ai-stack.ts`:
    - `ClauseCanonPolicy` — PolicyDefinition from `infra/data/ar-policies/clause-canon.json`
    - `RolePermissionsPolicy` — from `infra/data/ar-policies/role-permissions.json`
    - `PlanEntitlementsPolicy` — from `infra/data/ar-policies/plan-entitlements.json`
  - Wire `ArCheckGuardrail` (from Task 6 stub) with:
    - `automatedReasoningPolicyConfig.policies: [all three ARNs]`
    - `crossRegionConfig.guardrailProfileIdentifier`:
      `arn:aws:bedrock:us-east-1:${account}:guardrail-profile/us.guardrail.v1:0`
  - AgentGuardrail and RecordWriteGuardrail: NO AR, NO CrossRegionConfig (H-2)
  - **Evidence:** `cdk synth` passes, CDK Nag clean
  - **ACC mapping:** L2-7, CDK-1
  - **Blocked by:** Tasks 22, 23, 24 (PolicyDefinition JSONs must exist)

- [ ] **Task 26 — AR IAM statement** [REQUIRES-HUMAN] D3
  - Add `bedrock:InvokeAutomatedReasoningPolicy` to invoker role:
    ```
    Resource: arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*
    ```
  - Owner sign-off before deploy
  - **Evidence:** Architect-witnessed IAM readback showing the new statement
  - **ACC mapping:** ACC-7 (partial)

- [ ] **Task 27 — Implement AR check module** [KIRO] D2
  - Create `services/ai-invoker/src/ar-check.ts`:
    - `checkArPolicy(params): Promise<ArCheckResult>` — ApplyGuardrail using
      ArCheckGuardrail (AR-only, design §1.1)
    - `steeredRegeneration(request, arFeedback): Promise<ConverseResult>` — retry with
      AR rejection feedback injected (same pattern as schema-retry.ts)
    - On second failure: flag for HITL, emit `Ai.ArRejected` via eventing `publish()`
    - Emit `Ai.GuardrailChecked` telemetry per check
  - Optional deterministic pre-filter (§7.4): regex extraction of clauseRefs →
    hash-set lookup against corpus-map. Failed pre-filter → regen without AR API cost.
  - ArCheckResult: `{verdict, invalidClaim?, reason?, suggestedCorrection?}`
  - **Evidence:** Unit tests: AR pass, AR reject→corrected on retry, AR reject→HITL-deferred
  - **ACC mapping:** L2-5, L2-6, ACC-3 (unit-level)

- [ ] **Task 28 — Integrate AR into invoke() orchestration** [KIRO] D2
  - In `services/ai-invoker/src/index.ts`:
    - After grounding check passes (or if no grounding context):
      if invocation path is clause-citing (guru seats, copilot, record-write):
      call `checkArPolicy()` using ArCheckGuardrail
    - On AR rejection: `steeredRegeneration()` flow
    - Attach AR verdict to `guardrailEvidence` on InvokeResponse
  - AR check is DORMANT until ArCheckGuardrail has policies (Task 25 deployed)
  - **Evidence:** Integration test (mocked): AR rejection triggers regen; double-fail → HITL flag
  - **ACC mapping:** ACC-3

- [ ] **Task 29 — Deploy AR expansion to dev** [ARCHITECT] D3
  - Deploy AiStack with AR policies + ArCheckGuardrail + IAM to dev account
  - Readback: `aws bedrock get-guardrail` confirms:
    - ArCheckGuardrail: 3 AR policies attached, CrossRegionConfig present
    - AgentGuardrail/RecordWriteGuardrail: NO AR, NO CrossRegionConfig
  - Readback: IAM role has `bedrock:InvokeAutomatedReasoningPolicy`
  - **Evidence:** Readback table with timestamp, exit code, policy ARNs, guardrail configs
  - **ACC mapping:** ACC-6, ACC-7
  - **Blocked by:** Tasks 25, 26

---

## Phase 8: Layer 5 — HITL Card Data Contract + Producer Chain (H-3)

- [ ] **Task 30 — Extend GuardrailEvidence GraphQL type** [KIRO] D2
  - In `services/api/schema/schema.graphql`:
    - Add `relevanceScore: Float` to `GuardrailEvidence`
    - Add `flagged: Boolean` to `GuardrailEvidence`
    - Add `flaggedApproval: FlaggedApproval` to `GuardrailEvidence`
    - Add new type: `FlaggedApproval @aws_lambda { justification: String!, approverSub: String!, timestamp: AWSDateTime! }`
  - Schema-guard test must pass (no extend blocks, directives present)
  - **Evidence:** `npm run test` passes (schema-guard + tsc)
  - **ACC mapping:** L5-1, L5-4
  - **Note:** Single-source SDL edit only (no duplicate type definitions)

- [ ] **Task 31 — L5 producer chain: guardrailEvidence → store-token → DDB** [KIRO] D2
  - Extend `services/agents/shared/store-token.ts`:
    - Add `guardrailEvidence?: GuardrailEvidenceData` to `StoreTokenInput.input` interface
    - Add `guardrailEvidence = :evidence` to the UpdateExpression
    - Marshall as DynamoDB map attribute
  - Agent handlers (guru-*, copilot) pass `invokeResponse.guardrailEvidence` through
    to `enterHitlGate()` → store-token input when gating a draft for HITL
  - Citation construction happens in the invoker (§4.3, Task 9's `buildCitations()`):
    - Split groundingSource on `\n---\n` delimiter
    - Extract clauseRef from chunk metadata prefix `[ISO XXXXX X.X]`
    - Attach per-section grounding scores
    - Return top-5 citations sorted by score
  - **Evidence:** Unit test: store-token with guardrailEvidence → DDB item contains
    marshalled evidence map; handler integration test passes evidence through
  - **ACC mapping:** L5-1 (producer), H-3

- [ ] **Task 32 — L5-2 flagged-approval justification enforcement** [KIRO] D2
  - In the HITL approval resolver (existing `Hitl.Approved` path):
    - When `guardrailEvidence.flagged === true`:
      REQUIRE `justification` field in mutation input (reject without it)
    - Stamp `flaggedApproval` object on the sealed event payload
  - The sealed event routes to audit-sink via existing R-3 pattern (`auditTrail: true`)
  - **Evidence:** Unit test: approve flagged item without justification → error;
    with justification → sealed event contains flaggedApproval
  - **ACC mapping:** L5-2, L5-3, ACC-5

---

## Phase 9: Integration Acceptance Tests

- [ ] **Task 33 — ACC-1: Grounded advisory response passes (mocked)** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Invoke with groundingContext, response grounding score > 0.85
    - Assert: response delivered unmodified, no `Ai.GroundingBlocked` event
    - Assert: `guardrailEvidence.groundingScore` present on response
    - Assert: citations array populated
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-1 (D2 mocked level)

- [ ] **Task 34 — ACC-2: Ungrounded response → honest-miss (mocked)** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Invoke with groundingContext, response grounding score < 0.85
    - First retry also fails
    - Assert: response replaced by honest-miss template (correct locale)
    - Assert: `Ai.GroundingBlocked` event emitted with correct payload (entityId: '')
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-2 (D2 mocked level)

- [ ] **Task 35 — ACC-3: Invalid clause → AR reject → HITL (mocked)** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Record-write invoke, response cites non-existent clause
    - AR policy rejects, steered-regeneration also fails
    - Assert: draft flagged for HITL with AR verdict (`guardrailEvidence.flagged = true`)
    - Assert: `Ai.ArRejected` event emitted
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-3

- [ ] **Task 36 — ACC-4: Hop injection → blocked (mocked)** [KIRO] D2
  - Integration test (mocked Bedrock):
    - Invoke returns tool_use with prompt-injection in payload
    - Hop check blocks
    - Assert: `Ai.HopBlocked` event emitted, chain halted
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-4

- [ ] **Task 37 — ACC-5: Flagged draft approval requires justification** [KIRO] D2
  - Integration test:
    - Create HitlItem with `guardrailEvidence.flagged = true` (via store-token)
    - Attempt approval without justification → assert error
    - Approve with justification → assert sealed event contains `flaggedApproval`
  - **Evidence:** Test passes in CI pipeline
  - **ACC mapping:** ACC-5

- [ ] **Task 38 — ACC-6/7: Deployed guardrail + IAM full readback** [ARCHITECT] D3
  - Post-deploy readback (dev account, readonly profile) after ALL guardrails live:
    - AgentGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.85 + relevance 0.75, NO AR
    - RecordWriteGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.90 + relevance 0.75, NO AR
    - ArCheckGuardrail: 3 AR policies, CrossRegionConfig (`us.guardrail.v1:0`), NO content/PII/grounding
    - DocGenGuardrail: UNCHANGED (no grounding, no AR)
    - IAM: `bedrock:InvokeModel` (Resource:*) + `bedrock:ApplyGuardrail` (Resource:*) +
      `bedrock:InvokeAutomatedReasoningPolicy` (account-scoped)
  - **Evidence:** Readback table with all guardrail configs, IAM statements, timestamp, exit code,
    git blob SHA of cdk-outputs.json
  - **ACC mapping:** ACC-6, ACC-7
  - **Blocked by:** Tasks 7, 29

---

## Summary: ACC → Task Mapping

| ACC | Primary Tasks | D-Rung |
|-----|---------------|--------|
| ACC-1 | Task 33 (mocked test), Task 20 (live readback), Tasks 9+13+19 (impl) | D2 mocked → D3 live after handler wiring |
| ACC-2 | Task 34 (mocked test), Task 20 (live readback), Tasks 10+11+13+19 (impl) | D2 mocked → D3 live after handler wiring |
| ACC-3 | Task 35 (mocked test), Tasks 27+28 (impl) | D2 mocked → D3 after Task 29 deploy |
| ACC-4 | Task 36 (mocked test), Tasks 14+15 (impl) | D2 mocked → D3 after Task 7 deploy |
| ACC-5 | Task 37 (test), Tasks 30+31+32 (impl) | D2 |
| ACC-6 | Task 38 (full readback) | D3 — deployed + read back |
| ACC-7 | Task 38 (full readback) | D3 — deployed + read back |

---

## Lane Distribution

| Lane | Tasks |
|------|-------|
| [KIRO] | 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 25, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37 |
| [ARCHITECT] | 7, 20, 22, 23, 24, 29, 38 |
| [REQUIRES-HUMAN] | 4, 26 |
