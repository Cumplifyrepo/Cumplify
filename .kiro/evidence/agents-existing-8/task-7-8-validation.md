# Task 7 + Task 8 Architect Validation — agents-existing-8

Validated: 2026-07-09 (architect). Commits: 938abf3 (Task 7), f3e7025 (Task 8), ac79972 (rule-7 reconciliation).
Method: independent re-execution per 19-kiro-truth — full suite + tsc re-run, diffs read line-by-line,
SQL cross-checked against migrations, IAM cross-checked against Task-4 approved surface, event
envelope cross-checked against OQ-5/contracts.

## Re-executed claims
- Suite: claimed "345 pass + 3 skipped". ACTUAL: `npx vitest --run` → **371 passed | 3 skipped**, exit 0.
  Claimed figure matches neither pre-state (369) nor post-state (371) — figure-drift class (spec-30 #8).
- tsc: claimed "clean". ACTUAL: 1 pre-existing error (infra/lib/env-config.unit.test.ts:13) — matches
  prior-task convention; acceptable as stated.
- Task 8 diff: 28 files / 1,394 insertions ✓ matches claim. **ZERO test files in the diff.**
- Rule-7 reconciliation ac79972: Tasks 1–6 boxes ticked ✓ (ordered in prior response; complied).

## VERDICT
- **Task 7: VALIDATED** (2 nits, M-3 below).
- **Task 8: REJECTED — REV required before Task 9.** Architect will NOT deploy over C-1/C-2/C-3.

---

## CRITICAL

### C-1 — One-door violation: agents run Bedrock in-process
`services/agents/shared/tool-loop.ts:9` → `import { invoke } from '../../ai-invoker/src/index.js'`.
All 8 handlers consume toolLoop (gurus likewise). ZERO occurrences of LambdaClient / InvokeCommand /
AI_INVOKER_ARN under services/agents/. So every agent executes ConverseCommand **under its own role**.
Task-4 approved IAM: AgentHandlerReadOnlyPolicy = lambda:InvokeFunction on AI Invoker ONLY, zero
bedrock actions (T-1 negative assertion). Consequence: every agent invoke → AccessDenied at runtime
(fail-closed, but 100% broken); granting handlers bedrock would kill the one-door margin/metering
architecture. Commit claim "All use @cumplify/ai-invoker via lambda:InvokeFunction" is FALSE.
FIX: transport seam — toolLoop accepts an `invokeFn`; handlers pass a Lambda-invoke transport
(LambdaClient.InvokeCommand on AI_INVOKER_ARN env, response unmarshalled to InvokeResponse); the
library import of invoke() is legal ONLY inside the AI Invoker Lambda's own handler.
ARCHITECT PROCESS NOTE (owned): tool-loop.ts has imported invoke() since Task 6; at Task-6 validation
no handler consumed it and the transport seam wasn't flagged — this surfaced only when Task 8
materialized the callers. Recorded as an architect review miss at Task 6.

### C-2 — HITL state machine cannot complete a single execution
infra/lib/ai-stack.ts (current):
- ExecuteWriteback state: `'FunctionName': 'PLACEHOLDER_WRITEBACK_LAMBDA'` (~:203) — the Lambda
  built in THIS task is not wired into the SFN. Contradicts commit's T-8b narrative.
- EmitAuditEvent state: `'PLACEHOLDER_AUDIT_LAMBDA'` (~:216). Redundant by design: execute-writeback.ts
  already emits the audit event post-commit (line ~91). Wiring both = double emission; keeping the
  placeholder = execution failure. Should be REMOVED (or replaced with a Pass) per design §3.
- NO lambda:InvokeFunction grants to the state-machine role for ANY task state. All three states are
  sfn.CustomState — CDK does NOT auto-grant. First WaitForApproval → AccessDenied on storeTokenLambda.
- No Retry blocks on the CustomStates (transient Lambda/RDS errors → immediate execution failure).

### C-3 — ExecuteWriteback SQL broken against live schema (4 of 5 tools + env)
Cross-checked services/api/migrations/:
a) capa-open: m2.corrective_actions.due_date TIMESTAMPTZ NOT NULL, no default (003_m2_capa.sql:41) —
   INSERT omits it → every capa-open fails.
