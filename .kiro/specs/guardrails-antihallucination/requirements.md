# Guardrails Anti-Hallucination — Requirements R2 (EARS Format)

**Spec:** `guardrails-antihallucination` (spec 35)
**Phase:** P1 (ships with `agents-existing-8` — no agent ships unguarded)
**Revision:** R2 (2026-07-10) — addresses architect review FIX-1..7 + OQ answers
**Source documents:**

- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — Part 35 (authoritative), spine B.1, Part 22.3 (one-door invoker), Part 13 (permission matrix), Part 32.2 (canon versioning)
- `.kiro/steering/15-model-policy.md` AS AMENDED by `contracts/model-register.md` (Anthropic REMOVED from platform, owner 2026-07-06; model seats per the Register)
- `.kiro/steering/18-anti-hallucination.md`
- `.kiro/steering/12-token-metering.md` (one-door invoker choke point)
- `.kiro/steering/02-aoss-rule.md` (45-second rule)

**Depends on:** Spec 1 (`platform-foundation` — AiStack with baseline CfnGuardrail), `api-core` (invoker Lambda exists at `services/ai-invoker/`)

**Current baseline (verified `infra/lib/ai-stack.ts:90–112`, commit HEAD):**
- `contentPolicyConfig.filtersConfig`: PROMPT_ATTACK only (inputStrength HIGH, outputStrength NONE)
- `sensitiveInformationPolicyConfig.piiEntitiesConfig`: EMAIL (ANONYMIZE), PHONE (ANONYMIZE), NAME (ANONYMIZE), US_SOCIAL_SECURITY_NUMBER (BLOCK), CREDIT_DEBIT_CARD_NUMBER (BLOCK)
- No contextual grounding, no automated reasoning, no denied topics, no word filters
- Guardrail ID/version passed to invoker via env vars `GUARDRAIL_ID` / `GUARDRAIL_VERSION`

---

## 0. Architect Build Constraints (binding, non-negotiable)

| ID | Constraint |
|----|-----------|
| BC-1 | No Anthropic model IDs anywhere (owner decision 2026-07-06; `contracts/model-register.md` status: REMOVED from platform). The Register owns seat assignments — this spec does not touch them. |
| BC-2 | No verbatim ISO text in repository or AR policies. `clause-canon` uses `{standard, edition, clause_number, title}` tuples sourced exclusively from the committed corpus maps (owner decision 2026-07-05). |
| BC-3 | ALL guardrail enforcement lives at the one-door invoker (`services/ai-invoker`). Zero per-agent Bedrock or guardrail calls. Any direct `InvokeModel` or `ApplyGuardrail` call outside the invoker is a blocking defect. |
| BC-4 | Audit/telemetry events go through `publishAuditEvent` + the event registry (`contracts/events.md`) — never hand-stamped `auditTrail` writes. Event names follow `Domain.Action` PascalCase convention. |
| BC-5 | AWS verification profile: `AWS_PROFILE=cumplify-dev-readonly`. No value readable via readonly may come from memory. |
| BC-6 | Rule 7/8: each task closure ticks its checkboxes in the same commit and cites executed evidence with timestamp + exit code. |

---

## 1. Enabling Requirement — Embedding Door (spec-4 carry #1)

