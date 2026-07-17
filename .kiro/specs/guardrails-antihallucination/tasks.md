# Guardrails Anti-Hallucination — Tasks

**Spec:** `guardrails-antihallucination` (spec 35)
**Design:** D3 (2026-07-16)
**Lane legend:** [KIRO] = build agent, [ARCHITECT] = architect-witnessed deploy/readback,
[REQUIRES-HUMAN] = owner sign-off before execution

---

## Phase 0: Event Registration & Contracts

- [x] **Task 1 — Register Ai.* telemetry events** [KIRO] D2
  - Add to `contracts/events.md` (new Ai domain section):
    - `Ai.GuardrailChecked` (auditTrail: false), `Ai.GroundingBlocked` (auditTrail: false),
      `Ai.HopBlocked` (auditTrail: false), `Ai.ArRejected` (auditTrail: false)
  - Add same four to `services/eventing/src/audit-trail-registry.ts`
  - entityId: '' for all four
  - Parity test must pass
  - **Evidence:** `npm run test` green
  - **ACC mapping:** TEL-6, TEL-1

---

## Phase 1: Embedding Door (EMB-1..6)

- [x] **Task 2 — Add Titan Embed v2 to model-weights-seed.json** [KIRO] D2
  - Add `amazon.titan-embed-text-v2:0` to `services/ai-invoker/data/model-weights-seed.json`
  - wIn: from Bedrock pricing; wOut: 0; wCache: null
  - **Evidence:** JSON valid, computeCredits unit test passes
  - **ACC mapping:** EMB-3

- [x] **Task 3 — Implement embed() + invoker entry dispatch + CDK binding** [KIRO] D2
  - Create `services/ai-invoker/src/embed.ts`:
    - `embed(req: EmbedRequest): Promise<EmbedResult>`
    - Calls bedrock:InvokeModel on `amazon.titan-embed-text-v2:0` ({inputText, dimensions:1024})
    - Reads inputTextTokenCount, loads weights, computes credits, meters, emits telemetry
    - Returns {embedding, tokenCount, credits}
  - Extend `services/ai-invoker/src/index.ts` entry:
    - Add `export async function handler(event: InvokeRequest | EmbedOp)` — dispatches on
      `event.op`: `'embed'` → embed(); absent/`'invoke'` → existing invoke() path
    - `invoke()` STAYS exported (tests + type consumers)
    - Back-compatible: no op field = invoke (all existing callers unchanged)
  - **F-1 CDK binding:** In `infra/lib/ai-stack.ts`, change AiInvokerFn `handler: 'invoke'`
    → `handler: 'handler'` so the Lambda runtime calls the dispatch entry
  - Add `EmbedRequest`, `EmbedResult`, `EmbedOp` to `services/ai-invoker/src/types.ts`
  - NOT exported from package index (EMB-2: executes inside invoker Lambda only)
  - Does NOT implement AOSS retry/backoff (EMB-5)
  - **Evidence:** Unit tests: dispatch routes correctly; embed mocked-Bedrock passes;
    metering verified; cdk synth passes with handler binding change
  - **ACC mapping:** EMB-1, EMB-2, EMB-4, EMB-5

- [x] **Task 4 — Embed transport in invoke-transport.ts** [KIRO] D2
  - Add `createEmbedFn()` to `services/agents/shared/invoke-transport.ts`:
    - Same AI_INVOKER_ARN, same LambdaClient
    - Payload: `{op: 'embed', ...request}`
    - Returns parsed `EmbedResult`
  - Export `EmbedFn` type
  - Handlers call `createEmbedFn()` — NEVER import embed.ts directly
  - **Evidence:** Unit test: createEmbedFn invokes Lambda with op:'embed', parses result
  - **ACC mapping:** EMB-2 (transport enforcement)

