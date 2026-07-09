# agents-existing-8 — Tasks (Template D)

**Design baseline:** D2 (5c0ada2) — APPROVED
**Closure rules:** 7 (checkbox + evidence in same commit), 8 (timestamp + exit code + cdk-outputs SHA)
**Division of Labor:** [KIRO] = agent builds; [ARCHITECT] = architect executes (Kiro never ticks [ARCHITECT] boxes)
**Budget:** $0 net-new standing cost beyond AiStack Lambdas/queues (AOSS scale-to-zero). Model spend metered; any live-invoke campaign (re-evals) needs an architect-approved estimate first (spec-30 discipline).

---

## Task 1: AI Invoker Module — Core Library [KIRO]

> The one-door module per design §1. All agents depend on this.

### Deliverables
- [x] `services/ai-invoker/package.json` — workspace package `@cumplify/ai-invoker`
- [x] `services/ai-invoker/tsconfig.json`
- [x] `services/ai-invoker/src/types.ts` — InvokeRequest, InvokeResponse, SeatId, ModelWeight, CompiledRegister
- [x] `services/ai-invoker/src/register-resolver.ts` — loads `register-compiled.json`, checks status/expiry live, fails closed (EXPIRED/UNASSIGNED)
- [x] `services/ai-invoker/src/converse.ts` — BedrockRuntimeClient + ConverseCommand wrapper; retry (5xx/429, base 1s, max 3); requestMetadata (SERVE-7); guardrailConfig; conditional cachePoint for Nova models only (§1.6)
- [x] `services/ai-invoker/src/metering.ts` — token→credit computation using MODELWEIGHT# items (wIn/wOut/wCache per §1.4); atomic DynamoDB UpdateItem ADD on TENANT#<tenantId>#METER / MONTH#<yyyymm>; emits telemetry.credits.consumed event
- [x] `services/ai-invoker/src/credit-precheck.ts` — balance check; PAUSED_FOR_CREDITS; incident/HITL exemption (SERVE-9)
- [x] `services/ai-invoker/src/schema-retry.ts` — JSON schema validation + one-retry guard (SERVE-10, Workhorse tier only)
- [x] `services/ai-invoker/src/guardrail.ts` — guardrailConfig builder (guardrailId + version from env)
- [x] `services/ai-invoker/src/index.ts` — public `invoke(seat, messages, opts)` API orchestrating steps 1-8 per §1.2
- [x] `services/ai-invoker/data/register-compiled.json` — built from contracts/model-register.md (script in package.json `compile-register`)
- [x] `services/ai-invoker/__tests__/register-resolver.test.ts` — unit: ASSIGNED passes, EXPIRED fails, UNASSIGNED fails, past-expiry fails
- [x] `services/ai-invoker/__tests__/metering.test.ts` — unit: credit computation with wIn/wOut/wCache; null wCache fallback; atomic meter update mock
- [x] `services/ai-invoker/__tests__/credit-precheck.test.ts` — unit: exhausted blocks; incident exemption passes; HITL exemption passes
- [x] `services/ai-invoker/__tests__/schema-retry.test.ts` — unit: valid passes; invalid retries once; second fail returns error
- [x] `services/ai-invoker/__tests__/converse.test.ts` — unit: retry on 5xx; no retry on 4xx; requestMetadata attached; cachePoint present for Nova, absent for qwen/kimi

### Acceptance
- `npx tsc --noEmit` passes for the package
- All unit tests green (`npx vitest --run`)
- `compile-register` script produces valid JSON matching CompiledRegister schema

---

## Task 2: MODELWEIGHT# Pricing Seed [ARCHITECT]

> Depends on Task 1 (types exist). Live Pricing API call requires credentials.
> This committed file is the SOLE source for weight seeding (T-2).

### Deliverables
- [x] Execute `fetchPricing()` (from `services/model-evals/src/pricing.ts`) for the 4 in-scope models: `us.amazon.nova-pro-v1:0`, `us.amazon.nova-lite-v1:0`, `qwen.qwen3-next-80b-a3b`, `moonshotai.kimi-k2.5`
- [x] Record raw prices (inputPricePerMToken, outputPricePerMToken) + derive wIn/wOut/wCache per formula: `weight = pricePerMToken × 1000`
- [x] Commit `services/ai-invoker/data/model-weights-seed.json` with derived values + provenance (capturedAt, sourceCommit, API source)
- [x] Evidence: `.kiro/evidence/agents-existing-8/task-2-pricing-seed.log` (timestamp, exit code, raw API values, derived weights)

