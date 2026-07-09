# agents-existing-8 — Design (Template C)

**Requirements baseline:** R2 (fd18e6f) — APPROVED
**Paradigm decision:** Option B — Custom Converse loop (19303c9)
**Revision:** D2

**D1 findings resolved:**
- D-1 (HIGH): §1.4 rewritten — wIn/wOut/wCache derivation formula defined from
  live Bedrock prices; reconciled with margin-inputs.json (per-task = average
  targets, not billing unit); per-token = variable credits flagged for owner.
- D-2 (MEDIUM): §3.4 GSI re-keyed to `TENANT#<tenantId>#HITL_PENDING` (tenant-
  isolated, LeadingKeys-compatible).
- D-3 (MEDIUM): §1.6 caching verified per model — Nova Pro/Lite support explicit
  caching (system+messages, 1K min, 5min TTL); qwen/kimi do NOT support prompt
  caching. SERVE-11 + wCache conditional per model.
- D-4 (LOW-MED): §1.3 states trade-off (build-time map = redeploy on reassign);
  confirms expiry date-check is live at invoke.
- D-5 (LOW): meter key corrected to `TENANT#<tenantId>#METER` / `MONTH#<yyyymm>`
  throughout.

---

## 0. Decision Record

| ID | Decision | Justification |
|----|----------|---------------|
| D-0 | Option B (custom Converse loop) | Owner decision 19303c9. Enables invoke-time Register resolution, inline token metering, schema-retry, prompt-cache weight control. |
| D-1 | HITL via Step Functions `waitForTaskToken` | Durable (survives Lambda timeout), auditable (SFN execution history), carries human actor identity into audit event. Preferred over SQS callback (stateless, harder to audit). |
| D-2 | Extend spec-30 Converse pattern (services/model-evals runner.ts) | Proven retry + token extraction. Avoids reinvention. |
| D-3 | Reuse api-core audit-trail spine (services/audit-trail appender) | Proven hash-chain + WORM sealing. No parallel path. |
| D-4 | Titan Embed v2 = 1024 dimensions | Corpus-corrected (NOT 1536). |
| D-5 | Guardrails via Converse `guardrailConfig` | CfnGuardrail resource created; attached at invoke-time, not via CfnAgent (which doesn't exist under Option B). |

---

## 1. One-Door Module Design (`services/ai-invoker`)

### 1.1 Module Structure

```
services/ai-invoker/
├── src/
│   ├── index.ts              # Public API: invoke(seat, messages, opts)
│   ├── register-resolver.ts  # Reads contracts/model-register.md → seat→modelId map
│   ├── converse.ts           # BedrockRuntimeClient + ConverseCommand wrapper
│   ├── metering.ts           # Token→credit computation + DynamoDB meter update
│   ├── credit-precheck.ts    # Balance check + PAUSED_FOR_CREDITS logic
│   ├── schema-retry.ts       # JSON schema validation + one-retry guard
│   ├── margin-check.ts       # $/task vs margin mandate (offline, deploy-time)
│   ├── guardrail.ts          # guardrailConfig builder (PII + PROMPT_ATTACK)
│   └── types.ts              # InvokeRequest, InvokeResponse, SeatId, etc.
├── __tests__/
│   ├── register-resolver.test.ts
│   ├── metering.test.ts
│   ├── credit-precheck.test.ts
│   ├── schema-retry.test.ts
│   └── converse.test.ts
└── package.json              # @cumplify/ai-invoker workspace package
```

### 1.2 Invocation Flow (REQ-SERVE-1..11)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ invoke(seat, messages, opts)                                            │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. Register resolution (SERVE-2)                                        │
│    - Load seat→modelId from compiled Register map                       │
│    - If status = EXPIRED → throw MODEL_SEAT_EXPIRED (SERVE-5)           │
│    - If status = UNASSIGNED → throw MODEL_SEAT_UNASSIGNED (SERVE-6)     │
│                                                                         │
│ 2. Credit pre-check (SERVE-9)                                           │
│    - Read TENANT#<tenantId>#METER / MONTH#<yyyymm> from DynamoDB         │
│      (Redis-cached hot read)                                             │
│    - If exhausted AND not incident/HITL → return PAUSED_FOR_CREDITS     │
│    - Incident/HITL exemption: skip pre-check                            │
│                                                                         │
│ 3. Build Converse params                                                │
│    - modelId from step 1                                                │
│    - messages from caller                                               │
│    - system prompt with cache checkpoint (SERVE-11)                     │
│    - guardrailConfig: { guardrailId, guardrailVersion } (CDK-5B/D-5)    │
│    - requestMetadata: { tenantId, agent, module, feature } (SERVE-7)    │
│    - inferenceConfig: { temperature, maxTokens } from agent config      │
│                                                                         │
│ 4. Call Bedrock Converse (EVT-4B)                                       │
│    - Retry: 5xx/429/throttle → exponential backoff (base 1s, max 3)     │
│    - Extends spec-30 runner.ts pattern                                  │
│                                                                         │
│ 5. Extract response + usage (SERVE-3)                                   │
│    - inputTokens, outputTokens, cacheReadInputTokens from response      │
│    - stopReason, output text                                            │
│                                                                         │
│ 6. Schema-validate + one-retry (SERVE-10, Workhorse tier only)          │
│    - Validate response JSON against declared schema                     │
│    - If fail → retry ONCE (goto step 4)                                 │
│    - If retry fails → return SCHEMA_VALIDATION_ERROR                    │
│                                                                         │
│ 7. Meter tokens → credits (SERVE-3 continued)                           │
│    - credits = Σ(inputTokens × w_in + cacheRead × w_cache              │
│                  + outputTokens × w_out) per model weights              │
│    - Atomic DynamoDB UpdateItem ADD on                                  │
│      TENANT#<tenantId>#METER / MONTH#<yyyymm>                          │
│    - Emit telemetry.credits.consumed event                              │
│                                                                         │
│ 8. Return InvokeResponse { text, usage, credits, modelId }              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Register Resolution

The Register (`contracts/model-register.md`) is parsed at BUILD time into a
typed JSON map committed as `services/ai-invoker/data/register-compiled.json`.
Schema:

```typescript
interface CompiledRegister {
  seats: Record<SeatId, {
    modelId: string;
    status: 'ASSIGNED' | 'PROVISIONAL' | 'EXPIRED' | 'UNASSIGNED';
    expiry: string | null;   // ISO 8601 date or null for contingent
    marginHeadroom: number;  // 0-1
  }>;
  compiledAt: string;
  sourceCommit: string;
}
```

At invoke time the resolver:
1. Loads the compiled map (cold-cached in Lambda memory).
2. Checks `status` — EXPIRED/UNASSIGNED → fail closed.
3. Checks `expiry` against **current date (live, at invoke time)** — past
   expiry → fail closed (`MODEL_SEAT_EXPIRED`).
4. Returns `modelId`.

**Trade-off (D-4):** The compiled map is build-time: a model REASSIGNMENT
requires a CI deploy to propagate the new `modelId`. This is intentional —
CI-gated is safer than runtime-loaded (prevents an accidental Register edit
from immediately routing traffic to an untested model). The expiry date-check
is LIVE (step 3 above), so an expired seat fails closed even without a deploy.
Quarterly re-validations already require a code commit (Register update +
evidence), so the deploy gate adds no friction.

**LegalLedger special case (SERVE-6):** The compiled Register has LegalLedger
as UNASSIGNED. The monthly budget cap is a second pre-check: even when
eventually assigned, the invoker verifies
`monthlySpend < monthlyBudgetCap` before proceeding.

### 1.4 Token → Credit Metering (Part 22) — Weight Derivation

#### Calibration formula

The target is **1,000 credits ≈ $1.00 raw Bedrock cost**. Weights are derived
from live Bedrock prices (fetched via `services/model-evals/src/pricing.ts`
`fetchPricing()` — the same Pricing API module used in spec-30 evals):

```
wIn(model)    = inputPricePerMToken(model) × 1,000
wOut(model)   = outputPricePerMToken(model) × 1,000
wCache(model) = cacheReadPricePerMToken(model) × 1,000   (if caching supported)
              = N/A                                       (if caching not supported)
```

Where `inputPricePerMToken` is USD per 1M tokens from the Pricing API. The
× 1,000 factor converts "USD per 1M tokens" to "credits per 1M tokens" under
the 1,000-credits-≈-$1.00 calibration.

#### Current weights (derived from spec-30 Pricing API data, 2026-07-06)

| Model | Seat | wIn (credits/1M) | wOut (credits/1M) | wCache (credits/1M) |
|-------|------|-----------------|-------------------|---------------------|
| `us.amazon.nova-pro-v1:0` | Workhorse | fetched × 1000 | fetched × 1000 | fetched × 1000 (supported) |
| `us.amazon.nova-lite-v1:0` | Lightweight | fetched × 1000 | fetched × 1000 | fetched × 1000 (supported) |
| `qwen.qwen3-next-80b-a3b` | Guru-9001/14001 | fetched × 1000 | fetched × 1000 | **N/A** (no caching) |
| `moonshotai.kimi-k2.5` | Guru-45001 | fetched × 1000 | fetched × 1000 | **N/A** (no caching) |

Actual numeric values are fetched at build time from the live Pricing API and
seeded into DynamoDB `MODELWEIGHT#<modelId>` items via a CDK custom resource.
They are NOT hardcoded (C-3 pricing rule from spec-30). The custom resource
runs `fetchPricing([...modelIds])` at deploy and writes the weights.

#### DynamoDB weight items

```
PK: MODELWEIGHT#<modelId>
SK: VERSION#<yyyymmdd>
wIn: number
wOut: number
wCache: number | null   (null = caching not supported for this model)
effectiveFrom: string   (ISO 8601)
sourceCommit: string
```

Append-only, versioned. The invoker reads the latest version per model
(query SK descending, limit 1).

#### Credits computation at invoke time

```typescript
creditsConsumed = (
  inputTokens * wIn +
  (cacheReadTokens ?? 0) * (wCache ?? wIn) +  // fallback to wIn if no cache support
  outputTokens * wOut
) / 1_000_000;
```

If `wCache` is null for the model (qwen, kimi), `cacheReadInputTokens` will
always be 0 in the Converse response (no caching enabled), so the fallback is
a safety guard that never triggers.

#### Meter DynamoDB item (D-5 corrected)

```
PK: TENANT#<tenantId>#METER
SK: MONTH#<yyyymm>
creditsUsed: number (atomic ADD)
lastUpdated: string
```

Tenant-isolated via PK prefix (LeadingKeys-compatible).

#### Reconciliation with margin-inputs.json

`services/model-evals/data/margin-inputs.json` defines `creditsPerTask` per
seat (e.g., guru=5, workhorse=3). These are **expected-average targets for
margin modeling** — they represent the anticipated average credits consumed per
agent task at the modeled token distribution. They are NOT the billing unit.

The actual billing unit is **per-token** (variable credits per call). A call
that uses fewer tokens than average costs fewer credits; a call that uses more
costs more. The per-task averages validate that the margin mandate (>50%) holds
under typical usage patterns. The margin-bar check (SERVE-4) compares actual
$/task (from eval runs) against credit pricing.

**Owner flag:** per-token metering means tenants see variable credit
consumption per AI action (not flat per-task). If the product promised flat
per-task pricing, this requires owner confirmation. Per Part 22, the
architecture has always been per-token with credits as the billing unit —
no flat-task promise exists in the pricing design. Flagged for awareness.

### 1.5 Inference Profile (SERVE-8)

Three application inference profiles (one per plan tier: Launch, IMS-Pro,
Enterprise) are created in the AiStack. Each profile carries cost-allocation
tags `plan=<tier>`. Per-tenant attribution is via `requestMetadata.tenantId`
(SERVE-7), NOT per-tenant profiles.

### 1.6 Prompt Caching (SERVE-11) — Conditional Per Model

Prompt caching support verified against AWS documentation (2026-07-08):

| Model | Caching Support | Min Tokens | Max Checkpoints | TTL | Fields | Source |
|-------|----------------|------------|-----------------|-----|--------|--------|
| `us.amazon.nova-pro-v1:0` | **YES** (explicit) | 1,000 | 4 | 5 min | `system`, `messages` | [Nova Pro model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-pro.html) |
| `us.amazon.nova-lite-v1:0` | **YES** (explicit) | 1,000 | 4 | 5 min | `system`, `messages` | [Prompt caching docs](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html) |
| `qwen.qwen3-next-80b-a3b` | **NO** | — | — | — | — | Not listed in supported models (prompt caching docs, GA announcement) |
| `moonshotai.kimi-k2.5` | **NO** | — | — | — | — | Not listed in supported models (prompt caching docs, GA announcement) |

**Implementation rules:**
- For Nova Pro/Lite (Workhorse + Lightweight seats): the invoker adds a
  `cachePoint` marker in the system prompt content block. Converse request
  uses the documented format: `{ "cachePoint": { "type": "default" } }` after
  the static preamble. Max 20K tokens cached per Nova models.
- For qwen/kimi (Guru seats): NO `cachePoint` is added. `wCache` is null in
  the weight table. `cacheReadInputTokens` will be 0 in responses.
- SERVE-11 applies ONLY to Nova-class seats. It is a no-op for Guru seats.
- The `w_cache` discounted weight applies ONLY when `cacheReadInputTokens > 0`
  in the response (i.e., only for Nova models where caching is active).

**Note:** The earlier D1 reference to "anthropic_beta extension" was incorrect.
Nova uses native Bedrock prompt caching via the Converse API `cachePoint`
object in content blocks — no model-specific extension needed.

---

## 2. Event Routing and Agent Invocation (REQ-EVT-1..5)

### 2.1 Existing Queues Consumed by In-Scope Agents

| Queue (deployed in EventingStack) | Type | Consuming Agent | Rule |
|-----------------------------------|------|-----------------|------|
| CapaIntakeQueue | FIFO | CAPAGuru | R-2 (`NC.Raised`, `CAPA.Opened`, `CAPA.Closed`, `CAPA.EffectivenessVerified`, `CAPA.ActionRequiresDocChange`) |
| AuditSinkQueue | FIFO | RecordsVault (audit sealing) | R-3 (`detail.auditTrail: [true]`) |
| RecordsQueue | Std | RecordsVault (retention/records) | R-7 (prefix: `CAPA.`, `Document.`, `Risk.`) |

### 2.2 New Queues + Rules (created in AiStack)

| New Queue | Type | DLQ | Consuming Agent | New Rule | Pattern |
|-----------|------|-----|-----------------|----------|---------|
| DocStudioQueue | Std | DocStudioDlq | DocStudio | R-8 DocStudioRule | `detailType: [CAPA.ActionRequiresDocChange, Policy.Updated, Scope.Changed]` |
| LeadAuditorQueue | Std | LeadAuditorDlq | LeadAuditor | R-9 LeadAuditorRule | `detailType: [ManagementReview.ActionAudit, Objectives.OffTrack]` |
| ControlTowerQueue | Std | ControlTowerDlq | ControlTower | R-10 ControlTowerRule | `detailType: [Context.Updated, Scope.Changed, Policy.Updated, Risk.Escalated]` |

All new rules:
- Target: direct SQS (standard queue — no router needed).
- Input transformer: canonical `{"detailType": "<dt>", "detail": <detail>}`.
- Retry: 3 attempts, 24h max event age.
- Failure: delivery-failure DLQ (imported from EventingStack).
- DLQ alarms: depth > 0 for 15 min = page (same pattern as EventingStack).

### 2.3 Agent Invoker Lambda (EVT-4B)

One invoker Lambda per event-consuming agent (5 total: CAPAGuru, RecordsVault
×2 queues, DocStudio, LeadAuditor, ControlTower). Each:

1. Attached as SQS event source (`reportBatchItemFailures: true`).
2. Parses `QueueMessage` via `createHandler` / `createFifoHandler` from
   `services/eventing/src/consumer.ts` (reuse, not reinvent).
3. Extracts `CumplifyEvent` → builds agent-specific prompt (system prompt +
   event payload as user message).
4. Calls `invoke(seat, messages, opts)` from `services/ai-invoker`.
5. If the agent's response proposes a mutation → enters the HITL flow (§3).
6. If advisory/read-only (Gurus) → returns response directly.

**Gurus (ISO 9001/14001/45001):** NOT event-driven. Invoked on-demand from
a user-facing Lambda (routed by ComplianceCopilot via AppSync). No SQS queue.
The Guru invoker Lambda is an AppSync `@aws_cognito` resolver that:
- Extracts `tenantId` from resolver context.
- Calls `invoke('guru-9001' | 'guru-14001' | 'guru-45001', messages, opts)`.
- Includes AOSS retrieval step (§4) before Converse.

### 2.4 Agent Code Modules (CDK-5B)

Each agent is a code module, not a CfnAgent. Structure:

```
services/agents/
├── control-tower/
│   ├── prompt.ts        # System prompt + tool definitions
│   ├── tools.ts         # Tool dispatch (governance-write, route-task)
│   └── handler.ts       # SQS consumer → invoke → tool loop
├── doc-studio/
│   ├── prompt.ts
│   ├── tools.ts         # doc-draft, doc-version-control, doc-publish
│   └── handler.ts
├── lead-auditor/
│   ├── prompt.ts
│   ├── tools.ts         # audit-checklist-gen, audit-finding-write
│   └── handler.ts
├── capa-guru/
│   ├── prompt.ts
│   ├── tools.ts         # capa-open, capa-rootcause, capa-verify
│   └── handler.ts
├── records-vault/
│   ├── prompt.ts
│   ├── tools.ts         # records-retain, records-audit-append
│   └── handler.ts
├── guru-9001/
│   ├── prompt.ts
│   └── handler.ts       # AppSync resolver (user-facing)
├── guru-14001/
│   ├── prompt.ts
│   └── handler.ts
├── guru-45001/
│   ├── prompt.ts
│   └── handler.ts
└── shared/
    ├── tool-loop.ts     # Multi-turn tool-use orchestration loop
    ├── hitl.ts          # HITL gate (Step Functions integration)
    └── retrieval.ts     # AOSS retrieval wrapper (§4)
```

### 2.5 Tool-Use Orchestration Loop (`shared/tool-loop.ts`)

The custom Converse loop handles multi-turn tool use:

```typescript
async function toolLoop(seat: SeatId, systemPrompt: string,
  messages: Message[], tools: ToolConfig[], opts: ToolLoopOpts): Promise<AgentResult> {
  const MAX_TURNS = 10; // loop guard
  let turnMessages = [...messages];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await invoke(seat, turnMessages, {
      system: systemPrompt, tools, ...opts
    });

    if (response.stopReason === 'end_turn') {
      return { finalResponse: response.text, turns: turn + 1 };
    }

    if (response.stopReason === 'tool_use') {
      const toolResults = await dispatchTools(response.toolUseBlocks, opts);
      // Check if any tool result triggers HITL gate
      const hitlResult = toolResults.find(r => r.requiresHitl);
      if (hitlResult) {
        return await enterHitlGate(hitlResult, response, turnMessages, opts);
      }
      turnMessages = [...turnMessages, assistantMsg(response), toolResultMsg(toolResults)];
    }
  }
  throw new LoopGuardError(`Agent exceeded ${MAX_TURNS} turns`);
}
```

---

## 3. HITL Gate Design (REQ-WB-2 — Step Functions `waitForTaskToken`)

### 3.1 Why Step Functions (Decision D-1)

| Criterion | SQS Callback | Step Functions waitForTaskToken |
|-----------|-------------|-------------------------------|
| Durability | Message TTL (14d max) | Execution history (90d) |
| Auditability | Manual logging | Built-in execution events |
| Timeout control | Visibility timeout hacks | Native task timeout |
| Human actor capture | Custom attribute | Input to SendTaskSuccess |
| Survives Lambda timeout | Yes | Yes |
| Cost at scale | ~$0 | $0.025/1000 transitions (~$2.50/mo at 100k tasks) |

Step Functions wins on durability + auditability at negligible cost.

### 3.2 HITL State Machine

```
┌──────────────────────────────────────────────────────────────────┐
│  AgentHitlStateMachine (Express → Standard for waitForTaskToken) │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐    ┌─────────────────┐    ┌──────────────────┐  │
│  │ RecordProposal │→│ WaitForApproval │→│ ExecuteWriteback  │  │
│  │ (Pass state)   │ │ (Task token)    │ │ (Lambda)          │  │
│  └────────────┘    └────────┬────────┘    └────────┬─────────┘  │
│                             │                      │             │
│                    timeout (7d)              ┌─────▼──────────┐  │
│                       │                     │ EmitAuditEvent  │  │
│                    ┌──▼────────┐            │ (Lambda)        │  │
│                    │ TimedOut   │            └────────┬────────┘  │
│                    │ (Fail)     │                     │           │
│                    └───────────┘              ┌──────▼────────┐  │
│                                              │ Success        │  │
│                                              └───────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Flow Details

1. **Agent proposes mutation:** The tool-loop detects a mutating tool call
   (e.g., `capa-open`, `doc-publish`). Instead of executing it, the tool
   dispatcher:
   - Serializes the proposed action (tool name, args, agent context).
   - Starts a Step Functions execution with:
     ```json
     {
       "tenantId": "...",
       "agentName": "CAPAGuru",
       "proposedAction": { "tool": "capa-open", "args": {...} },
       "conversationState": [...],  // messages so far
       "taskToken": "<sfn-generated>"
     }
     ```
   - The `WaitForApproval` state issues the task token.
   - The invoker Lambda returns `{ status: 'HITL_PENDING', executionArn }`.

2. **Human approval (external):** The frontend HITL queue (spec 9) polls
   for pending approvals via an AppSync query that reads from a
   `HITL_PENDING` DynamoDB item (written by RecordProposal). When the human
   approves:
   - Calls `sfn:SendTaskSuccess` with:
     ```json
     {
       "approved": true,
       "approver": "cognito-sub-of-human",
       "role": "QualityManager",
       "justification": "...",  // optional, required if flagged
       "timestamp": "2026-07-08T..."
     }
     ```

3. **ExecuteWriteback Lambda:** Receives the original proposed action +
   approval context. Executes the RDS/DynamoDB/S3 write via the
   corresponding tool function (reusing the module's resolver logic from
   api-core where possible).

4. **EmitAuditEvent Lambda:** Calls `publishAuditEvent` (from
   `services/eventing/src/publisher.ts`) with:
   - `actor`: `"agent:CAPAGuru+human:<approver-sub>"`
   - `clauseRef`, `module`, `standard` from the agent context.
   - `payload`: `{ before: null, after: <writeback-result> }` (for hash).
   - `auditTrail: true` → routes to audit-sink FIFO → appender → sealed.

5. **Timeout (7d):** If no approval within 7 days, the execution fails.
   A CloudWatch alarm on failed HITL executions pages the ops team.

### 3.4 DynamoDB HITL Items

```
PK: TENANT#<tenantId>#HITL
SK: PENDING#<executionArn-suffix>
itemType: HITL_PENDING
agentName: string
proposedAction: { tool, args }
createdAt: ISO 8601
sfnExecutionArn: string
status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'TIMED_OUT'
```

TTL: 30 days after resolution.

**GSI (D-2 corrected):** `GSI-HITL-PENDING` keyed on:
- GSI PK: `TENANT#<tenantId>#HITL_PENDING`
- GSI SK: `createdAt` (ISO 8601, enables newest-first query)

This ensures the frontend query is tenant-isolated and LeadingKeys-compatible
(PK starts with `TENANT#<tenantId>#`). The GSI PK is written as an attribute
on the base item (`gsiHitlPendingPk`) and projected only for items with
`status = 'PENDING'`. Resolved items (APPROVED/REJECTED/TIMED_OUT) remove the
GSI attribute via UpdateItem (sparse GSI pattern — only pending items appear).

Added to the api-core GSI PK prefix test (`TENANT#`-prefix assertion).

---

## 4. AOSS Retrieval Path (REQ-RET-1..6)

### 4.1 Retrieval Wrapper (`services/agents/shared/retrieval.ts`)

```typescript
interface RetrievalRequest {
  tenantId: string;          // MANDATORY — no unfiltered query
  collectionId: string;      // ISO-KB or TENANT-DOCS-KB
  queryText: string;
  topK: number;              // default 5
  scoreThreshold?: number;   // optional relevance floor
}

interface RetrievalResult {
  chunks: Array<{ text: string; score: number; metadata: Record<string, string> }>;
  latencyMs: number;
  coldStart: boolean;        // true if first attempt timed out + retried
}
```

Implementation:
1. Build AOSS query with **mandatory** metadata filter:
   `{ "tenantId": { "$eq": request.tenantId } }` (REQ-RET-1).
2. Call `@opensearchserverless/opensearch-js` with:
   - Exponential-backoff retry: base 500ms, factor 2, jitter, ceiling 45s
     total elapsed (REQ-RET-3, steering 02).
   - Connection timeout: 50s. Socket timeout: 50s.
3. If all retries exhausted → throw `AossColdStartTimeoutError`.
4. Lambda timeout for any AOSS-touching function: **90s** (>= 60s mandate,
   allows for 45s cold-start + processing).

### 4.2 Knowledge Base Collections

| Collection | Content | Embedding | Dimensions | Agents |
|------------|---------|-----------|------------|--------|
| `ISO-KB` | Tenant-uploaded ISO standard copies (9001/14001/45001) | Titan Embed v2 (`amazon.titan-embed-text-v2:0`) | **1024** | 3 Gurus, LeadAuditor, DocStudio, CAPAGuru |
| `TENANT-DOCS-KB` | Tenant compliance docs (manuals, procedures, evidence) | Titan Embed v2 | **1024** | All retrieval-using agents |
| `NC-HISTORY` | Historical NCs/root-causes per tenant | Titan Embed v2 | **1024** | CAPAGuru (REQ-RET-6) |

All collections: AOSS VECTORSEARCH type, NextGen scale-to-zero, shared AOSS
encryption + network policies from DataStack. Metadata schema includes
`tenantId` (string, filterable) + `standard` + `clauseRef`.

### 4.3 Guru Standard-Text Grounding (REQ-RET-5)

Gurus retrieve from **ISO-KB** which contains ONLY tenant-uploaded copies of
the ISO standards. No standard text in the repo. The retrieval flow:
1. User asks a clause question → ComplianceCopilot routes to appropriate Guru.
2. Guru invoker calls `retrieve({ tenantId, collectionId: 'ISO-KB', queryText })`.
3. Retrieved chunks are injected into the user message as grounding context.
4. Guru system prompt instructs: "Answer ONLY from the provided context.
   Cite clause numbers verbatim. If no relevant context found, state that
   the tenant has not uploaded the relevant standard section."

### 4.4 CAPAGuru Similar-NC Search (REQ-RET-6)

When CAPAGuru processes an incoming NC (from CapaIntakeQueue), before
proposing a corrective action it:
1. Calls `retrieve({ tenantId, collectionId: 'NC-HISTORY', queryText: ncDescription })`.
2. Injects similar past NCs + their root causes into the prompt.
3. The model uses historical patterns to inform the proposed CAPA.

### 4.5 Cross-Tenant Negative Proof (REQ-RET-2)

Integration test (`services/agents/__tests__/cross-tenant-isolation.test.ts`):
1. Seed AOSS with documents for Tenant-A and Tenant-B.
2. Query with `tenantId: 'tenant-a'`.
3. Assert: zero results from Tenant-B's documents.
4. Query with `tenantId: 'tenant-b'`.
5. Assert: zero results from Tenant-A's documents.

---

## 5. Writeback → Audit Trail Flow (REQ-WB-3..5)

### 5.1 End-to-End Sequence

```
Agent proposes mutation
    │
    ▼
HITL Gate (§3) ─── waitForTaskToken ───► Human approves
    │                                         │
    ▼                                         ▼
ExecuteWriteback Lambda                  SendTaskSuccess
    │                                    (carries approver identity)
    ▼
RDS write (via beginTenantTransaction + RLS)
    │
    ▼
publishAuditEvent({
  tenantId, actor: 'agent:<name>+human:<sub>',
  module, clauseRef, standard,
  detailType: '<Domain>.<Action>',
  source: 'cumplify.<module-id>.<module>',
  payload: { before: null, after: <result> }
})
    │
    ▼
EventBridge cumplify-events bus
    │ (R-3: detail.auditTrail = true)
    ▼
FIFO-router → AuditSinkQueue (FIFO)
    │
    ▼
Audit-trail consumer (services/audit-trail/handlers/consumer.ts)
    │
    ▼
appendAuditEvent (appender.ts)
    │
    ▼
DynamoDB TransactWriteItems:
  - AUDITLOG item (hash-chained, attribute_not_exists)
  - AUDITDEDUP marker
    │
    ▼
DynamoDB Streams → S3 Object Lock COMPLIANCE sealer
```

### 5.2 Reuse Points (Decision D-3)

| Component | Existing Location | Reused As-Is |
|-----------|-------------------|--------------|
| `appendAuditEvent` | `services/audit-trail/src/appender.ts` | Yes |
| `computePayloadHash` / `computePrevHash` | `services/audit-trail/src/hash-chain.ts` | Yes |
| `createFifoHandler` | `services/eventing/src/consumer.ts` | Yes |
| `publish` | `services/eventing/src/publisher.ts` | Yes |
| `publishAuditEvent` helper | `services/api/src/resolvers/shared.ts` | Pattern copied to agent tool Lambdas (same signature) |
| Sealer Lambda | `services/audit-trail/handlers/sealer.ts` | Yes (DynamoDB Streams → S3) |
| Audit-sink consumer | `services/audit-trail/handlers/consumer.ts` | Yes (already deployed, consumes AuditSinkQueue) |

No parallel audit path is created. Agent writebacks flow through the SAME
audit-sink → appender → sealer pipeline proven in api-core ACC-1.

### 5.3 Actor Field Convention

The `actor` field in audit events from agent writebacks follows the format:
`agent:<agentName>+human:<cognito-sub>` (e.g., `agent:CAPAGuru+human:abc123`).
This captures BOTH the AI agent that proposed the action AND the human who
approved it, satisfying REQ-WB-3's requirement and audit traceability.

---

## 6. Re-Eval Harnesses (REQ-RET-7..9)

### 6.1 Retrieval-Grounded Re-Eval Pattern

Extends `services/model-evals/src/runner.ts` with a retrieval-grounding step:

```typescript
async function groundedEval(
  seat: SeatId,
  evalSet: EvalSet,
  retrievalConfig: { collectionId: string; tenantId: string },
): Promise<ScoredReport> {
  const results: EvalResult[] = [];
  for (const task of evalSet.tasks) {
    // 1. Retrieve grounding context
    const context = await retrieve({
      tenantId: retrievalConfig.tenantId,
      collectionId: retrievalConfig.collectionId,
      queryText: task.prompt,
      topK: 5,
    });
    // 2. Augment prompt with retrieved context
    const groundedPrompt = buildGroundedPrompt(task.prompt, context.chunks);
    // 3. Invoke via one-door (Register-resolved)
    const response = await invoke(seat, [{ role: 'user', content: groundedPrompt }], {});
    // 4. Score
    results.push(scoreResult(task, response));
  }
  return generateReport(seat, results);
}
```

### 6.2 Guru-45001 Re-Eval (REQ-RET-7)

- **Seat:** `guru-45001` (`moonshotai.kimi-k2.5`, PROVISIONAL at 0.843)
- **Eval set:** `services/model-evals/data/eval-sets/guru-iso45001.json` (50 tasks)
- **Collection:** `ISO-KB` (tenant-uploaded ISO 45001 text)
- **Test tenant:** architect-provisioned eval tenant with uploaded 45001
- **Bar:** >= 0.85 mean clause-citation accuracy
- **Outcome A (pass):** Update Register → status ASSIGNED, record evidence
- **Outcome B (fail):** Mark EXPIRED, run swap eval against next candidate
  (glm-5 documented as alternative), record outcome
- **Execution:** ARCHITECT-only (`bedrock:InvokeModel` denied to readonly)

### 6.3 LegalLedger Re-Eval (REQ-RET-8)

- **Seat:** `legal-ledger` (UNASSIGNED; candidates: glm-5, deepseek.v3.2)
- **Eval set:** `services/model-evals/data/eval-sets/legal-ledger.json` (30 tasks)
- **Collection:** `TENANT-DOCS-KB` (tenant obligations corpus)
- **Bar:** mean rubric score >= 4.0, no criterion at 1
- **Outcome A (pass):** Assign winner, set status ASSIGNED, attach monthly
  budget cap ($ TBD per Register COND-4), record evidence
- **Outcome B (fail):** Keep UNASSIGNED, record outcome, defer to next
  quarterly re-validation
- **Execution:** ARCHITECT-only, 100% human-graded (blind protocol per
  spec-30 Task 8 runbook)

### 6.4 Workhorse Re-Eval (REQ-RET-9)

- **Seat:** `workhorse` (`us.amazon.nova-pro-v1:0`, PROVISIONAL)
- **Eval method:** Schema compliance under real agent load (not synthetic
  eval set). After first agent deployment, record compliance rate over
  first 100 live invocations per agent.
- **Bar:** 100% schema compliance (with one-retry guard, SERVE-10)
- **Outcome A (pass):** Confirm PROVISIONAL → ASSIGNED, record evidence
- **Outcome B (fail):** Flag for swap eval, identify failure patterns
  (which agent/task-family), record in Register
- **Execution:** ARCHITECT-witnessed from production telemetry

---

## 7. AiStack CDK Layout (REQ-CDK-1..7)

### 7.1 Stack Definition

```typescript
// infra/lib/ai-stack.ts
export interface AiStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  // Cross-stack imports
  readonly tableArn: string;
  readonly tableName: string;
  readonly dynamodbKey: kms.IKey;
  readonly clusterArn: string;
  readonly dbSecretArn: string;
  readonly dbSecretKey: kms.IKey;
  readonly busName: string;
  readonly busArn: string;
  readonly deliveryFailureDlqArn: string;
  // Existing queues (consumed, not created here)
  readonly capaIntakeQueueArn: string;
  readonly auditSinkQueueArn: string;
  readonly recordsQueueArn: string;
}
```

### 7.2 Resources Created

| Resource | CDK Construct | Purpose |
|----------|---------------|---------|
| AI Invoker Lambda | `NodejsFunction` | One-door Converse path (NODEJS_22_X, ARM_64, 512MB, 90s timeout) |
| AI Invoker Role | `Role` | ONLY role with `bedrock:InvokeModel` (Resource: `*`) + `bedrock:ApplyGuardrail` |
| CfnGuardrail | `bedrock.CfnGuardrail` | PII anonymize/block + PROMPT_ATTACK filter |
| HITL State Machine | `sfn.StateMachine` | Standard type, waitForTaskToken (§3) |
| DocStudioQueue + DLQ | `sqs.Queue` | Standard, enforceSSL, visTimeout 360s |
| LeadAuditorQueue + DLQ | `sqs.Queue` | Standard, enforceSSL, visTimeout 360s |
| ControlTowerQueue + DLQ | `sqs.Queue` | Standard, enforceSSL, visTimeout 360s |
| R-8 DocStudioRule | `events.Rule` | EventBridge rule on cumplify-events |
| R-9 LeadAuditorRule | `events.Rule` | EventBridge rule on cumplify-events |
| R-10 ControlTowerRule | `events.Rule` | EventBridge rule on cumplify-events |
| Agent handler Lambdas (×8) | `NodejsFunction` | Per-agent invoker (NODEJS_22_X, ARM_64, 512MB, 90s) |
| Inference profiles (×3) | `bedrock.CfnInferenceProfile` | Per-plan (Launch/Pro/Enterprise) |
| DLQ Alarms (×3 new) | `cloudwatch.Alarm` | depth > 0 for 15 min |
| Model weight items | (seeded via custom resource or migration) | DynamoDB MODELWEIGHT# items |

### 7.3 IAM (REQ-CDK-4, REQ-SEC-1..3)

| Role | Permissions | NOT Granted |
|------|-------------|-------------|
| AI Invoker Role | `bedrock:InvokeModel` (Resource `*`), `bedrock:ApplyGuardrail`, DynamoDB (TENANT#*#METER read/write, MODELWEIGHT# read), EventBridge PutEvents | RDS, S3, DynamoDB AUDITLOG |
| Agent Handler Roles (per-agent) | RDS Data API (execute-statement, begin/commit/rollback), DynamoDB (tenant-scoped HITL# + TENANT#), SQS receive/delete on own queue, SFN StartExecution | `bedrock:InvokeModel` ← NOT granted |
| HITL Execute Role | RDS Data API (write), DynamoDB (AUDITLOG append via shared.publishAuditEvent → EventBridge), EventBridge PutEvents | `bedrock:InvokeModel` |

All roles: resource-scoped, no wildcards except `bedrock:InvokeModel` on the
invoker (AWS requirement). Agent handler roles invoke the invoker INTERNALLY
(same-process function call, not cross-Lambda) — the invoker is a library,
not a separate Lambda for agent calls.

**Clarification:** The AI Invoker Lambda is the single deployed function that
holds the Bedrock permission. Agent handler Lambdas import
`@cumplify/ai-invoker` as a workspace package (resolved at bundle time).
Each agent handler Lambda bundles the invoker code → carries the invoker role.
Therefore, agent handler Lambdas DO carry `bedrock:InvokeModel` via their
bundled invoker code — but this is the SAME one-door path, not a separate
permission grant. The IAM role is shared: **one execution role per agent
handler** that includes both data permissions AND `bedrock:InvokeModel`.

Wait — that violates CDK-4 ("only the ai-invoker Lambda holds
`bedrock:InvokeModel`"). Resolution:

**Architecture refinement:** The AI Invoker is deployed as a SEPARATE Lambda
invoked internally via `lambda:InvokeFunction` by agent handlers. This
preserves the single-permission-holder constraint:

| Role | bedrock:InvokeModel | lambda:InvokeFunction (invoker) |
|------|--------------------|---------------------------------|
| AI Invoker Lambda Role | YES | — |
| Agent Handler Lambda Roles | NO | YES (invoker function ARN only) |

Agent handlers call the invoker Lambda synchronously
(`InvocationType: RequestResponse`). This adds ~10ms latency but preserves
the security boundary.

### 7.4 CumplifyStage Integration

```typescript
// Addition to infra/lib/cumplify-stage.ts
const aiStack = new AiStack(this, 'AiStack', {
  envConfig,
  tableArn: dataStack.tableArn,
  tableName: dataStack.tableName,
  dynamodbKey: securityStack.outputs.dynamodbKey,
  clusterArn: dataStack.clusterArn,
  dbSecretArn: dataStack.dbSecretArn,
  dbSecretKey: securityStack.outputs.secretsKey,
  busName: eventingStack.busName,
  busArn: eventingStack.busArn,
  deliveryFailureDlqArn: eventingStack.deliveryFailureDlqArn, // new output needed
  capaIntakeQueueArn: eventingStack.capaIntakeQueueArn,   // new output needed
  auditSinkQueueArn: eventingStack.auditSinkQueueArn,
  recordsQueueArn: eventingStack.recordsQueueArn,         // new output needed
});
aiStack.addDependency(dataStack);
aiStack.addDependency(apiStack);
aiStack.addDependency(eventingStack);
aiStack.addDependency(auditTrailStack);
```

**New exports from EventingStack** (cross-stack): `deliveryFailureDlqArn`,
`capaIntakeQueueArn`, `recordsQueueArn` (in addition to already-exported
`auditSinkQueueArn`, `busName`, `busArn`).

---

## 8. Guardrails (CDK-5B/D-5)

### 8.1 CfnGuardrail Definition

```typescript
const guardrail = new bedrock.CfnGuardrail(this, 'AgentGuardrail', {
  name: `cumplify-agent-guardrail-${envConfig.envName}`,
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
      { type: 'SSN', action: 'BLOCK' },
      { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
    ],
  },
});
```

### 8.2 Converse Integration

The AI Invoker attaches the guardrail at invoke time:

```typescript
const command = new ConverseCommand({
  modelId,
  messages,
  system: [{ text: systemPrompt }],
  inferenceConfig: { temperature, maxTokens },
  guardrailConfig: {
    guardrailIdentifier: guardrailId,  // from env var
    guardrailVersion: guardrailVersion,
  },
  // ... requestMetadata, etc.
});
```

---

## 9. Sequence Diagrams

### 9.1 Event-Driven Agent with HITL (CAPAGuru example)

```
EventBridge          CapaIntakeQueue    CAPAGuru Handler    AI Invoker    SFN    Human    Audit Trail
    │                     │                  │                │           │       │          │
    │─NC.Raised──────────►│                  │                │           │       │          │
    │                     │──dequeue────────►│                │           │       │          │
    │                     │                  │──retrieve(NC)─►│           │       │          │
    │                     │                  │◄──context──────│           │       │          │
    │                     │                  │──invoke(seat)─►│           │       │          │
    │                     │                  │                │──Converse►│       │          │
    │                     │                  │                │◄─response─│       │          │
    │                     │                  │◄─tool_use──────│           │       │          │
    │                     │                  │ (proposes CAPA)│           │       │          │
    │                     │                  │──startExec─────────────────►       │          │
    │                     │                  │◄─taskToken─────────────────│       │          │
    │                     │                  │──write HITL_PENDING────────────────►          │
    │                     │                  │                │           │       │          │
    │                     │                  │    ... time passes ...     │       │          │
    │                     │                  │                │           │◄approve          │
    │                     │                  │                │           │──────►│          │
    │                     │                  │                │    ExecuteWriteback│          │
    │                     │                  │                │           │──RDS──►          │
    │                     │                  │                │           │──audit►──────────►
    │                     │                  │                │           │       │   sealed │
```

### 9.2 Guru Advisory (User-Triggered, No HITL)

```
User/ComplianceCopilot    Guru Handler    Retrieval    AI Invoker
        │                      │              │            │
        │──ask clause Q───────►│              │            │
        │                      │──retrieve───►│            │
        │                      │◄──chunks─────│            │
        │                      │──invoke(seat, grounded)──►│
        │                      │              │            │──Converse
        │                      │              │            │◄─response
        │                      │◄─advisory────────────────│
        │◄─cited answer────────│              │            │
```

---

## 10. File Inventory (New/Modified)

### New Files

| Path | Purpose |
|------|---------|
| `services/ai-invoker/package.json` | Workspace package `@cumplify/ai-invoker` |
| `services/ai-invoker/src/index.ts` | Public invoke() API |
| `services/ai-invoker/src/register-resolver.ts` | Register → modelId resolution |
| `services/ai-invoker/src/converse.ts` | Bedrock Converse wrapper + retry |
| `services/ai-invoker/src/metering.ts` | Token → credit computation + meter update |
| `services/ai-invoker/src/credit-precheck.ts` | Balance check logic |
| `services/ai-invoker/src/schema-retry.ts` | JSON schema validation + retry |
| `services/ai-invoker/src/guardrail.ts` | guardrailConfig builder |
| `services/ai-invoker/src/types.ts` | Type definitions |
| `services/ai-invoker/data/register-compiled.json` | Build-time compiled Register |
| `services/agents/shared/tool-loop.ts` | Multi-turn tool orchestration |
| `services/agents/shared/hitl.ts` | SFN waitForTaskToken integration |
| `services/agents/shared/retrieval.ts` | AOSS retrieval wrapper |
| `services/agents/{agent}/prompt.ts` | Per-agent system prompts (×8) |
| `services/agents/{agent}/tools.ts` | Per-agent tool definitions (×5 mutating) |
| `services/agents/{agent}/handler.ts` | Per-agent SQS/resolver handler (×8) |
| `infra/lib/ai-stack.ts` | AiStack CDK construct |
| `infra/lib/ai-stack.unit.test.ts` | Template-assertion tests |

### Modified Files

| Path | Change |
|------|--------|
| `infra/lib/cumplify-stage.ts` | Add AiStack with dependencies |
| `infra/lib/eventing-stack.ts` | Export `deliveryFailureDlqArn`, `capaIntakeQueueArn`, `recordsQueueArn` |
| `contracts/events.md` | Register any new agent-emitted events (if needed) |

---

## 11. SOC 2 Impact

| Trust Service Criterion | Impact | Evidence Source |
|-------------------------|--------|----------------|
| CC6.1 (Logical access) | Agent IAM roles are least-privilege; bedrock:InvokeModel isolated to invoker | Template-assertion tests |
| CC7.2 (Change management) | HITL gate ensures human approval before state change | SFN execution history |
| CC8.1 (Processing integrity) | Audit trail hash-chain proves no tampering | Verifier Lambda + sealed archive |
| A1.2 (Availability) | AOSS 45s cold-start budget prevents silent failures | Cold-start live demo (ACC-4) |

---

## 12. Requirement Traceability

| Requirement | Design Section | Implementation Artefact |
|-------------|---------------|------------------------|
| REQ-SERVE-1 | §1.1, §1.2 | `services/ai-invoker/src/index.ts` |
| REQ-SERVE-2 | §1.3 | `register-resolver.ts` + `register-compiled.json` |
| REQ-SERVE-3 | §1.4 | `metering.ts` |
| REQ-SERVE-5 | §1.3 | `register-resolver.ts` (fail-closed check) |
| REQ-SERVE-6 | §1.3 | LegalLedger special case in resolver |
| REQ-SERVE-7 | §1.2 step 3 | `converse.ts` requestMetadata |
| REQ-SERVE-8 | §1.5 | `infra/lib/ai-stack.ts` (CfnInferenceProfile) |
| REQ-SERVE-9 | §1.2 step 2 | `credit-precheck.ts` |
| REQ-SERVE-10 | §1.2 step 6 | `schema-retry.ts` |
| REQ-SERVE-11 | §1.6 | `converse.ts` cacheConfig |
| REQ-RET-1 | §4.1 | `retrieval.ts` mandatory filter |
| REQ-RET-2 | §4.5 | `cross-tenant-isolation.test.ts` |
| REQ-RET-3 | §4.1 | `retrieval.ts` backoff config |
| REQ-RET-4 | §4.1 | Live demo (ACC-4) |
| REQ-RET-5 | §4.3 | Guru handler + retrieval |
| REQ-RET-6 | §4.4 | CAPAGuru handler + NC-HISTORY |
| REQ-RET-7 | §6.2 | `groundedEval` harness (architect-executed) |
| REQ-RET-8 | §6.3 | `groundedEval` harness (architect-executed) |
| REQ-RET-9 | §6.4 | Production telemetry monitoring |
| REQ-WB-1 | §2.4 | Per-agent tools.ts |
| REQ-WB-2 | §3 | `shared/hitl.ts` + SFN state machine |
| REQ-WB-3 | §5.1, §5.3 | Actor convention + publishAuditEvent |
| REQ-WB-4 | §5.2 | Reuse table (no new audit path) |
| REQ-WB-5 | §9.1 | E2E witnessed demo (ACC-3) |
| REQ-EVT-1 | §2.1, §2.2 | Existing + new queues in AiStack |
| REQ-EVT-2 | §2.1 | CapaIntakeQueue (FIFO, existing) |
| REQ-EVT-3 | §2.3 | createHandler/createFifoHandler reuse |
| REQ-EVT-4 | §2.3 | Agent handler Lambdas (EVT-4B) |
| REQ-EVT-5 | §2.2 | R-8/R-9/R-10 rule definitions |
| REQ-CDK-1 | §7.4 | cumplify-stage.ts modification |
| REQ-CDK-2 | §7.2 | All Lambdas: NODEJS_22_X, ARM_64, 512MB |
| REQ-CDK-3 | §7.2 | `ai-stack.unit.test.ts` |
| REQ-CDK-4 | §7.3 | IAM table (invoker-only bedrock:InvokeModel) |
| REQ-CDK-5 (CDK-5B) | §2.4 | No CfnAgent; code modules |
| REQ-CDK-6 | §4.2 | AOSS data-access policy in AiStack |
| REQ-CDK-7 | §7 (global) | No anthropic model ID anywhere |
| REQ-SEC-1 | §7.3 | IAM roles (no Cognito on agents) |
| REQ-SEC-2 | §4.1, §7.3 | tenantId in all data ops |
| REQ-SEC-3 | §7.3 | REQUIRES-HUMAN flag on IAM code |