b) audit-checklist-gen: m3.audit_checklists.created_by NOT NULL (004_m3_audit_studio.sql:41) — omitted.
c) ct-governance-write: m1.roles_responsibilities EXISTS IN NO MIGRATION — phantom table.
d) audit-finding-write: lead-auditor tools.ts:56 instructs the model 'major-nc | minor-nc | observation
   | ofi' (hyphens); CHECK requires 'major_nc','minor_nc' (004:51) → CHECK violation for both NC types.
   Same defect class as the api-core enum-case incident (5a50a30).
e) DB_NAME env NOT set on ExecuteWritebackFn (ai-stack env: CLUSTER_ARN/APP_ROLE_SECRET_ARN/BUS_NAME
   only); code defaults DB_NAME='cumplify'; api-core uses DATABASE='postgres' (api-stack.ts:189) →
   ALL statements fail on wrong database before a–d even trigger.
Only doc-publish is schema-valid. Additionally the HITL tool set ⊄ dispatch switch: doc-version-control,
capa-verify-effectiveness, records-retention-schedule are HITL-gated in handlers but UNKNOWN to
dispatchToolWrite → post-approval throw → rollback. Approved actions unexecutable.

## HIGH

### H-1 — T-8b NOT satisfied (decorative + wildcard resource policy)
addPermission principal states.amazonaws.com is not the auth path — SFN lambda:invoke task states sign
with the STATE MACHINE ROLE's credentials; the resource policy never evaluates for role-signed calls.
sourceArn 'arn:aws:states:*:*:stateMachine:*' = any state machine in ANY account. The comment "Refined
after SFN creation below" (ai-stack.ts:171) is false — no refinement exists. Binding T-8b requires:
identity grant to the HITL SM role ONLY (executeWritebackLambda.grantInvoke(hitlStateMachine.role) or
scoped role policy), removal/scoping of the wildcard permission, + negative template assertion that no
other principal (esp. AgentHandlerReadOnlyPolicy) holds invoke on the writeback Lambda.

### H-2 — T-8c NOT satisfied; agent compute layer does not exist
No agent-handler Lambdas, no execution roles, no SQS event-source mappings (Task-3 std queues +
eventing capa-intake/records), no AppSync resolver wiring for the 3 gurus — in ANY stack.
AgentHandlerReadOnlyPolicy attached to nothing; AOSS data-access READ block not amended. Commit defers
to "Task 9 when Lambdas materialize" — Task 9 is [ARCHITECT] deploy+readback with NO build deliverables.
The 8 modules are code without compute; nothing in the remaining ledger creates it. Must return to Kiro
as Task 8R. ALSO surfaces a design gap: embeddings have no path (capa-guru handler.ts uses
Array(1024).fill(0.01) placeholder vector, comment defers to Task 9) — handlers correctly lack bedrock
perms, so the ONE-DOOR invoker needs an embed() door (Titan Embed v2, 1024-dim) — design amendment
required; retrieval-grounding claims are hollow until then.

### H-3 — Audit envelope bypasses OQ-5 registry (honest-event violation)
execute-writeback.ts:218-248 hand-rolls PutEvents instead of publishAuditEvent (services/eventing/src/
publisher.ts) — the TICKED deliverable "All mutating tools: call publishAuditEvent" is FALSE.
'Agent.WritebackCommitted' is registered NOWHERE (contracts/events.md, publisher registry — grep 0 hits);
auditTrail:true hand-stamped, circumventing "registration IS routing" (OQ-5 owner ratification).
standard hardcoded 'ISO9001' (wrong for 14001/45001 writebacks); eventId = `writeback-${Date.now()}` —
same-millisecond writebacks collide → FIFO MessageDeduplicationId dedup SILENTLY DROPS an audit record
(sealed-trail completeness defect); module = agentName vs contract module conventions.