### Acceptance
- All 4 models have wIn + wOut defined (numeric > 0)
- Nova Pro/Lite have wCache defined; qwen/kimi have wCache = null
- Derivation matches formula (weight = pricePerMToken × 1000, verifiable from log)

---

## Task 3: AiStack CDK — Infrastructure Skeleton [KIRO]

> Depends on Task 1. Creates the stack + queues/rules/Lambda shells.
> NOTE: This task modifies EventingStack (new exports + ESM on existing
> capa-intake/records queues) — touches spec-2's stack; flag in commit.

### Deliverables
- [x] `infra/lib/ai-stack.ts` — AiStack class per design §7 (queues, rules, Lambdas, guardrail, state machine, inference profiles)
- [x] AI Invoker Lambda (NodejsFunction: NODEJS_22_X, ARM_64, 512MB, 90s timeout, entry: services/ai-invoker)
- [x] MODELWEIGHT# seeding custom resource: reads `services/ai-invoker/data/model-weights-seed.json` (committed by Task 2, architect-witnessed) and writes DynamoDB MODELWEIGHT# items. Does NOT call live Pricing API at deploy time (T-2 correction).
- [x] CfnGuardrail (PII anonymize/block + PROMPT_ATTACK) — no Anthropic model IDs
- [x] 3 new SQS queues + DLQs (DocStudioQueue, LeadAuditorQueue, ControlTowerQueue) per §2.2
- [x] 3 EventBridge rules (R-8/R-9/R-10) with canonical input transformer + retry + delivery-failure DLQ
- [x] HITL State Machine (Step Functions Standard, waitForTaskToken) per §3.2
- [x] 3 DLQ alarms (depth > 0 for 15 min)
- [x] CfnOutputs for all ARNs/IDs/URLs
- [x] Modified `infra/lib/eventing-stack.ts`: new exports (`deliveryFailureDlqArn`, `capaIntakeQueueArn`, `recordsQueueArn`) + SQS event-source mappings (ESM) on existing capa-intake/records queues for agent handler Lambdas
- [x] `infra/lib/cumplify-stage.ts` modified — AiStack added with addDependency on DataStack, ApiStack, EventingStack, AuditTrailStack
- [x] `infra/lib/ai-stack.unit.test.ts` — template-assertion tests for: Lambda configs, SQS properties, EventBridge rule patterns, IAM policy statements, guardrail config, state machine definition

### Acceptance
- `npx tsc --noEmit` passes
- `npx vitest --run` for `ai-stack.unit.test.ts` passes (all L1 assertions)
- `npx cdk synth` produces zero CDK Nag errors for AiStack (ACC-6)

---

## Task 4: AiStack CDK — IAM Roles [KIRO] (REQUIRES-HUMAN)

> Depends on Task 3. IAM code requires architect review before commit.

