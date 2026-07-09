# agents-existing-8 — Requirements (EARS) R2

**Revision:** R1 → R2 (architect review applied)
**R1 findings resolved:**
- F-1 (CRITICAL): REQ-SERVE-0 added — REQUIRES-HUMAN design decision: Managed
  Agents vs Custom Converse loop. REQ-SERVE-2/3/10/11 and REQ-CDK-5/REQ-EVT-4
  made CONDITIONAL on that decision.
- F-2 (HIGH): REQ-EVT-5 rewritten from eventing-stack.ts ground truth.
  Existing R-1..R-7 queues identified; new AiStack rules listed explicitly.
- F-3 (MEDIUM): REQ-SERVE-8 reworded — per-plan/app inference profiles,
  not per-tenant.
- F-4 (MEDIUM): REQ-WB-1 scope corrected — agentAssessRisk and agentTriageNC
  removed; both moved to Out of Scope.
- F-5 (LOW): REQ-CDK-4 bedrock:InvokeModel clause conditioned on F-1 decision.

**Spec:** `agents-existing-8`
**v7 table row:** 4
**Stacks touched:** AiStack (new, joins CumplifyStage)
**Depends on:** platform-foundation (1), eventing-backbone (2), api-core (3)
**Cross-refs:** `contracts/model-register.md` (sole model source of truth);
steering 01-tenancy-rules, 02-aoss-rule, 04-immutability, 05-hitl,
07-events, 12-token-metering, 15-model-policy, 16-identity-boundaries;
`docs/architecture/agent-catalog.md`; `docs/architecture/module-spec.md` M1–M5;
Part 22 AI Token Economics; spec-30 (model-policy-evals) closure carries.

---

## 1. Definitions

| Term | Meaning |
|------|---------|
| **Seat** | A model-assignment slot in `contracts/model-register.md` (e.g., Workhorse, Guru-45001). |
| **Register** | `contracts/model-register.md` — the append-only, sole source of truth for model assignments. |
| **One-door** | The single metered serving path through which every Bedrock invocation passes (steering 12). |
| **Credit** | Normalised billing unit; 1,000 Credits ≈ $1.00 raw Bedrock cost; sold at $0.00396/credit (Part 22). |
| **HITL** | Human-in-the-loop gate — `returnControl` / `returnControlInvocationResults` Bedrock flow (steering 05). |
| **AOSS** | OpenSearch Serverless VECTORSEARCH (NextGen, scale-to-zero). Cold start up to 45 s (steering 02). |
| **EXPIRED** | A Register seat whose expiry date has passed without re-validation — must fail closed. |
| **PROVISIONAL** | A Register seat assigned conditionally; requires a re-eval before user-facing GO. |
| **Action-group Lambda** | A Lambda behind a Bedrock agent action group that performs the agent's tool operation. |

---

## 2. Agents In Scope

| # | Agent | Seat (Register) | Model ID | Module |
|---|-------|-----------------|----------|--------|
| 1 | ControlTower | Workhorse | `us.amazon.nova-pro-v1:0` | Cross-standard governance (4.4/5.1/5.3) |
| 2 | DocStudio | Workhorse | `us.amazon.nova-pro-v1:0` | M1 Document Studio |
| 3 | LeadAuditor | Workhorse | `us.amazon.nova-pro-v1:0` | M3 Audit Studio |
| 4 | CAPAGuru | Workhorse | `us.amazon.nova-pro-v1:0` | M2 CAPA |
| 5 | RecordsVault | Lightweight | `us.amazon.nova-lite-v1:0` | M4 Records Mgmt / M13 |
| 6 | ISO 9001 Guru | Guru-9001 | `qwen.qwen3-next-80b-a3b` | Advisory (all 9001 clauses) |
| 7 | ISO 14001 Guru | Guru-14001 | `qwen.qwen3-next-80b-a3b` | Advisory (all 14001 clauses) |
| 8 | ISO 45001 Guru | Guru-45001 | `moonshotai.kimi-k2.5` | Advisory (all 45001 clauses) |