### H-4 — False tick: "Unit tests per agent" [x] with ZERO tests
No test file in the Task-8 commit; suite delta 369→371 is entirely Task 7. Acceptance "All unit tests
green" is vacuous for Task 8. Claimed "345 pass" wrong (actual 371). Additionally every handler's
dispatchTool is an echo stub (returns its own input as tool output; requiresHitl:false constant) —
advisory tools are functionally fake and untested, not flagged in the report.

## MEDIUM

### M-1 — No Aurora resume-retry on writeback path
BeginTransaction has no withResumeRetry (api-core ACC-1 lesson; helper exists in migrator/shared) and
SFN states carry no Retry config → first writeback after 0-ACU pause = FAILED execution, human approval
lost (token consumed).

### M-2 — DB actor loses approver identity
executeCapaOpen writes created_by='agent:CAPAGuru' (hardcoded); §5.1 actor convention
(agent:<name>+human:<sub>) reaches the audit event but NOT the DB row. Approver identity should persist
in created_by for row-level provenance.

### M-3 — Task 7 nits
(1) Sparse-projection unit test owed (deliverable honestly left unticked — must land in REV).
(2) "NEGATIVE scan" test reads ONLY hitl.ts, not the agents/ tree as the commit message claims —
broaden to glob services/agents/** so future GSI writes are covered.

## CLEAN (verified genuine)
- T-8a: set_config('app.tenant_id', :tid, true) is the FIRST statement after BeginTransaction,
  parameterized, transaction-scoped; sole txn path (execute-writeback.ts:70-77). SATISFIED.
- T-8d wiring direction correct: storeTokenLambda.functionArn in WaitForApproval; store-token.ts writes
  taskToken with ConditionExpression attribute_exists; PK/SK exactly match hitl.ts enterHitlGate
  (TENANT#<t>#HITL / PENDING#<id>); StoreToken IAM LeadingKeys-compatible. (Blocked at runtime only by
  the missing SM-role grant, C-2.)
- GSI9 pre-exists in data-stack.ts:123-125 (GSI9PK/GSI9SK) — Task 7 "verify" branch legitimate; D-2
  keying TENANT#<t>#HITL_PENDING correct; sparse REMOVE on resolve; hitl.test.ts updated accordingly.
- Task-4 IAM statement scope preserved through the role refactor (policies moved to Lambda-generated
  roles; statements byte-equivalent: rds-data write on clusterArn, GetSecretValue app-role only,
  dynamodbKey decrypt, PutEvents on bus; StoreToken UpdateItem + LeadingKeys). NOTE for owner: this is
  still an IAM-surface restructure post-sign-off + new addPermission — flagged REQUIRES-HUMAN visibility;
  consolidated re-sign-off recommended at REV re-review.
- No Anthropic model IDs/refs anywhere in services/agents/. Prompts compact (≤23 lines each), no
  verbatim ISO text.
- Rule-7 reconciliation commit ac79972 landed as ordered (Tasks 1-6, 45 boxes).

## Required REV scope (Task 8R) — summary for the response block
1. C-1 transport seam (invokeFn injection + Lambda-invoke transport + AI_INVOKER_ARN env).
2. C-2 SFN: wire executeWritebackLambda ARN, delete/replace EmitAuditEvent, grant SM role invoke on
   store-token + writeback, add Retry blocks.
3. C-3 SQL: due_date, created_by, real governance target table (or drop ct-governance-write pending
   corpus decision), finding_type underscores (map at dispatch, NOT in the model prompt), DB_NAME env
   ('postgres'), dispatch coverage for ALL HITL tools declared by handlers.
4. H-2: define 8 handler Lambdas + roles (AgentHandlerReadOnlyPolicy attached) + ESMs + guru AppSync
   wiring + AOSS READ ARNs amendment + envs; embed() door design amendment for the invoker.
5. H-3: register Agent.WritebackCommitted in contracts/events.md + publisher registry; use
   publishAuditEvent; ULID eventId; standard from proposedAction context.
6. H-4: real unit tests per agent + writeback dispatch tests pinned to migration schema (column lists,
   enum values), + template assertions: no PLACEHOLDER strings in synthesized SFN definition; SM role
   has invoke on exactly {store-token, writeback}; no other principal has invoke on writeback.
7. M-1/M-2/M-3 as listed.