### Deliverables
- [x] AI Invoker execution role: `bedrock:InvokeModel` (Resource `*`), `bedrock:ApplyGuardrail`, DynamoDB (TENANT#*#METER read/write, MODELWEIGHT# read), EventBridge PutEvents, `lambda:InvokeFunction` NOT needed (invoker IS the Lambda)
- [x] Agent handler execution roles (×8): `lambda:InvokeFunction` on AI Invoker ARN, RDS Data API READ-ONLY (execute-statement SELECT for context — NO write/begin/commit/rollback), SQS (receive/delete on own queue), SFN (StartExecution on HITL state machine). NO `bedrock:InvokeModel`. NO RDS write. NO DynamoDB PutItem/UpdateItem on domain tables (TENANT#*#AUDITLOG, TENANT#*#HITL writes are NOT on agent handlers).
- [x] ExecuteWriteback role (invoked by Step Functions AFTER approval): RDS Data API write (begin/commit/rollback + execute-statement), EventBridge PutEvents (for publishAuditEvent). Reuses api-core's app_role/beginTenantTransaction path. This is the ONLY role that can write to domain tables post-HITL.
- [x] Resource-based policy on AI Invoker Lambda allowing agent handler roles
- [x] Template-assertion tests for all IAM statements in `ai-stack.unit.test.ts`
- [x] **Negative template assertion (T-1):** no agent handler role has `rds-data:ExecuteStatement` with write (INSERT/UPDATE/DELETE), `rds-data:BeginTransaction`, `rds-data:CommitTransaction`, `dynamodb:PutItem`, or `dynamodb:UpdateItem` on domain table resources. Enforces HITL gate at IAM layer.

### Acceptance
- CDK Nag zero on IAM (no AwsSolutions-IAM4/IAM5 without justified suppression)
- `bedrock:InvokeModel` appears ONLY on AI Invoker role (template assertion)
- No agent handler role has `bedrock:InvokeModel` (negative assertion)
- No agent handler role has RDS write or dynamodb:PutItem/UpdateItem on domain tables (negative assertion — T-1)
- Architect review sign-off recorded

---

## Task 5: AOSS Retrieval Wrapper [KIRO]

> Depends on Task 1 (types). Required before Guru + CAPAGuru handlers.

### Deliverables
- [x] `services/agents/shared/retrieval.ts` — AOSS retrieval wrapper per design §4.1 (mandatory tenantId filter, exponential backoff base 500ms/factor 2/jitter/ceiling 45s, AossColdStartTimeoutError)
- [x] `services/agents/shared/__tests__/retrieval.test.ts` — unit: tenantId filter always present (fails without it); backoff config correct; timeout error thrown at ceiling
- [x] `services/agents/__tests__/cross-tenant-isolation.test.ts` — integration test skeleton (REQ-RET-2): seed Tenant-A + Tenant-B docs, assert zero cross-tenant leakage (requires live AOSS — marked [ARCHITECT] execution)

### Acceptance
- Unit tests green
- Integration test code committed (execution deferred to Task 12 / ACC-4)
- No AOSS query path exists without tenantId filter (code review assertion)

---

## Task 6: Tool-Loop + HITL Integration [KIRO]

> Depends on Tasks 1, 3 (state machine). Required before agent handlers.

### Deliverables
- [x] `services/agents/shared/tool-loop.ts` — multi-turn Converse tool-use orchestration per design §2.5 (MAX_TURNS=10 loop guard, tool dispatch, HITL detection)
- [x] `services/agents/shared/hitl.ts` — Step Functions waitForTaskToken integration per design §3.3 (start execution, write HITL_PENDING to DynamoDB with GSI PK `TENANT#<tenantId>#HITL_PENDING`, return HITL_PENDING status)
- [x] `services/agents/shared/__tests__/tool-loop.test.ts` — unit: end_turn exits; tool_use dispatches; loop guard throws at MAX_TURNS; HITL tool triggers gate
- [x] `services/agents/shared/__tests__/hitl.test.ts` — unit: SFN startExecution called with correct input; DynamoDB HITL_PENDING item written with correct GSI PK; resolved items remove GSI attribute

### Acceptance
- Unit tests green
- HITL GSI PK is `TENANT#<tenantId>#HITL_PENDING` (assertion in test)
- Loop guard prevents infinite execution (assertion)

---

## Task 7: GSI-HITL-PENDING + FF-5 Prefix Test Extension [KIRO]

> Depends on Task 6 (HITL item schema defined). Folds the api-core GSI PK prefix test.

### Deliverables
- [ ] Add `GSI-HITL-PENDING` definition to AiStack (if not already in Task 3 — verify; if missing, add here)
- [ ] Extend existing api-core GSI PK prefix test to assert: `GSI-HITL-PENDING` PK starts with `TENANT#<tenantId>#` (FF-5 rule)
- [ ] Unit test asserting the sparse GSI projection: only items with `status = 'PENDING'` have the GSI PK attribute

### Acceptance
- FF-5 prefix test passes with the new GSI included
- Sparse projection test green
- No non-TENANT#-prefixed GSI PK anywhere in the stack (negative assertion)

---

## Task 8: Agent Code Modules (×8) [KIRO]

> Depends on Tasks 1, 5, 6. Per-agent prompts, tools, handlers.

### Deliverables
- [ ] `services/agents/control-tower/{prompt,tools,handler}.ts` — governance routing, ct-governance-write tool (HITL-gated)
- [ ] `services/agents/doc-studio/{prompt,tools,handler}.ts` — doc-draft, doc-version-control, doc-publish tools (HITL on publish)
- [ ] `services/agents/lead-auditor/{prompt,tools,handler}.ts` — audit-checklist-gen, audit-finding-write tools (HITL on finding write)
- [ ] `services/agents/capa-guru/{prompt,tools,handler}.ts` — capa-open, capa-rootcause, capa-verify tools (HITL on CAPA lifecycle); retrieval integration for similar-NC search (§4.4)
- [ ] `services/agents/records-vault/{prompt,tools,handler}.ts` — records-retain, records-audit-append tools (NO HITL on append-only sealing; HITL on retention-schedule changes)
- [ ] `services/agents/guru-9001/{prompt,handler}.ts` — advisory, retrieval-grounded from ISO-KB (§4.3); AppSync resolver (user-facing)
- [ ] `services/agents/guru-14001/{prompt,handler}.ts` — same pattern as guru-9001
- [ ] `services/agents/guru-45001/{prompt,handler}.ts` — same pattern; uses kimi-k2.5 seat
- [ ] All handlers: reuse `createHandler`/`createFifoHandler` from `services/eventing/src/consumer.ts` for SQS consumption (where applicable)
- [ ] All mutating tools: call `publishAuditEvent` (from `services/eventing/src/publisher.ts`) after HITL-approved writeback per §5.1 actor convention (`agent:<name>+human:<sub>`)
- [ ] Unit tests per agent: prompt structure, tool dispatch, HITL detection, retrieval call (mocked)

### Acceptance
- `npx tsc --noEmit` passes for all agent modules
- All unit tests green
- No agent code calls `BedrockRuntimeClient` directly (only via `@cumplify/ai-invoker`)
- No Anthropic model ID in any prompt or config

---

## Task 9: AiStack Deploy + Readback [ARCHITECT]

> Depends on Tasks 3, 4, 8. First deploy of AiStack to dev.

### Deliverables
- [ ] `cdk deploy Dev/AiStack` — successful (zero errors)
- [ ] Readback: `cdk-outputs.json` → record all CfnOutput values (Lambda ARNs, queue URLs, state machine ARN, guardrail ID, AOSS collection endpoints)
- [ ] **Apply-template custom resource (T3E-F1 part 2):** build + run a VPC-attached, SigV4-signing Lambda that PUTs `_index_template` (from `services/agents/shared/aoss-index-template.json`) to each AOSS collection endpoint. Requires Task-4 AOSS data-access grant. MUST complete BEFORE any document seeding.
- [ ] Verify: each collection has the template applied (GET `_index_template` returns knn_vector 1024-dim + metadata.tenantId keyword)
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-9-deploy-readback.log` (timestamp, exit code, cdk-outputs SHA, template-apply confirmation per collection)

### Acceptance
- Deploy succeeds with zero CDK Nag findings (ACC-6)
- All CfnOutputs populated (non-empty)
- Index template applied: GET _index_template confirms dimension=1024 + tenantId=keyword per collection
- Truth rule 8: timestamp + exit code + SHA recorded

---

## Task 10: One-Door Serving Path — Live Proof [ARCHITECT]

> Depends on Tasks 2, 9. Live Bedrock invocations (readonly can't).

### Deliverables
- [ ] Invoke AI Invoker Lambda for each assigned seat: Workhorse (ControlTower), Lightweight (RecordsVault), Guru-9001, Guru-14001 — minimal "hello" prompt
- [ ] For each invocation verify: model resolved from Register (log modelId), tokens metered (log inputTokens/outputTokens/creditsConsumed), margin bar checked, EXPIRED/UNASSIGNED checks passed
- [ ] Negative proof 1: invoke with a synthetically EXPIRED seat → confirm `MODEL_SEAT_EXPIRED` error (no output)
- [ ] Negative proof 2: invoke LegalLedger seat → confirm `MODEL_SEAT_UNASSIGNED` error (no output)
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-10-serving-path.log` (per-invocation: timestamp, seat, modelId, tokens, credits, exit code)

### Acceptance
- ACC-1: each assigned seat invoked live, model resolved, tokens metered, credits computed — witnessed
- ACC-2: both negative proofs pass (EXPIRED + UNASSIGNED fail closed) — witnessed
- Budget: minimal invocations (~8 calls × ~$0.001 = ~$0.01 total)

---

## Task 11: Agent Writeback E2E — HITL + Audit Trail [ARCHITECT]

> Depends on Tasks 9, 10 (AiStack deployed + invoker proven).

### Deliverables
- [ ] Trigger CAPAGuru with a synthetic `NC.Raised` event (via SQS message to CapaIntakeQueue)
- [ ] Observe: agent proposes `agentProposeCorrectiveAction` → HITL gate pauses (Step Functions execution enters WaitForApproval)
- [ ] Execute `SendTaskSuccess` with approval (human actor = architect cognito sub)
- [ ] Observe: writeback commits to RDS → audit event published → sealed in DynamoDB AUDITLOG (hash-chained) → S3 WORM object
- [ ] Verify audit event: actor = `agent:CAPAGuru+human:<sub>`, clauseRef present, payloadHash correct, prevHash links to previous event
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-11-writeback-e2e.log` (full execution trace with timestamps)

### Acceptance
- ACC-3: agent writeback E2E demonstrated end-to-end — witnessed
- Audit trail item retrievable with correct hash chain (verifier Lambda confirms)
- HITL State machine execution shows SUCCEEDED status

---

## Task 12: AOSS Retrieval — Cold-Start + Tenant Isolation Proof [ARCHITECT]

> Depends on Tasks 5, 9 (retrieval wrapper deployed + AOSS collections accessible).

### Deliverables
- [ ] **Fail-closed template check (T3E-F1 part 3):** BEFORE seeding any documents, GET `_index_template` from the TENANT-DOCS-KB collection endpoint. If the template is absent or `metadata.tenantId` is not `keyword`, ABORT seeding — never index a document against an auto-mapped field.
- [ ] Seed AOSS TENANT-DOCS-KB collection with test documents for Tenant-A and Tenant-B (Titan Embed v2, 1024 dimensions)
- [ ] Execute retrieval query as Tenant-A → verify results contain ONLY Tenant-A documents
- [ ] Execute retrieval query as Tenant-B → verify zero Tenant-A results (cross-tenant negative proof)
- [ ] Force AOSS cold start (wait for scale-to-zero, then query) → verify completes within 45s budget with retries logged
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-12-aoss-retrieval.log` (timestamps, retry count, latencies, tenant isolation assertion results, template-check confirmation)

### Acceptance
- ACC-4: tenant-filtered results confirmed; cross-tenant negative proof passes; 45s cold-start budget demonstrated — witnessed
- Titan Embed v2 dimension = 1024 confirmed in collection metadata
- Index template present with metadata.tenantId = keyword (fail-closed check passed)

---

## Task 13: Retrieval-Grounded Re-Eval — guru-45001 [ARCHITECT]

> Depends on Task 12 (AOSS retrieval proven). Live Bedrock invocations.
> Budget estimate required before execution.

### Deliverables
- [ ] Architect-approved budget estimate committed: `.kiro/evidence/agents-existing-8/task-13-budget-estimate.md`
- [ ] Execute retrieval-grounded re-eval for guru-45001 (`moonshotai.kimi-k2.5`) per design §6.2: 50 tasks from guru-iso45001 eval set, grounded on tenant-uploaded ISO 45001 content
- [ ] Score: clause-citation accuracy (bar >= 0.85)
- [ ] If pass: update `contracts/model-register.md` → guru-45001 status ASSIGNED
- [ ] If fail: update Register → status EXPIRED, document outcome + next candidate
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-13-guru45001-reeval.log` (scored report, outcome, Register diff)

### Acceptance
- ACC-5 (partial): guru-45001 re-eval outcome recorded in Register with evidence link
- Budget within approved estimate
- Truth rule 7: checkbox + evidence in same commit

---

## Task 14: Retrieval-Grounded Re-Eval — LegalLedger [ARCHITECT]

> Depends on Task 12. Live Bedrock invocations + 100% human-graded.
> Budget estimate required before execution.

### Deliverables
- [ ] Architect-approved budget estimate committed: `.kiro/evidence/agents-existing-8/task-14-budget-estimate.md`
- [ ] Execute retrieval-grounded re-eval for LegalLedger per design §6.3: 30 tasks, candidates (glm-5, deepseek.v3.2), grounded on tenant obligations corpus
- [ ] Human-grade 100% blind (per spec-30 Task 8 runbook)
- [ ] If pass (mean >= 4.0, no criterion at 1): assign winner → Register status ASSIGNED, attach monthly budget cap
- [ ] If fail: keep UNASSIGNED, record outcome
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-14-legalledger-reeval.log` (scored report, grading sheets, outcome, Register diff)

### Acceptance
- ACC-5 (partial): LegalLedger re-eval outcome recorded in Register with evidence link
- Budget within approved estimate
- Grading is 100% blind-reviewed

---

## Task 15: Workhorse PROVISIONAL Re-Eval [ARCHITECT]

> Depends on Tasks 10, 11 (live agent load generated). Observational.

### Deliverables
- [ ] After Tasks 10-11, review schema compliance telemetry for Workhorse seat (`us.amazon.nova-pro-v1:0`) across the live invocations
- [ ] Record: total invocations, schema-validation-pass count, retry count, retry-success count
- [ ] If 100% compliance (with one-retry guard): update Register → Workhorse status ASSIGNED
- [ ] If < 100%: flag for swap eval, identify failure patterns, record in Register
- [ ] Evidence: `.kiro/evidence/agents-existing-8/task-15-workhorse-reeval.log` (telemetry summary, outcome, Register diff)

### Acceptance
- ACC-5 (partial): Workhorse re-eval outcome recorded in Register
- Compliance rate documented with actual numbers from live invocations

---

## Task 16: Closure [KIRO]

> Depends on all prior tasks complete.

### Deliverables
- [ ] All task checkboxes marked complete (truth rule 7)
- [ ] Evidence directory `.kiro/evidence/agents-existing-8/` contains: pricing seed, deploy readback, serving path proof, writeback E2E, AOSS retrieval, re-eval reports
- [ ] ACC-1..8 verified satisfied
- [ ] Timestamp + evidence summary in closure log
- [ ] Register updates from Tasks 13-15 committed

### Acceptance
- All acceptance criteria from requirements §9 met
- No fabricated evidence (truth rules enforced)
- CDK Nag zero (ACC-6), template tests green (ACC-7)

---

## Dependency Graph

```
Task 1 [KIRO] — ai-invoker core library
  ↓
Task 2 [ARCHITECT] — MODELWEIGHT# pricing seed (live Pricing API)
  ↓
Task 3 [KIRO] — AiStack CDK skeleton (queues, rules, Lambdas, SFN, guardrail)
  ↓
Task 4 [KIRO/REQUIRES-HUMAN] — AiStack IAM roles
  ↓
Task 5 [KIRO] — AOSS retrieval wrapper (parallel with Task 6)
Task 6 [KIRO] — tool-loop + HITL integration (parallel with Task 5)
  ↓
Task 7 [KIRO] — GSI-HITL-PENDING + FF-5 prefix test
  ↓
Task 8 [KIRO] — agent code modules (×8)
  ↓
Task 9 [ARCHITECT] — AiStack deploy + readback
  ↓
Task 10 [ARCHITECT] — one-door serving path live proof (ACC-1, ACC-2)
  ↓
Task 11 [ARCHITECT] — writeback E2E (ACC-3)
Task 12 [ARCHITECT] — AOSS retrieval proof (ACC-4) (parallel with Task 11)
  ↓
Task 13 [ARCHITECT] — guru-45001 re-eval (ACC-5 partial)
Task 14 [ARCHITECT] — LegalLedger re-eval (ACC-5 partial) (parallel with 13)
Task 15 [ARCHITECT] — Workhorse re-eval (ACC-5 partial, after 10+11)
  ↓
Task 16 [KIRO] — closure
```