**Deviation note (SUPERSEDED):** The agent-catalog lists Claude Sonnet 4.6
for the 3 Gurus and LegalLedger. The Register (post spec-30 evals) supersedes
those assignments: Gurus → qwen/kimi; LegalLedger → UNASSIGNED. Claude/Anthropic
models are REMOVED from the platform (owner decision 2026-07-06). Any catalog
reference to Sonnet is legacy and does not govern builds.

---

## 3. One-Door Model Serving Path

### REQ-SERVE-0 — Agent orchestration paradigm (REQUIRES-HUMAN)
This spec requires a design decision between two mutually exclusive Bedrock
paradigms. The architect SHALL present both options to the owner and record
the decision before design proceeds.

**Option A — Managed Bedrock Agents (CfnAgent + InvokeAgent):**
- Native `returnControl` HITL gate + action-group Lambdas.
- Model is Register-resolved at DEPLOY time (baked into the CfnAgent
  definition); cannot switch per-invocation without redeployment.
- Token metering is ASYNC via Bedrock model-invocation logging (CloudWatch /
  S3 invocation logs); NOT inline from the Converse response.
- Prompt caching managed by Bedrock agent runtime (limited control).
- Schema-validate + retry must be implemented INSIDE action-group Lambdas
  or as a post-processing step, not at the LLM-loop level.
- Trade-off: lower implementation effort for orchestration and HITL; less
  real-time metering granularity.

**Option B — Custom loop on the one-door Converse module:**
- Full Register-at-invoke-time model resolution (hot-swap without deploy).
- Inline token extraction from Converse response → real-time credit metering.
- Full prompt-caching control (cache checkpoints, discounted weight).
- Schema-validate + one-retry guard at the serving layer.
- Trade-off: must build orchestration (tool dispatch, multi-turn loops),
  implement a `returnControl`-equivalent HITL pause mechanism (custom SQS
  wait pattern or Step Functions callback), and manage agent state.

**Impact on downstream requirements:**
- REQ-SERVE-2, REQ-SERVE-3, REQ-SERVE-10, REQ-SERVE-11 apply AS WRITTEN
  only under Option B. Under Option A, their equivalents are:
  - SERVE-2A: model resolved at deploy from Register; redeploy on rotation.
  - SERVE-3A: metering via async invocation-log ETL (Firehose → Athena →
    meter reconciliation); near-real-time, not inline.
  - SERVE-10A: schema validation in action-group response post-processing.
  - SERVE-11A: caching delegated to Bedrock agent runtime defaults.
- REQ-CDK-5 and REQ-EVT-4 apply AS WRITTEN only under Option A.
  Under Option B, their equivalents are:
  - CDK-5B: no CfnAgent; agents are code modules in the one-door invoker.
  - EVT-4B: invoker Lambda calls Converse directly (not InvokeAgent).
- REQ-WB-2 (returnControl) applies natively under Option A.
  Under Option B, an equivalent HITL mechanism must be designed (e.g.,
  SQS + callback token, or Step Functions waitForTaskToken).

The decision is BLOCKING for design.md authoring.

### REQ-SERVE-1 — Single invocation module
The system SHALL provide a single invocation module (`services/ai-invoker`)
through which every Bedrock model call in the platform is routed, with no
exception path for agent, Snapshot, or editor-AI invocations.

### REQ-SERVE-2 — Register-resolved model selection [CONDITIONAL: Option B as-is; Option A see SERVE-2A]
When the one-door module receives an invocation request, the system SHALL
resolve the model ID from `contracts/model-register.md` by matching the
caller's declared seat at invoke time — NOT from hardcoded values in agent
code.

### REQ-SERVE-3 — Token metering to credits [CONDITIONAL: Option B as-is; Option A see SERVE-3A]
After each successful Bedrock Converse response, the system SHALL:
1. Extract `inputTokens`, `outputTokens`, and (where applicable)
   `cacheReadInputTokens` from the response metadata.