> Grounding checks are meaningless on placeholder vectors. The AI Invoker must provide a real embedding path so production agent handlers perform genuine query embedding for retrieval.

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| EMB-1 | **The system shall** expose an `embed()` function on the AI Invoker (`services/ai-invoker/src/`) that calls Amazon Titan Embed Text v2 (`amazon.titan-embed-text-v2:0`, 1024 dimensions) via `bedrock:InvokeModel`. | Part 22.3 one-door; spec-4 carry #1 |
| EMB-2 | **The embed() function shall** be invoker-internal: no agent or handler calls Bedrock embedding directly — all embedding requests route through the invoker's `embed()` door. | BC-3; steering 12-token-metering |
| EMB-3 | **The embed() function shall** meter credits consumed by reading `inputTextTokenCount` from the Titan Embed response and multiplying by a new `MODELWEIGHT#amazon.titan-embed-text-v2:0` item (wIn field, live-priced via the `fetchPricing` pattern in `services/ai-invoker/src/weight-seeder.ts`). A weight-seed task is required to populate this item. Titan Embed v2 is InvokeModel-only — no Converse API, no `requestMetadata`, no application inference profiles. Cost attribution is handled entirely within our metering path (DynamoDB atomic counter, same as model invocations). | Part 22.3 metering; FIX-3 correction |
| EMB-4 | **The embed() function shall** accept `{tenantId, agent, module, feature, text}` and emit a `telemetry.credits.consumed` event with those attribution fields after metering. | Part 22.3 |
| EMB-5 | **The embed() function shall** be a pure embedding call — it does NOT implement AOSS retry/backoff itself. Callers that use the resulting vector for AOSS retrieval are responsible for the 45-second cold-start budget (steering 02-aoss-rule). | FIX-7 correction |
| EMB-6 | **The invoker IAM role diff** required to call `bedrock:InvokeModel` on `amazon.titan-embed-text-v2:0` is **REQUIRES-HUMAN**. Design the IAM statement, STOP for owner sign-off before any deploy. | BC-5; 14-simplicity human-gated |

---

## 2. Layer 1 — Contextual Grounding + Relevance Checks

### 2.1 Guardrail Policy Expansion

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| L1-1 | **The system shall** expand the deployed `CfnGuardrail` (`infra/lib/ai-stack.ts:90–112`) to add contextual grounding checks and relevance checks as new policy configurations. | Part 35 Layer 1 |
| L1-2 | **The system shall** retain the existing deployed policies unchanged: `contentPolicyConfig` (PROMPT_ATTACK input HIGH / output NONE) and `sensitiveInformationPolicyConfig` (EMAIL ANONYMIZE, PHONE ANONYMIZE, NAME ANONYMIZE, US_SOCIAL_SECURITY_NUMBER BLOCK, CREDIT_DEBIT_CARD_NUMBER BLOCK). | Baseline preservation; verified ai-stack.ts:90–112 |

### 2.2 Part 35 Layer-1 Parameter Table (verbatim acceptance criteria)