- [x] **Task 5 — Confirm Titan Embed v2 IAM sufficiency** [REQUIRES-HUMAN] D3
  - Model access PROVEN LIVE (architect micro-invoke 2026-07-16)
  - Scope: owner sign-off confirming existing IAM suffices
  - **Evidence:** Owner sign-off recorded — Julio, 2026-07-16 working session ("task 5
    approved"); statement signed: existing `bedrock:InvokeModel` + `bedrock:ApplyGuardrail`
    on Resource:'*' (ai-stack.ts:157-164) covers Titan Embed v2; NO new IAM statement.
    Log: .kiro/evidence/guardrails-antihallucination/task-5.log
  - **ACC mapping:** EMB-6, ACC-7 (partial)

---

## Phase 2: CDK Guardrail Expansion (L1-1, L1-2, CDK-1..5)

- [x] **Task 6 — Expand AgentGuardrail + add RecordWriteGuardrail** [KIRO] D2
  - In `infra/lib/ai-stack.ts`:
    - Add `contextualGroundingPolicyConfig` to existing `AgentGuardrail`:
      GROUNDING 0.85, RELEVANCE 0.75. NO CrossRegionConfig. Preserve existing
      contentPolicyConfig + sensitiveInformationPolicyConfig verbatim (L1-2).
    - Add NEW `RecordWriteGuardrail`: PROMPT_ATTACK + 5 PII + grounding 0.90 + relevance 0.75.
      NO CrossRegionConfig. Env vars: `RECORDWRITE_GUARDRAIL_ID/VERSION`.
  - Do NOT create AR guardrails here (Policies required, minItems:1 — wait for Task 25)
  - Do NOT touch `DocGenGuardrail`
  - Emit `CfnOutput` for RecordWriteGuardrail ID/version (F-9)
  - **Evidence:** `cdk synth` passes, CDK Nag clean
  - **ACC mapping:** L1-1, L1-2, CDK-1, CDK-2, CDK-3, CDK-4

- [x] **Task 7 — Deploy grounding guardrails to dev + empirical probes** [ARCHITECT] D3
  - Deploy AiStack to dev (697114252993)
  - Readback (`aws bedrock get-guardrail`, readonly):
    - AgentGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.85 + relevance 0.75, NO CrossRegionConfig
    - RecordWriteGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.90 + relevance 0.75, NO CrossRegionConfig
    - DocGenGuardrail: UNCHANGED
  - **(M-4a)** Empirical no-source probe: live invoke WITHOUT grounding source → NOT blocked
  - **(M-4b)** Weight seed verify: DDB GetItem `MODELWEIGHT#amazon.titan-embed-text-v2:0` exists
  - **(M-4c, F-1)** Embed-op binding probe: live micro-invoke of the DEPLOYED invoker Lambda
    with `{op:'embed', text:'probe', ...}` → assert 1024-dim embedding + meter increment;
    plus back-compat probe (payload without `op` → normal invoke path unaffected)
  - **Evidence:** Readback table + probe outputs + DDB row
  - **ACC mapping:** ACC-6 (partial)

---

## Phase 3: Invoker Integration (L1, INV-1..4)

- [x] **Task 8 — Extend guardrail routing (5-guardrail)** [KIRO] D2
  - Update `services/ai-invoker/src/guardrail.ts`:
    - `buildGuardrailConfig(seat, feature?)`: doc-composer→DOCGEN, record-write→RECORDWRITE, else→GUARDRAIL
    - `buildArClauseGuardrailConfig()`: returns ARCLAUSE_GUARDRAIL config
    - `buildArAdvisoryGuardrailConfig()`: returns ARADVISORY_GUARDRAIL config
  - Env var reads: `RECORDWRITE_GUARDRAIL_*`, `ARCLAUSE_GUARDRAIL_*`, `ARADVISORY_GUARDRAIL_*`
  - **Evidence:** Unit tests for all five routing paths
  - **ACC mapping:** INV-1, CDK-4

- [x] **Task 9 — Implement grounding check module** [KIRO] D2
  - Create `services/ai-invoker/src/grounding.ts`:
    - `splitForGroundingCheck(text)` — markdown header split, 4k paragraph fallback
    - `validateGroundingContext(ctx)` — truncate source at 100k, query at 1,000 chars
    - `checkGrounding(params)` — ApplyGuardrail with qualifiers (source:'OUTPUT')
    - `parseGroundingResponse(response)` — extract scores + verdict
    - `buildCitations(groundingSource, scores)` — citation construction (§4.3)
  - **Evidence:** Unit tests: pass/block scenarios, truncation at caps, citation construction
  - **ACC mapping:** L1-3, L1-4, L1-5, L1-6, INV-4

- [x] **Task 10 — Implement grounding retry + honest-miss flow** [KIRO] D2
  - In grounding.ts:
    - Retry once with chunks + "answer only from source" instruction (L1-7)
    - On second failure: honest-miss template (locale from request.locale, defaults 'en')
    - Publish `Ai.GroundingBlocked` via eventing `publish()` (entityId: '')
  - Temperature cap: record-write ≤ 0.3 (L4-5)
  - Non-streaming invariant (L1-9, INV-3)
  - **Evidence:** Unit tests: retry-pass, retry-fail→honest-miss, event emission
  - **ACC mapping:** L1-7, L1-8, L1-9, INV-3, ACC-2 (unit)

- [x] **Task 11 — Honest-miss templates (EN/ES/PT)** [KIRO] D2
  - Create `prompts/templates/honest-miss.{en,es,pt}.md` — no factual claims
  - Create `services/ai-invoker/src/honest-miss.ts` — locale-aware loader
  - **Evidence:** Templates exist, no clauseRefs, loader returns correct locale
  - **ACC mapping:** INV-2

- [x] **Task 12 — Extend InvokeRequest/InvokeResponse types** [KIRO] D2
  - Add groundingContext, locale to InvokeRequest
  - Add guardrailEvidence to InvokeResponse
  - Add error codes: GROUNDING_BLOCKED, AR_REJECTED, HOP_BLOCKED, STREAMING_BLOCKED
  - Define GuardrailEvidenceData, Citation interfaces
  - **Evidence:** `tsc --noEmit` clean
  - **ACC mapping:** L5-4

- [x] **Task 13 — Integrate grounding into invoke() orchestration** [KIRO] D2
  - After converse(): if groundingContext present → validate caps → split → checkGrounding
  - Emit Ai.GuardrailChecked per check — **OUTSTANDING (validation V-2): not implemented;
    fix ordered with the Phase 4-6 wave**
  - On block: retry flow; attach guardrailEvidence to response
  - ~~Wrap request.system through buildSystemPrompt() (§7.2)~~ — duplicate of Task 17's
    scope (D3 review nit); lands with Task 17
  - Dormant when groundingContext absent
  - **Evidence:** Integration test (mocked): with/without groundingContext paths verified
  - **ACC mapping:** ACC-1, ACC-2 (mocked)

---

## Phase 4: Layer 3 — Hop Check

- [x] **Task 14 — Implement hop guardrail check** [KIRO] D2
  - Create `services/ai-invoker/src/hop-check.ts`
  - ApplyGuardrail on hop payload (source:'INPUT', agent guardrail)
  - On BLOCK: publish Ai.HopBlocked (entityId:''), return error
  - Emit Ai.GuardrailChecked per check
  - **Evidence:** Unit tests: clean passes, injection blocks + event
  - **ACC mapping:** L3-1, L3-2, L3-3, L3-4, ACC-4 (unit)

- [x] **Task 15 — Integrate hop check into tool-use path** [KIRO] D2
  - When stopReason=tool_use + agent-routing tool → checkHopPayload()
  - Agent-routing tool name registry
  - **Evidence:** Integration test: injection → blocked
  - **ACC mapping:** ACC-4

---

## Phase 5: Layer 4 — Shared Prompt Library

- [x] **Task 16 — Create shared prompt library** [KIRO] D2
  - Create `prompts/shared/{structural-honesty,licensed-uncertainty,retrieval-first,relative-date}.md`
  - **Evidence:** Files exist, factual-claim-free
  - **ACC mapping:** L4-1, L4-2, L4-3, L4-6, L4-7

- [x] **Task 17 — Implement prompt-library injection** [KIRO] D2
  - Create `services/ai-invoker/src/prompt-library.ts`:
    - `buildSystemPrompt(basePrompt: string): string` — prepends four shared blocks
  - Wire into index.ts: wrap request.system before converse()
  - **Evidence:** Unit test: output contains all four blocks + base
  - **ACC mapping:** L4-1

- [x] **Task 18 — Temperature enforcement for record-write** [KIRO] D2
  - Cap at 0.3 when feature='record-write'
  - **Evidence:** Unit test: editor-ai (0.4) + record-write → 0.3
  - **ACC mapping:** L4-5

---

## Phase 6: Handler Wiring

- [x] **Task 19 — Wire guru + copilot handlers with embed→retrieve→groundingContext** [KIRO] D2
  - **Copilot leg: NAMED CARRY** — no copilot handler exists in the codebase (belongs to a
    future spec); the three guru handlers are wired ✓. The carry re-attaches when the
    copilot handler spec lands (validated by architect 2026-07-16).
  - Update guru-9001, guru-14001, guru-45001, copilot handlers:
    1. `const embedFn = createEmbedFn()` (invoke-transport.ts — NEVER import embed.ts)
    2. `const {embedding} = await embedFn({tenantId, agent, module, feature, text: question})`
    3. `const chunks = await retrieve({vector: embedding, tenantId, ...})` — 45s budget (L1-11)
    4. `groundingContext: {source: chunks.join('\n---\n'), query: question.slice(0,1000)}`
    5. `locale: tenantDocumentLocale`
  - **Evidence:** Unit tests: embed transport called, groundingContext assembled, query truncated
  - **ACC mapping:** L1-11, EMB-5

- [x] **Task 20 — Deploy + live ACC-1/ACC-2 readback** [ARCHITECT] D3
  - **CLOSED with carries (task-20.log):** ACC-1 + ACC-2 PROVEN LIVE at the one-door
    (exact event evidence); handler→AOSS full-chain grounded leg CARRIED on
    FIX-T20-2/T20-3 (RAG chunk injection dropped in Task 19; pre-existing AOSS 401 =
    F-B still open) — architect re-probe follows the fix wave
  - **Step 0:** Deploy AiStack (invoker + handler code from Phases 3-6) to dev
  - **ACC-1:** Grounded question → response delivered, no Ai.GroundingBlocked, evidence present
  - **ACC-2:** Fabricated-clause question → honest-miss template, Ai.GroundingBlocked emitted
  - **Evidence:** Question/response pairs, event log, timestamps
  - **ACC mapping:** ACC-1, ACC-2 (live D3)
  - **Blocked by:** Tasks 7, 19 code complete + this task's step-0 deploy

---

## Phase 7: Layer 2 — Automated Reasoning Policies

- [x] **Task 21 — Author contracts/clause-corpus-map.md** [KIRO] D2
  - Extract {standard, edition, clause_number, title} tuples from iso-requirements-map.md
  - BC-2: tuples only, NO ISO body text
  - **Evidence:** File exists, all three standards, no prose
  - **ACC mapping:** L2-1

- [x] **Task 22 — Create clause-canon AR policy (headless CLI — DQ-3: deterministic JSON, not ingestion)** [ARCHITECT] D3
  - Upload corpus-map → build workflow → review fidelity → save version → export JSON
  - If build workflow cannot ingest markdown (DQ-3): manually author Variables+Rules
  - **Evidence:** PolicyDefinition JSON at `infra/data/ar-policies/clause-canon.json`
  - **ACC mapping:** L2-1, L2-4

- [x] **Task 23 — Author role-permissions AR policy (headless; Part 13 v2 + SoD steering)** [ARCHITECT] D3
  - Part 13 permission matrix + SoD rules → export JSON
  - **Evidence:** `infra/data/ar-policies/role-permissions.json`
  - **ACC mapping:** L2-2

- [x] **Task 24 — Author plan-entitlements AR policy (headless; Part 17.2 price card)** [ARCHITECT] D3
  - Tier truth table → export JSON
  - **Evidence:** `infra/data/ar-policies/plan-entitlements.json`
  - **ACC mapping:** L2-3

- [x] **Task 25 — Deploy AR policies + both AR guardrails via CDK** [KIRO] D2
  - Add `AWS::Bedrock::AutomatedReasoningPolicy` resources (3) to ai-stack.ts
  - Create `ArClauseGuardrail`:
    - `automatedReasoningPolicyConfig: { policies: [clauseCanonArn], confidenceThreshold: 0.9 }`
    - `crossRegionConfig: { guardrailProfileArn: 'arn:aws:bedrock:us-east-1:${this.account}:guardrail-profile/us.guardrail.v1:0' }`
    - Env vars: `ARCLAUSE_GUARDRAIL_ID/VERSION`
  - Create `ArAdvisoryGuardrail`:
    - `automatedReasoningPolicyConfig: { policies: [rolePermsArn, planEntArn], confidenceThreshold: 0.9 }`
    - `crossRegionConfig: { guardrailProfileArn: ... }` (same)
    - Env vars: `ARADVISORY_GUARDRAIL_ID/VERSION`
  - AgentGuardrail/RecordWriteGuardrail: NO AR, NO CrossRegionConfig (unchanged)
  - CfnOutput for both AR guardrail IDs/versions
  - **Evidence:** `cdk synth` passes, CDK Nag clean
  - **ACC mapping:** L2-7, CDK-1
  - **Blocked by:** Tasks 22, 23, 24

- [x] **Task 26 — AR IAM statement** [REQUIRES-HUMAN] D3 — OWNER APPROVED 2026-07-17
  - Add `bedrock:InvokeAutomatedReasoningPolicy` to invoker role
  - Resource: `arn:aws:bedrock:us-east-1:697114252993:automated-reasoning-policy/*`
  - **Evidence:** Owner sign-off + IAM readback
  - **ACC mapping:** ACC-7 (partial)

- [x] **Task 27 — Implement AR check module** [KIRO] D2
  - Create `services/ai-invoker/src/ar-check.ts`:
    - Select guardrail by path: clause-citing → ArClause; role/plan → ArAdvisory
    - ApplyGuardrail → parse `automatedReasoningPolicy` findings → ArCheckResult
    - Steered-regeneration on reject (schema-retry.ts pattern)
    - On double-fail: flag for HITL, publish Ai.ArRejected
    - Emit Ai.GuardrailChecked per check
  - Optional deterministic pre-filter (§7.4): clauseRef regex + corpus-map hash-set
  - **Evidence:** Unit tests: pass, reject→corrected, reject→HITL-deferred
  - **ACC mapping:** L2-5, L2-6, L4-8, ACC-3 (unit)

- [x] **Task 28 — Integrate AR into invoke() orchestration** [KIRO] D2
  - After grounding passes: if clause-citing/role/plan path → checkArPolicy()
  - Attach AR verdict to guardrailEvidence
  - Dormant until AR guardrails deployed
  - **Evidence:** Integration test (mocked): AR reject → regen; double-fail → HITL flag
  - **ACC mapping:** ACC-3, L4-8

---

- [x] **Task 29 — Deploy AR expansion to dev** [ARCHITECT] D3
  - Deploy AiStack with AR policies + both AR guardrails + IAM
  - Readback:
    - ArClauseGuardrail: 1 AR policy (clause-canon), CrossRegionConfig, confidenceThreshold 0.9
    - ArAdvisoryGuardrail: 2 AR policies (role-perms + plan-ent), CrossRegionConfig, confidenceThreshold 0.9
    - AgentGuardrail/RecordWriteGuardrail: NO AR, NO CrossRegionConfig (unchanged)
  - IAM: `bedrock:InvokeAutomatedReasoningPolicy` present
  - **Evidence:** Readback table with timestamp, exit code, policy ARNs, guardrail configs
  - **ACC mapping:** ACC-6, ACC-7
  - **Blocked by:** Tasks 25, 26

---

## Phase 8: Layer 5 — HITL Card Data Contract + Producer Chain

- [x] **Task 30 — Extend GuardrailEvidence GraphQL type** [KIRO] D2
  - In `services/api/schema/schema.graphql`:
    - Add `relevanceScore: Float` to GuardrailEvidence
    - Add `flagged: Boolean` to GuardrailEvidence
    - Add `flaggedApproval: FlaggedApproval` to GuardrailEvidence
    - Add type `FlaggedApproval @aws_lambda { justification: String!, approverSub: String!, timestamp: AWSDateTime! }`
  - Schema-guard test must pass
  - **Evidence:** `npm run test` green
  - **ACC mapping:** L5-1, L5-4

- [x] **Task 31 — L5 producer chain: guardrailEvidence → HITL item** [KIRO] D2
  - Extend `services/agents/shared/store-token.ts`:
    - Add `guardrailEvidence?: GuardrailEvidenceData` to StoreTokenInput.input
    - Add to UpdateExpression: `guardrailEvidence = :evidence`
  - Extend `services/agents/shared/hitl.ts`:
    - Add guardrailEvidence to HitlGateInput + sfnInput passthrough
  - Extend `services/agents/shared/tool-loop.ts`:
    - After InvokeResponse received, pass guardrailEvidence to enterHitlGate
  - Citation construction (invoker-side, Task 9's buildCitations):
    - Split source on `\n---\n`, extract clauseRef from `[ISO XXXXX X.X]` prefix
    - Top-5 citations sorted by score
  - **Evidence:** Unit test: store-token with evidence → DDB item has marshalled map;
    tool-loop → hitl → store-token chain passes evidence through
  - **ACC mapping:** L5-1 (producer), H-3 D2

- [x] **Task 32 — L5-2 flagged-approval justification enforcement** [KIRO] D2
  - HITL approval resolver: when guardrailEvidence.flagged=true → require justification
  - Stamp flaggedApproval on sealed event payload (Hitl.Approved, auditTrail:true)
  - **Evidence:** Unit test: approve without justification → error; with → sealed event ok
  - **ACC mapping:** L5-2, L5-3, ACC-5

---

## Phase 9: Integration Acceptance Tests

- [x] **Task 33 — ACC-1: Grounded response passes (mocked)** [KIRO] D2
  - Invoke with groundingContext, score > 0.85 → delivered, no event, evidence present
  - **Evidence:** Test passes
  - **ACC mapping:** ACC-1 (D2 mocked)

- [x] **Task 34 — ACC-2: Ungrounded → honest-miss (mocked)** [KIRO] D2
  - Invoke with groundingContext, score < 0.85, retry fails → honest-miss + event
  - **Evidence:** Test passes
  - **ACC mapping:** ACC-2 (D2 mocked)

- [x] **Task 35 — ACC-3: Invalid clause → AR reject → HITL (mocked)** [KIRO] D2
  - Record-write, AR rejects, regen fails → flagged for HITL + Ai.ArRejected event
  - **Evidence:** Test passes
  - **ACC mapping:** ACC-3

- [x] **Task 36 — ACC-4: Hop injection → blocked (mocked)** [KIRO] D2
  - tool_use with injection → blocked, Ai.HopBlocked emitted
  - **Evidence:** Test passes
  - **ACC mapping:** ACC-4

- [x] **Task 37 — ACC-5: Flagged approval requires justification** [KIRO] D2
  - HitlItem with flagged=true: approve without justification → error; with → sealed
  - **Evidence:** Test passes
  - **ACC mapping:** ACC-5

- [x] **Task 38 — ACC-6/7: Full deployed readback** [ARCHITECT] D3
  - Post-deploy readback (all guardrails live):
    - AgentGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.85 + relevance 0.75, NO AR, NO CrossRegion
    - RecordWriteGuardrail: PROMPT_ATTACK + 5 PII + grounding 0.90 + relevance 0.75, NO AR, NO CrossRegion
    - ArClauseGuardrail: clause-canon (1 policy), CrossRegionConfig, confidenceThreshold 0.9
    - ArAdvisoryGuardrail: role-permissions + plan-entitlements (2 policies), CrossRegionConfig, confidenceThreshold 0.9
    - DocGenGuardrail: UNCHANGED
    - IAM: InvokeModel(*) + ApplyGuardrail(*) + InvokeAutomatedReasoningPolicy(account-scoped)
  - **Evidence:** Readback table, git blob SHA of cdk-outputs.json, timestamp, exit code
  - **ACC mapping:** ACC-6, ACC-7
  - **Blocked by:** Tasks 7, 29

---

## Summary: ACC → Task Mapping

| ACC | Primary Tasks | D-Rung |
|-----|---------------|--------|
| ACC-1 | Task 33 (mocked), Task 20 (live), Tasks 9+13+19 (impl) | D2 → D3 live |
| ACC-2 | Task 34 (mocked), Task 20 (live), Tasks 10+11+13+19 (impl) | D2 → D3 live |
| ACC-3 | Task 35 (mocked), Tasks 27+28 (impl) | D2 → D3 after Task 29 |
| ACC-4 | Task 36 (mocked), Tasks 14+15 (impl) | D2 → D3 after Task 7 |
| ACC-5 | Task 37, Tasks 30+31+32 (impl) | D2 |
| ACC-6 | Task 38 (full readback) | D3 |
| ACC-7 | Task 38 (full readback) | D3 |

---

## Lane Distribution

| Lane | Tasks |
|------|-------|
| [KIRO] | 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 25, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37 |
| [ARCHITECT] | 7, 20, 22, 23, 24, 29, 38 |
| [REQUIRES-HUMAN] | 5, 26 |