2. Compute credits consumed using per-model weights from the pricing table
   (`MODELWEIGHT#` items in DynamoDB).
3. Atomically increment the tenant's monthly meter
   (`METER#<tenantId>#<yyyymm>`) in DynamoDB.
4. Emit a `telemetry.credits.consumed` event with `{tenantId, agent, module,
   feature, inputTokens, outputTokens, creditsConsumed}`.

### REQ-SERVE-4 — Margin bar enforcement
The system SHALL NOT assign or serve a model whose measured $/task would yield
less than 50% net margin at credit pricing ($0.00396/credit). If a model's
margin headroom falls below 50% at quarterly re-validation, the Register entry
is marked EXPIRED and REQ-SERVE-5 applies.

### REQ-SERVE-5 — EXPIRED seat enforcement (CARRY-1 from spec-30)
Before any invocation, the one-door module SHALL verify that the resolved
Register entry has status ASSIGNED or PROVISIONAL and that the current date
is before the entry's expiry date. If the seat is EXPIRED or UNASSIGNED, the
invocation SHALL fail closed with error code `MODEL_SEAT_EXPIRED` — no silent
fallback, no degraded-quality model substitution.

### REQ-SERVE-6 — LegalLedger budget cap (CARRY-2 from spec-30)
The system SHALL refuse to invoke the LegalLedger seat until:
1. A model is ASSIGNED in the Register (currently UNASSIGNED — retrieval-gated
   re-eval pending), AND
2. A per-call budget cap is configured and enforced by the one-door module
   (monthly cap TBD, attached on assignment — see Register COND-4).
Any invocation attempt against an UNASSIGNED seat SHALL fail with error code
`MODEL_SEAT_UNASSIGNED`.

### REQ-SERVE-7 — Converse requestMetadata
Every Bedrock Converse call SHALL include `requestMetadata` with keys:
`tenantId`, `agent`, `module`, `feature` — the documented multi-tenant
attribution pattern (Part 22.3).

### REQ-SERVE-8 — Application inference profile (per-plan, not per-tenant)
Bedrock Converse calls SHALL attach an application inference profile scoped
to the tenant's plan tier (Launch / IMS Pro / Enterprise), NOT one per tenant
(account-level quota limits make per-tenant profiles infeasible at scale).
Per-tenant cost attribution is achieved via `requestMetadata` (REQ-SERVE-7)
and cost-allocation tags on the profile. Reserve per-app profiles for
multi-app scenarios if needed.

### REQ-SERVE-9 — Credit balance pre-check
Before invoking Bedrock, the one-door module SHALL check the tenant's Credit
balance. If the balance is exhausted (hard limit, no PAYG auto-refill, not
Enterprise), the invocation SHALL be paused with status
`PAUSED_FOR_CREDITS`. Exception: incident-reporting and HITL-approval flows
SHALL NEVER block on credits (compliance-safety > billing — steering 12).

### REQ-SERVE-10 — Schema-validate + one-retry guard (COND-3a) [CONDITIONAL: Option B as-is; Option A see SERVE-10A]
For Workhorse-tier invocations, the one-door module SHALL validate the
response against the declared output JSON schema. If validation fails, the
module SHALL retry ONCE with the same prompt. If the retry also fails schema
validation, the invocation SHALL return an error rather than invalid output.

### REQ-SERVE-11 — Prompt caching [CONDITIONAL: Option B as-is; Option A see SERVE-11A]
The one-door module SHALL enable prompt caching on every agent system prompt
and ISO-KB preamble, applying the discounted `w_cache` weight when computing
credits for cached-read tokens (Part 22.3 fairness rule).

---

## 4. Retrieval Grounding (AOSS)

### REQ-RET-1 — Mandatory tenantId metadata filter
Every AOSS retrieval query executed by any agent in scope SHALL include a
metadata filter on `tenantId` matching the requesting tenant's identity. An
AOSS query without this filter is a blocking defect (steering 01).