| Parameter | Cumplify setting |
|-----------|-----------------|
| Grounding threshold | **0.85** for advisory agents (Domain Gurus, Copilot retrieval answers); **0.90** for record-writing drafts (DocStudio clause statements, LegalLedger obligation mappings, LeadAuditor checklist items) |
| Relevance threshold | **0.75** platform-wide |
| On block | The invoker retries once with the retrieved chunks injected verbatim + a "answer only from the source; say 'not found in the standard' otherwise" instruction; second failure → response replaced by the honest-miss template + the event `Ai.GroundingBlocked` (telemetry + the agent's HITL card shows "draft withheld — insufficient grounding") |
| Documented limits respected | Grounding source ≤100k chars (chunked retrievals comply); response ≤5k chars (long documents are checked **section-by-section** by the invoker: split on markdown headers, fall back to 4,000-char chunks at paragraph boundaries — architect-approved default); conversational multi-turn QA is out of the feature's supported scope — Copilot chat applies grounding per retrieval-answer turn, not across the conversation |
| Streaming caveat | For streamed responses the verdict can land post-stream; record-writing paths therefore run **non-streaming** (verdict before persistence); only advisory chat streams, with a post-hoc correction banner on late block |

### 2.3 Grounding Enforcement Requirements

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| L1-3 | **When** an advisory agent (Domain Guru seats `guru-9001`/`guru-14001`/`guru-45001`, ComplianceCopilot) produces a KB-grounded response, **the invoker shall** apply the contextual grounding check at threshold **0.85** before returning the response to the caller. | Part 35 L1 parameter table |
| L1-4 | **When** a record-writing invocation (`InvokeRequest.feature === 'record-write'`) produces a KB-grounded draft, **the invoker shall** apply the contextual grounding check at threshold **0.90** before the draft reaches HITL. Classification is keyed on the `feature` dimension, not seat identity. | Part 35 L1; FIX-6 |
| L1-5 | **The invoker shall** apply the relevance check at threshold **0.75** on every KB-grounded response, regardless of agent class. | Part 35 L1 parameter table |
| L1-6 | **When** a response exceeds 5,000 characters, **the invoker shall** split it into sections (markdown headers `##`/`###` as boundaries; fallback: 4,000-char chunks at paragraph boundaries) and apply grounding checks per section. | Part 35 documented limits; OQ-6 ANSWERED |
| L1-7 | **When** a grounding or relevance check blocks, **the invoker shall** retry once: re-invoke the model with the retrieved chunks injected verbatim and the instruction "answer only from the source; say 'not found in the standard' otherwise." | Part 35 on-block |
| L1-8 | **When** the retry also fails grounding/relevance, **the invoker shall** replace the response with the honest-miss template and emit the `Ai.GroundingBlocked` event via `publishAuditEvent`. | Part 35 on-block; BC-4 |
| L1-9 | **Record-writing paths** (`InvokeRequest.feature === 'record-write'`) **shall** run non-streaming: the grounding verdict must land before the draft is persisted or shown to HITL. | Part 35 streaming caveat |
| L1-10 | **DORMANT CARRY:** When a streaming response path is introduced, the invoker shall emit a correction signal on post-stream grounding block so the frontend can display a banner. Currently zero `ConverseStream` usage exists in the repo (verified). This requirement activates when streaming is added. | Part 35 streaming caveat; OQ-2 ANSWERED |
| L1-11 | **Every** grounding or relevance check invocation that touches AOSS for retrieval context **shall** implement the 45-second cold-start timeout budget with exponential backoff (base 500ms, factor 2, jitter, ceiling 45s). | Steering 02-aoss-rule |

---

## 3. Layer 2 — Automated Reasoning Policies

### 3.1 Part 35 Layer-2 AR Policy Table (rows 1–3, verbatim acceptance criteria)

| AR Policy | Encodes | Protects |
|-----------|---------|----------|
| `clause-canon` | Valid `{standard, edition, clause_number, title}` tuples + module/agent ownership from the coverage matrix | Any output citing a clause: a non-existent clause, wrong title, or wrong-edition citation is formally rejected — the runtime twin of the build-time clause-integrity hook |
| `role-permissions` | The Part 13 permission matrix + SoD rules | Copilot/agents can never *tell a user* they may perform an action their role forbids |
| `plan-entitlements` | Tier → standards/seats/features truth table | Billing/support answers cannot hallucinate entitlements |

### 3.2 AR Policy Requirements

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| L2-1 | **The system shall** author an Automated Reasoning policy `clause-canon` encoding valid `{standard, edition, clause_number, title}` tuples sourced exclusively from the committed corpus maps (`contracts/` directory). No verbatim ISO text — tuples only (BC-2). **Prerequisite task:** author `contracts/clause-corpus-map.md` from `docs/architecture/iso-requirements-map.md` (tuples only, no body text). | Part 35 L2; BC-2; OQ-4 ANSWERED |
| L2-2 | **The system shall** author an Automated Reasoning policy `role-permissions` encoding the Part 13 permission matrix (12 roles x module permissions) and the segregation-of-duties rules (author!=approver, auditor-independence, incident-investigator!=area-supervisor). | Part 35 L2; Part 13.2 |
| L2-3 | **The system shall** author an Automated Reasoning policy `plan-entitlements` encoding the tier→standards/seats/features truth table from the billing architecture. | Part 35 L2 |
| L2-4 | **The clause-canon AR policy shall** be versioned per Part 32.2: it carries `{standard, edition}` metadata and is regenerated from corpus maps on each canon release via the pipeline. | Part 32.2 Standards Update Manager |
| L2-5 | **When** an AR policy rejects a response (invalid claim identified), **the invoker shall** perform one steered regeneration with the AR feedback injected (the invalid claim, the reason, and the suggested correction), following the same retry-once pattern as the existing `services/ai-invoker/src/schema-retry.ts`. | Part 35 L2 |
| L2-6 | **When** the steered regeneration also fails AR validation, **the invoker shall** defer to HITL: the draft is flagged with the AR verdict and routed for human review rather than auto-served. | Part 35 L2 |
| L2-7 | **AR policies shall** be attached to the guardrail on the relevant invocation paths only (clause-citing paths for `clause-canon`; role/permission advisory paths for `role-permissions`; billing/plan query paths for `plan-entitlements`). | Part 35 L2 |
| L2-8 | **The `legal-register-logic` AR policy** (P3 roadmap) is explicitly OUT OF SCOPE for this spec — named carry to a future spec. | Part 35 L2 row 4 |

---

## 4. Layer 3 — Standalone Guardrail Checks on Agent Hops

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| L3-1 | **When** the invoker handles a mid-chain agent hop (tool selection, event routing, agent-to-agent handoff), **the system shall** call `ApplyGuardrail` (or `InvokeGuardrailChecks` if available — see OQ-1) to apply prompt-attack and content screening on the inter-agent payload. | Part 35 Layer 3; FIX-4 |
| L3-2 | **The guardrail check on hops shall** be made by the invoker (BC-3) — never by the individual agent or action-group Lambda. | BC-3 |
| L3-3 | **When** the hop guardrail check blocks an inter-agent payload, **the invoker shall** halt the chain, emit an `Ai.HopBlocked` event via `publishAuditEvent`, and return a structured error to the calling agent. | BC-4 |
| L3-4 | **Fallback (OQ-1 probe result):** If `InvokeGuardrailChecks` does not exist as an API action in the us-east-1 service model, Layer 3 shall use `ApplyGuardrail` on the hop payload instead. The design documents which API is used based on the live probe result. | FIX-4 |

---

## 5. Layer 4 — Structural Honesty (Shared Prompt Library)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| L4-1 | **The system shall** maintain a shared prompt library (within `services/ai-invoker/` or at `prompts/`) containing the structural-honesty instructions applied uniformly to all agents via the invoker's system-prompt injection. | Part 35 Layer 4 |
| L4-2 | **Every agent system prompt shall** include the **citation-or-silence rule**: every factual claim about a standard must carry a `clauseRef` (validated against canon by the invoker post-generation) or be explicitly framed as general guidance. | Part 35 L4(a) |
| L4-3 | **Every agent system prompt shall** include the **licensed uncertainty** instruction: "the standard does not specify this" is a rewarded response pattern. | Part 35 L4(b) |
| L4-4 | **All record-writing actions shall** produce **JSON-schema-validated outputs**: a draft that fails schema validation never reaches HITL. The existing `services/ai-invoker/src/schema-retry.ts` mechanism applies. | Part 35 L4(c) |
| L4-5 | **Record-writing paths shall** use temperature **<= 0.3**. (Current `SEAT_DEFAULTS` in `types.ts`: workhorse=0.3, guru=0.1, legal-ledger=0.2 — all compliant. Editor-ai=0.4 — record-writing invocations from this seat MUST override to <=0.3 via `InvokeRequest.temperature`.) | Part 35 L4(d) |
| L4-6 | **Every agent shall** follow the **retrieval-first** ordering: retrieve before asserting, never assert-then-decorate. | Part 35 L4(e) |
| L4-7 | **Every agent system prompt shall** include the **relative-date instruction**: never state absolute dates for standard publication/revision unless retrieved from the KB in the current invocation context (spec-4 carry #5: Nova hallucinated 2023 dates). | spec-4 carry #5 |
| L4-8 | **The invoker shall** validate `clauseRef` values in every response against the `clause-canon` AR policy before returning the response to the caller. Invalid clause references trigger the L2-5 steered-regeneration flow. | Part 35 L4(a) + L2 |

---

## 6. Layer 5 — HITL Card Data Contract

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| L5-1 | **Every AI-drafted artifact presented to HITL shall** include in its approval card: grounding score, AR verdict (pass/fail + details if fail), and source citations inline. | Part 35 Layer 5 |
| L5-2 | **When** a human approves a draft that was flagged by any guardrail layer (grounding below threshold, AR rejection on retry, or hop-check flag), **the system shall** require a typed justification from the approver. | Part 35 Layer 5 |
| L5-3 | **The typed justification shall** be sealed to the immutable audit trail as part of the approval event (`auditTrail: true`) — the `flagged-approval` typed justification field on the HITL item and sealed event. | Part 35 Layer 5 |
| L5-4 | **The HITL card data contract shall** be a typed interface (TypeScript) containing: `groundingScore: number`, `arVerdict: 'pass' | 'fail'`, `arDetails?: string`, `citations: Citation[]`, `flaggedApproval?: { justification: string, approverSub: string, timestamp: string }`. | Part 35 Layer 5 |
| L5-5 | **Rendering** of the HITL card (UI components, layout) is **out of scope** — belongs to `frontend-app` spec. This spec defines and emits the data contract only. | Scope boundary |

---

## 7. Telemetry & Event Emission

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| TEL-1 | **Every guardrail invocation shall** emit a structured telemetry event via `publishAuditEvent` containing: `tenantId`, `agent`, `guardrailPolicy` (which policy fired), `verdict` (pass/block/flag), `score` (grounding/relevance numeric), `latencyMs`, `timestamp`. These are telemetry events: `auditTrail: false`. | BC-4; Part 37 (consumed by genai-observability) |
| TEL-2 | **The `Ai.GroundingBlocked` event** (`auditTrail: false`) **shall** include: `tenantId`, `agent`, `module`, `groundingScore`, `relevanceScore`, `retryAttempted: boolean`, `finalOutcome: 'honest-miss' | 'hitl-deferred'`. | Part 35 L1 on-block |
| TEL-3 | **The `Ai.HopBlocked` event** (`auditTrail: false`) **shall** include: `tenantId`, `sourceAgent`, `targetAgent`, `blockedPolicy`, `payload` (sanitized summary, no PII). | Part 35 L3 |
| TEL-4 | **The `Ai.ArRejected` event** (`auditTrail: false`) **shall** include: `tenantId`, `agent`, `arPolicy`, `invalidClaim`, `reason`, `suggestedCorrection`, `retriedOnce: boolean`, `finalOutcome: 'corrected' | 'hitl-deferred'`. | Part 35 L2 |
| TEL-5 | **The L5-3 flagged-approval seal** is published as part of the HITL approval event (existing approval event path) with `auditTrail: true` — it is NOT a separate telemetry event. | L5-3; distinction from TEL-1..4 |
| TEL-6 | **All telemetry events shall** be registered in `contracts/events.md` (append `Ai.GroundingBlocked`, `Ai.HopBlocked`, `Ai.ArRejected` to the Ai domain) and in `services/eventing/src/audit-trail-registry.ts` (with `auditTrail: false`) before implementation. The publisher throws on unregistered detailType. | BC-4; FIX-5 |

---

## 8. Guardrail Configuration (CDK)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| CDK-1 | **The system shall** update the existing `CfnGuardrail` in `infra/lib/ai-stack.ts` to add contextual grounding and relevance policies. The existing `contentPolicyConfig` (PROMPT_ATTACK) and `sensitiveInformationPolicyConfig` (5 PII entities) are retained verbatim. | Part 35; baseline preservation |
| CDK-2 | **The system shall** pass CDK Nag (`AwsSolutionsChecks`) with zero non-compliant findings (reasoned suppressions acceptable per spec-1 convention). | platform-foundation constraint |
| CDK-3 | **The system shall** emit `CfnOutput` for the guardrail ID and version per the spec-1 F-9 outputs convention, so readback can verify the deployed configuration from `cdk-outputs.json`. | F-9 outputs convention |
| CDK-4 | **The guardrail configuration shall** support per-invocation threshold selection: the invoker passes the appropriate threshold (0.85 advisory / 0.90 record-writing) at call time. If the Bedrock API does not support per-call threshold override, two guardrail versions (advisory + record-writing) are acceptable. | Part 35 L1 parameter table |
| CDK-5 | **Denied topics (`topicPolicyConfig`) and word filters (`wordPolicyConfig`)** are explicitly OUT OF SCOPE for this spec. See OQ-7 for rationale and future disposition. | FIX-2 scope decision |

---

## 9. Invoker Integration

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| INV-1 | **The invoker shall** determine the invocation class (advisory vs. record-writing) from the `InvokeRequest.feature` field (`'record-write'` = record-writing; all others = advisory), and select the corresponding grounding threshold. The current `buildGuardrailConfig()` in `services/ai-invoker/src/guardrail.ts` must be extended to carry threshold context. | Part 35 L1; FIX-6 |
| INV-2 | **The invoker shall** maintain an honest-miss template library (per-language: EN/ES/PT) returned when grounding fails after retry. The template must not itself make any factual claims about standards. | Part 35 L1 on-block |
| INV-3 | **The invoker shall** track whether the current invocation is a record-writing path and enforce non-streaming mode for those paths. (Current invoker is entirely non-streaming — this is a no-op today but must be enforced as an invariant when streaming is introduced.) | Part 35 streaming caveat |
| INV-4 | **The invoker shall** implement section-wise splitting for responses exceeding 5,000 characters before applying grounding checks: split on markdown headers (`##`/`###`), fall back to 4,000-char chunks at paragraph boundaries. | Part 35 documented limits; OQ-6 ANSWERED |
| INV-5 | **The invoker's IAM role shall** have permission to call `bedrock:ApplyGuardrail` (and `bedrock:InvokeGuardrailChecks` if it exists per OQ-1 probe). This IAM change is **REQUIRES-HUMAN**. | 14-simplicity |

---

## 10. Acceptance Criteria (Headline Proofs)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| ACC-1 | **A grounded advisory response** with a score above 0.85 shall pass through the invoker without modification, evidenced by a readback test showing the response delivered and no `Ai.GroundingBlocked` event emitted. | Part 35 L1 |
| ACC-2 | **A deliberately ungrounded advisory response** (fabricated clause, no retrieval source) shall be blocked, retried once, and — on second failure — replaced by the honest-miss template, with `Ai.GroundingBlocked` event emitted. Evidenced by integration test + event assertion. | Part 35 L1 on-block |
| ACC-3 | **A record-writing draft citing a non-existent clause** shall be rejected by the `clause-canon` AR policy, steered-regenerated once, and if still invalid, deferred to HITL with the AR verdict attached. Evidenced by integration test + `Ai.ArRejected` event assertion. | Part 35 L2 |
| ACC-4 | **A mid-chain agent hop** carrying a prompt-injection payload shall be blocked by the guardrail check (ApplyGuardrail or InvokeGuardrailChecks per OQ-1 result), with `Ai.HopBlocked` event emitted and the chain halted. Evidenced by integration test. | Part 35 L3 |
| ACC-5 | **A HITL approval on a flagged draft** (grounding below threshold, passed on retry) shall require a typed justification that is sealed to the audit trail. Evidenced by sealed-event assertion in the immutable trail. | Part 35 L5 |
| ACC-6 | **The deployed guardrail** (readback via `AWS_PROFILE=cumplify-dev-readonly`) shall show: PROMPT_ATTACK content filter present, 5 PII entities present, contextual grounding enabled, relevance enabled, AR policies attached. (Denied topics and word filters are explicitly out of scope — CDK-5.) | CDK-3; FIX-2 |
| ACC-7 | **The invoker IAM role** (readback) shall show `bedrock:InvokeModel` permission for `amazon.titan-embed-text-v2:0` and `bedrock:ApplyGuardrail`. | EMB-6; INV-5 |

---

## 11. Out of Scope

| Item | Reason | Owning spec |
|------|--------|-------------|
| Part 37 dashboards, SLOs, alarm→NC wiring | This spec EMITS guardrail metrics and telemetry; observability consumes them | `genai-observability` |
| Part 36 evaluation release gate (AI-QA suites) | Evaluation is a separate pipeline concern | `ai-qa-evaluations` |
| `legal-register-logic` AR policy (P3) | Highest-complexity AR policy, deferred | Future spec (P3) |
| Frontend rendering of HITL cards | This spec defines the data contract; UI belongs elsewhere | `frontend-app` |
| Model seat assignments | The Register (`contracts/model-register.md`) owns them; this spec respects the register | `model-policy-evals` |
| L1-10 streaming correction signal | Dormant — no ConverseStream in repo (OQ-2 ANSWERED). Activates when streaming is added | Future |
| Per-agent Bedrock/guardrail calls | Architecturally forbidden (BC-3) | Never |
| Denied topics (`topicPolicyConfig`) | Not required by Part 35; see OQ-7 | Future if needed |
| Word filters (`wordPolicyConfig`) | Not required by Part 35; see OQ-7 | Future if needed |

---

## 12. Open Questions

| # | Status | Question | Impact | Resolution |
|---|--------|----------|--------|------------|
| OQ-1 | OPEN | **Verify LIVE (readonly profile) that (a) Automated Reasoning checks are available in us-east-1 for account 697114252993, AND (b) `InvokeGuardrailChecks` exists as an API action in the Bedrock service model.** If AR unavailable → L2 becomes a named carry and L1/L3/L4/L5 ship without it. If InvokeGuardrailChecks unavailable → L3 falls back to `ApplyGuardrail` on the hop payload (L3-4). | L2 may be entirely deferred; L3 API selection | Probe: `AWS_PROFILE=cumplify-dev-readonly aws bedrock list-guardrails` for AR support; `aws bedrock-runtime help` or service model JSON for InvokeGuardrailChecks action. |
| OQ-2 | **ANSWERED** | Whether any streaming response path exists today. | L1-10 scoping | Zero `ConverseStream` usage in the repo. **L1-10 is dormant — carries until streaming is introduced.** |
| OQ-3 | OPEN | **Per-call threshold override support in the Bedrock Guardrails API.** Can `ApplyGuardrail` accept a threshold parameter per invocation, or must we maintain two guardrail versions? | CDK-4 architecture decision | Live-probe the API shape via readonly or aws-docs MCP at design time. |
| OQ-4 | **ANSWERED** | Corpus map availability for `clause-canon` AR policy. | L2-1 dependency | **YES — authoring `contracts/clause-corpus-map.md` from `docs/architecture/iso-requirements-map.md` is a prerequisite task. Tuples only `{standard, edition, clause_number, title}`, no ISO body text (BC-2).** |
| OQ-5 | OPEN | Event registry bridge — confirm the publisher enforces registration and the `Ai.*` domain events can be appended. | TEL-6 | Publisher throws on unregistered detailType (confirmed api-core Task 3). Events must be appended to `contracts/events.md` + `audit-trail-registry.ts` before publishing. |
| OQ-6 | **ANSWERED** | Section-wise splitting semantics for >5k char responses. | L1-6 | **Split on markdown headers (`##`/`###`) if present; fall back to 4,000-char chunks at paragraph boundaries. Architect-approved as the design default.** |
| OQ-7 | OPEN (new) | **Denied topics and word filters.** The six Bedrock guardrail policy classes are: content filters, denied topics, word filters, sensitive information, contextual grounding, and automated reasoning. This spec adds grounding + AR only. Part 35 does not mandate denied topics or word filters. Should they be added (and if so, with what starting sets)? Or remain explicitly out of scope? Current decision: **scoped out** (CDK-5) — Part 35 specifies the anti-hallucination stack, not a general content-moderation stack. The existing PROMPT_ATTACK filter covers the injection vector. Denied topics / word filters can be added by a future content-policy spec if business need arises. | ACC-6 correctness; policy completeness | Flag for owner if a specific denied-topic need emerges. |