### REQ-RET-2 — Cross-tenant negative proof
The system SHALL include an integration test that asserts: a retrieval query
by Tenant A against a collection containing documents from Tenant A AND
Tenant B returns ZERO results belonging to Tenant B. This test is mandatory
and its absence is a review-blocking defect.

### REQ-RET-3 — 45-second cold-start timeout budget
Every AOSS data-access path SHALL implement exponential-backoff retry with:
- Base delay: 500 ms
- Factor: 2
- Jitter: randomised
- Ceiling: 45 s total elapsed
- Lambda timeout: >= 60 s

### REQ-RET-4 — Cold-start budget live demonstration
The system SHALL demonstrate (witnessed readback) that a forced cold-start
AOSS retrieval completes within the 45 s budget with retries, proving the
timeout and backoff configuration are correct under real scale-to-zero
conditions.

### REQ-RET-5 — Guru standard-text grounding
The 3 Domain Gurus SHALL ground clause-conformance answers on the tenant's
OWN uploaded ISO standard copy (stored in TENANT-DOCS-KB). No ISO standard
text is stored in the repository. Tenants upload their copyrighted standards;
the platform retrieves from those uploads (owner decision).

### REQ-RET-6 — CAPAGuru similar-NC semantic search
CAPAGuru SHALL retrieve "similar past nonconformity" records via AOSS
semantic search over historical NCs/root-causes for the requesting tenant,
subject to REQ-RET-1 (tenantId filter).

### REQ-RET-7 — Retrieval-grounded re-eval: guru-45001 (CARRY from spec-30)
The system SHALL execute a retrieval-grounded re-eval for the guru-45001 seat
(`moonshotai.kimi-k2.5`, PROVISIONAL at 0.843 vs 0.85 bar) once the AOSS
retrieval path is deployed. The re-eval SHALL:
1. Run the guru-45001 eval set WITH retrieval grounding against tenant-uploaded
   ISO 45001 content.
2. If the grounded score >= 0.85: confirm the assignment, update the Register
   status to ASSIGNED, record evidence.
3. If the grounded score < 0.85: mark the seat EXPIRED, trigger a swap
   evaluation with the next candidate, record the outcome.

### REQ-RET-8 — Retrieval-grounded re-eval: LegalLedger (CARRY from spec-30)
The system SHALL execute a retrieval-grounded re-eval for the LegalLedger
seat once the AOSS retrieval path is deployed. The re-eval SHALL:
1. Run the legal-ledger eval set WITH retrieval grounding.
2. If a candidate passes (quality bar mean >= 4.0, no criterion at 1):
   assign the model, set status ASSIGNED, attach monthly budget cap, record
   evidence in the Register.
3. If no candidate passes grounded: defer assignment, keep status UNASSIGNED,
   record the outcome.

### REQ-RET-9 — Workhorse PROVISIONAL re-eval (CARRY from spec-30, COND-3c)
The system SHALL re-evaluate the Workhorse seat (`us.amazon.nova-pro-v1:0`,
PROVISIONAL) under real agent load after agent deployment. If schema compliance
drops below the 100% bar (even with the one-retry guard), the seat is flagged
for swap evaluation. Outcome recorded in the Register.

---

## 5. Agent Writebacks and HITL Gate

### REQ-WB-1 — Action-group Lambda implementation
The system SHALL implement action-group Lambdas for the following @aws_iam
mutations already defined in the api-core GraphQL schema:
- `agentDraftDocument` (DocStudio)
- `agentProposeCorrectiveAction` (CAPAGuru)
- `agentGenerateChecklist` (LeadAuditor)
- `agentScoreReadiness` (LeadAuditor)
- `appendAuditEvent` (RecordsVault — append-only, no HITL)

### REQ-WB-2 — HITL gate on mutating writebacks [CONDITIONAL: Option A native; Option B requires equivalent]
For every mutating agent writeback (all except `appendAuditEvent`), the
agent orchestration SHALL pause execution before the write commits. Under
Option A this is native `returnControl`; under Option B an equivalent HITL
pause mechanism (e.g., Step Functions waitForTaskToken or SQS callback) must
be implemented. The write SHALL execute ONLY after human approval from an
authorized role per the role mapping in steering 05:
- DocStudio publish/approve → Quality Manager (+ EHS Mgr for 14001/45001 policy)
- CAPAGuru CAPA lifecycle → Quality Manager (9001) / EHS Manager (14001/45001)
- LeadAuditor finding/readiness → Auditor / Quality Manager
- ControlTower governance writes → Executive / Quality/EHS Manager
- RecordsVault retention-schedule changes → Quality Manager (sealing is exempt)

### REQ-WB-3 — Audit trail on every writeback
After every HITL-approved writeback commits, the system SHALL emit an audit
event through RecordsVault → the sealed immutable audit trail (DynamoDB
append-only + S3 Object Lock COMPLIANCE). The audit event SHALL carry:
`tenantId`, `eventId` (ULID), `timestamp`, `actor` (approving human + agent),
`module`, `clauseRef`, `standard`, `payloadHash` (SHA-256 of before/after),
`prevHash` (hash chain linkage per steering 04).

### REQ-WB-4 — Audit trail spine reuse
The writeback → audit-trail flow SHALL reuse the E2E spine proven in api-core
ACC-1 (DynamoDB `attribute_not_exists(pk)` idempotent append, hash-chain
integrity, S3 WORM sealer). No parallel or alternative audit path.

### REQ-WB-5 — End-to-end witnessed proof
The system SHALL demonstrate (witnessed readback): an agent proposes a
writeback (e.g., `agentProposeCorrectiveAction`) → HITL gate pauses → human
approves → write commits to RDS → audit event sealed → item retrievable
from immutable trail with correct hash chain. All steps in a single witnessed
execution.

---

## 6. Agent Event Consumption (SQS + DLQ)

### REQ-EVT-1 — Agent SQS queues (existing + new)
Each event-consuming agent SHALL have a dedicated SQS queue with a paired
Dead-Letter Queue. DLQ depth > 0 for 15 min = page alarm (steering 07).
- **Already deployed** (eventing-backbone): CapaIntakeQueue (FIFO) for
  CAPAGuru; AuditSinkQueue (FIFO) for RecordsVault audit-sealing;
  RecordsQueue (std) for RecordsVault records/retention.
- **New in this spec**: DocStudioQueue (std), LeadAuditorQueue (std),
  ControlTowerQueue (std) — each with paired DLQ.
- **Not needed**: 3 Gurus (advisory, user-triggered, no event consumption).

### REQ-EVT-2 — FIFO where ordering matters
CAPAGuru consumes from CapaIntakeQueue (FIFO, `messageGroupId = tenantId`,
deployed in eventing-backbone). RecordsVault audit-sink is AuditSinkQueue
(FIFO, deployed). New DocStudio, LeadAuditor, and ControlTower queues are
standard (ordering not critical for these event types).

### REQ-EVT-3 — Poison message handling
Every consumer Lambda SHALL handle parse failures by routing the malformed
message to the DLQ — never crash-loop. Powertools-based consumer library from
`services/eventing/` SHALL be reused.

### REQ-EVT-4 — Event-driven agent invocation [CONDITIONAL: Option A uses InvokeAgent; Option B uses Converse]
An invoker Lambda per agent SHALL: dequeue the SQS message, extract the
`CumplifyEvent` detail, invoke the agent with the event as session input
(via `InvokeAgent` under Option A, or direct Converse under Option B), and
handle the response (including HITL pause scenarios per REQ-WB-2).

### REQ-EVT-5 — EventBridge routing: existing queues + new agent rules
The deployed eventing-backbone (`infra/lib/eventing-stack.ts`) provides the
following queues and rules. Agents consume from these EXISTING queues:

| Rule | Pattern | Target Queue | Consuming Agent(s) |
|------|---------|--------------|---------------------|
| R-1 NcTriageRule | `detailType: [Audit.FindingRaised, Incident.Reported, EnvIncident.Reported, Aspect.SignificantImpact]` | NcTriageQueue (std) | NCTriage (out of scope) → output feeds CAPAGuru via R-2 |
| R-2 CapaIntakeRule | `detailType: [NC.Raised, CAPA.Opened, CAPA.Closed, CAPA.EffectivenessVerified, CAPA.ActionRequiresDocChange]` | CapaIntakeQueue (FIFO, via router) | **CAPAGuru** |
| R-3 AuditSinkRule | `detail: { auditTrail: [true] }` | AuditSinkQueue (FIFO, via router) | **RecordsVault** (audit-trail sealer) |
| R-7 RecordsRule | `detailType: [prefix: CAPA., prefix: Document., prefix: Risk.]` | RecordsQueue (std) | **RecordsVault** (retention/records) |

**New rules required by this spec** (agents not currently consuming any queue):

| New Rule | Pattern | Target Queue (new) | Consuming Agent |
|----------|---------|-------------------|-----------------|
| R-8 DocStudioRule | `detailType: [CAPA.ActionRequiresDocChange, Policy.Updated, Scope.Changed]` | DocStudioQueue (std, new + DLQ) | **DocStudio** |
| R-9 LeadAuditorRule | `detailType: [ManagementReview.ActionAudit, Objectives.OffTrack]` | LeadAuditorQueue (std, new + DLQ) | **LeadAuditor** |
| R-10 ControlTowerRule | `detailType: [Context.Updated, Scope.Changed, Policy.Updated, Risk.Escalated]` | ControlTowerQueue (std, new + DLQ) | **ControlTower** |

**Note:** The 3 Domain Gurus are advisory/user-triggered (routed by
ComplianceCopilot), NOT event-driven — they do NOT require SQS queues or
EventBridge rules.

All new rules SHALL use the canonical input transformer (FIX-1 format:
`{"detailType": "<dt>", "detail": <detail>}`), retry policy (3 attempts,
24h max age), and delivery-failure DLQ consistent with eventing-backbone
patterns.

---

## 7. AiStack CDK Infrastructure

### REQ-CDK-1 — AiStack joins CumplifyStage
The system SHALL create `infra/lib/ai-stack.ts` defining class `AiStack` and
add it to `CumplifyStage` with `addDependency` on DataStack, ApiStack,
EventingStack, and AuditTrailStack.

### REQ-CDK-2 — Build rules compliance
AiStack resources SHALL comply with P0/P1 build rules:
- `NodejsFunction`: runtime `NODEJS_22_X`, architecture `ARM_64`, memory
  >= 512 MB, bundling `{ externalModules: [], target: 'node22' }`.
- No hardcoded physical names (except `CumplifyCore`, `cumplify-events` where
  already established).
- `CfnOutput` for every resource ARN/ID needed for cross-stack readback.
- CDK Nag zero suppressions unless justified and resource-scoped.

### REQ-CDK-3 — Template-assertion tests
Every L1 resource detail (IAM policy statements, Lambda configurations, SQS
queue properties, Bedrock agent definitions) SHALL have a corresponding
template-assertion unit test in `infra/lib/ai-stack.unit.test.ts`.

### REQ-CDK-4 — IAM least privilege [CONDITIONAL on REQ-SERVE-0]
Under Option A (Managed Agents): each action-group Lambda SHALL have a
dedicated IAM role scoped to the specific RDS/DynamoDB/S3 resources it
touches. The Bedrock agent execution role holds `bedrock:InvokeModel`
(Resource: `*`). Each action-group Lambda requires a resource-based policy
allowing `bedrock.amazonaws.com` (`SourceAccount` + agent-alias `SourceArn`).
Under Option B (Custom loop): only the ai-invoker Lambda holds
`bedrock:InvokeModel`; action-group Lambdas do NOT need Bedrock permissions.
In both cases: no cross-agent permission sharing.

### REQ-CDK-5 — Bedrock agent definitions [CONDITIONAL: Option A only]
If Option A is selected: each of the 8 agents SHALL be defined as a Bedrock
Agent (`CfnAgent`) with:
- Model resolved from the Register (parameterised, not hardcoded).
- Action groups pointing to the corresponding Lambda(s).
- Guardrail attachment (`CfnGuardrail` with PII anonymize/block +
  `PROMPT_ATTACK` filter).
- Knowledge base association for agents that use retrieval (DocStudio,
  LeadAuditor, CAPAGuru, 3 Gurus, RecordsVault).
If Option B is selected: this requirement is replaced by CDK-5B (agent
logic as code modules in the invoker; no CfnAgent resources).

### REQ-CDK-6 — AOSS data-access policy
The Bedrock KB service role SHALL be present in the AOSS data-access policy.
Each retrieval-using agent's KB configuration SHALL reference the correct
AOSS collection with the tenantId metadata filter enforced at the application
layer.

### REQ-CDK-7 — No Anthropic models
No Bedrock agent definition, inference profile, or IAM statement SHALL
reference any Anthropic model ID. A model reference containing `anthropic`
is a review-blocking defect (owner decision 2026-07-06; steering 15).

---

## 8. Identity and Security

### REQ-SEC-1 — @aws_iam agent path
All agent writeback mutations use the `@aws_iam` auth directive. The agent
execution role SHALL authenticate via IAM (not Cognito) per steering 16.
No agent ever holds or uses a Cognito token.

### REQ-SEC-2 — Tenant isolation in agent context
Every agent invocation SHALL carry the `tenantId` derived from the triggering
event or HITL session. The agent's action-group Lambdas SHALL enforce
tenantId in all data operations:
- DynamoDB: PK-prefix `TENANT#<tenantId>#*` (IAM condition key).
- RDS: session-level RLS on `tenant_id`.
- AOSS: metadata filter on `tenantId` (REQ-RET-1).

### REQ-SEC-3 — IAM + credential code requires human review
Any code that modifies IAM policies, creates/rotates secrets, or touches
credential material SHALL be flagged `REQUIRES-HUMAN` and committed only
after architect review. Kiro SHALL NOT auto-commit such code.

---

## 9. Acceptance Criteria

### ACC-1 — One-door serving path witnessed
Each assigned seat (Workhorse × 4 agents, Lightweight × 1, Guru-9001,
Guru-14001) SHALL be invoked live through the one-door path. Evidence:
model resolved from Register, tokens metered, credits computed, margin bar
checked — all witnessed with timestamps and exit codes.

### ACC-2 — Negative proofs (fail-closed)
1. An EXPIRED seat invocation SHALL return `MODEL_SEAT_EXPIRED` (no output).
2. The LegalLedger seat invocation SHALL return `MODEL_SEAT_UNASSIGNED`
   (no output). Both witnessed.

### ACC-3 — Agent writeback E2E
At least one mutating writeback (e.g., `agentProposeCorrectiveAction`) SHALL
be demonstrated end-to-end: agent proposal → HITL gate pause →
human approval → RDS write → RecordsVault audit event sealed →
hash-chain-linked item retrievable from trail. Witnessed.

### ACC-4 — AOSS retrieval with tenant isolation
A retrieval query SHALL return tenant-filtered results. A cross-tenant
negative proof SHALL demonstrate zero leakage. The 45 s cold-start timeout
budget SHALL be demonstrated under a forced cold start. All witnessed.

### ACC-5 — Retrieval-grounded re-evals recorded
Guru-45001 and LegalLedger retrieval-grounded re-eval outcomes SHALL be
recorded in `contracts/model-register.md` with evidence links. Workhorse
PROVISIONAL re-eval outcome SHALL be recorded after live agent load testing.

### ACC-6 — CDK Nag zero
`cdk synth` SHALL produce zero CDK Nag errors for AiStack. Any suppression
SHALL be justified and resource-scoped (not stack-wide).

### ACC-7 — Template-assertion tests green
`npx vitest --run` for `ai-stack.unit.test.ts` SHALL pass with all L1
assertions verifying IAM, Lambda config, SQS, Bedrock agent definitions.

### ACC-8 — Infrastructure floor
Minimum delivery timeline: D3 (3 working days for infra skeleton +
one-door module + first agent live). Full acceptance may extend beyond D3
for re-eval campaigns (ACC-5) which require architect-executed Bedrock
invocations.

---

## 10. Out of Scope

- Roadmap agents (agents-roadmap-14, spec 11) — M6–M13 agents.
- Frontend HITL queue UI (spec 9) — this spec exposes the HITL gate + queue
  mechanics, not the approval UI.
- Billing enforcement beyond metering (spec 8) — credit packs, Stripe
  integration, dunning.
- Public API (Part 24.1).
- NCTriage agent (Lightweight tier, feeds CAPAGuru but not one of the 8 in
  this scope — it shares the Lightweight seat assignment but is deployed
  separately as part of the CAPA intake chain).
- LegalLedger deployment (UNASSIGNED; only the fail-closed gate + re-eval
  are in scope).
- `agentAssessRisk` action-group Lambda (RiskSentinel — spec 11, not one of
  the 8 agents in scope).
- `agentTriageNC` action-group Lambda (NCTriage — Lightweight tier, not one
  of the 8 agents in scope).

---

## 11. Constraints and Build Rules

| ID | Constraint | Source |
|----|-----------|--------|
| C-1 | NodejsFunction NODEJS_22_X ARM_64 >= 512 MB, bundling `{externalModules:[], target:'node22'}` | P0/P1 carry |
| C-2 | No hardcoded physical names (except CumplifyCore, cumplify-events) | 06-cdk-conventions |
| C-3 | CfnOutputs for every cross-stack readback | 06-cdk-conventions |
| C-4 | CDK Nag zero (justified, resource-scoped suppressions only) | 06-cdk-conventions |
| C-5 | Template-assertion tests for every L1 detail | 13-testing |
| C-6 | Evidence = executed commands only; no fabricated output | 19-kiro-truth |
| C-7 | Checkbox + evidence in same commit (truth rule 7) | 19-kiro-truth |
| C-8 | Readbacks carry timestamp + exit code + cdk-outputs SHA (truth rule 8) | 19-kiro-truth |
| C-9 | IAM + credential code = REQUIRES-HUMAN | Security policy |
| C-10 | Kiro AWS access = `AWS_PROFILE=cumplify-dev-readonly` for verification reads ONLY | Owner policy |
| C-11 | All deploys and live Bedrock invokes are architect-executed | Owner policy |
| C-12 | No Anthropic models anywhere | Owner decision 2026-07-06 |
| C-13 | Budget: model spend metered; live-invoke campaigns need architect-approved estimate | spec-30 discipline |

---

## 12. Traceability Matrix

| Requirement | Steering | Architecture Source | Acceptance |
|-------------|----------|---------------------|------------|
| REQ-SERVE-0 | 12-token-metering, 15-model-policy, 05-hitl | Part 22.3, Register, agent-catalog | BLOCKING (design) |
| REQ-SERVE-1..11 | 12-token-metering, 15-model-policy | Part 22.3, Register | ACC-1, ACC-2 |
| REQ-RET-1..9 | 01-tenancy-rules, 02-aoss-rule | Module-spec AOSS notes, spec-30 carries | ACC-4, ACC-5 |
| REQ-WB-1..5 | 05-hitl, 04-immutability, 16-identity-boundaries | Agent-catalog, api-core schema | ACC-3 |
| REQ-EVT-1..5 | 07-events | eventing-stack.ts (ground truth), module-spec chains | (infra tests) |
| REQ-CDK-1..7 | 06-cdk-conventions | v7 table row 4, cdk-guidance | ACC-6, ACC-7 |
| REQ-SEC-1..3 | 16-identity-boundaries, 01-tenancy-rules | Spine C.2, Part 32 | ACC-4 |
