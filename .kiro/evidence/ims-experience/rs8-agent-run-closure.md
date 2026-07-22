# RS-8 CLOSED (backend foundation) — runCapaAnalysis + runRiskAssessment (architect, 2026-07-22)

Closes the backend half of REQ-RS-8 ("AI does the heavy lifting" user-
triggered agent runs). **Honest scope note up front**: the spec's full
acceptance criterion ("click → run → HITL card → human EDITS one node + one
agent ITERATION revises the artifact → approve converged version → row
updated + sealed event with dual attribution") includes a frontend
Iterate-with-agent UX (Collaboration Law, architecture §3) that does not
exist yet — that's a Kiro build item, not part of this wave. What's closed
here is the real, tested BACKEND foundation everything else stacks on:
dispatch, agent reasoning, HITL proposal, SOD-1 stamping, post-approval
commit. Nothing here is a stub — every piece runs for real when deployed —
but the full owner-witnessable e2e loop needs the frontend half first.

## The infra fix this required (bigger than RS-8 itself)

Found immediately on starting: `runCapaAnalysis`/`runRiskAssessment` need
BOTH RDS access (lives only in ApiStack's m2/m5 resolver Lambdas) AND
AI-invoker + agent-handler access (lives only in AiStack). `AiStack`
already depended on `ApiStack` (for `appRoleSecretArn`/`graphqlApiId`/
`graphqlApiUrl`, consumed by ExecuteWriteback, the Guru resolvers,
`publishGenerationEvent`'s IAM resource ARN, and DocGen's Lambdas) — CDK
rejects a stack depending on something that already depends on it, so
wiring the reverse direction (ApiStack's resolvers invoking AiStack's
agents) was flatly impossible without breaking that dependency first. Same
root cause as the deferred agentTriageNC/agentAssessRisk gating documented
in RS-7's evidence log — this time there was no acceptable degraded
fallback, since RS-8's entire point is genuine agent invocation.

**Owner-ruled fix (2026-07-22)**: relocated AiStack's three ApiStack values
from native CDK cross-stack props to `Fn.importValue` by well-known export
name (`cumplify-<env>-{app-role-secret-arn,graphql-api-id,graphql-api-url}`)
— this carries the VALUE without forcing a CDK dependency edge. Reversed
the explicit dependency in `cumplify-stage.ts`
(`apiStack.addDependency(aiStack)`, replacing the old
`aiStack.addDependency(apiStack)`) to guarantee AiStack still deploys
first, so ApiStack's `Fn.importValue` lookups always find AiStack's exports
already created on a fresh environment. Verified against the ACTUAL
synthesized cloud assembly, not just "cdk synth succeeded":
- `assembly-CumplifyPipeline-Dev/manifest.json`: `ApiStack.dependsOn`
  includes `AiStack`; `AiStack.dependsOn` no longer includes `ApiStack`.
- `ApiStack.template.json` Outputs: `AppRoleSecretArn`/`GraphqlApiId`/
  `GraphqlApiUrl` each carry the expected `Export.Name`.
- `AiStack.template.json`: contains `Fn::ImportValue` references to all
  three export names (grepped the rendered template, not the source).
- New `CapaGuruHandlerArn`/`RiskSentinelHandlerArn` exports from AiStack,
  imported into ApiStack's m2/m5 resolver Lambda IAM policies
  (`ResolverM2FnServiceRoleDefaultPolicy`/`ResolverM5Fn...`) — confirmed
  `lambda:InvokeFunction` present in the rendered policy JSON, scoped to
  exactly those two ARNs (same-account invoke needs only the caller's
  identity-based policy — no resource policy needed on the target).

This is a real, load-bearing infra change (reverses a foundational stack
dependency across all three environments) — flagged prominently, not
buried, and re-verified with `cdk synth` + template inspection after every
subsequent edit in this wave to catch any regression immediately.

## What shipped

**Design departure from the literal spec** (stated, with rationale):
`AgentRunAck` is genuinely fire-and-forget (`Lambda:Invoke` with
`InvocationType: 'Event'`), not a synchronous call that waits for the
agent's Bedrock/HITL work to finish. A synchronous `RequestResponse`
invoke risks exceeding AppSync's ~30-second direct-Lambda-resolver ceiling
under real latency — the one-door invoker's own grounding/AR checks can
each retry once (`services/ai-invoker/src/index.ts`), easily pushing a
single Converse-based tool call past 30s. This matches the spec's own
framing ("async ack; the HITL card is the deliverable") — `status` here
only ever means "successfully dispatched," never "analysis complete."

- **`runCapaAnalysis(ncId): AgentRunAck!`** (m2.ts) — fetches the NC row +
  its corrective actions (RDS, this Lambda has access), mints a `runId`
  (ulid), async-invokes CAPAGuru's Lambda with `{tenantId, runId, ncId,
  requestedBy: sub, context}`, returns `{runId, status: 'DISPATCHED'}`.
- **`runRiskAssessment(riskId): AgentRunAck!`** (m5.ts) — mirror shape,
  invoking the new RiskSentinel seat.
- **CAPAGuru extended, not replaced**: `handler.ts` now dispatches on event
  shape (`'Records' in event` → the original SQS path, unchanged; else →
  the new `runCapaAnalysis` direct-invoke path) — same pattern as
  guru-9001's `handleQuery`/`handler` split, just runtime-dispatched
  instead of two separately-wired Lambda configs (Lambda always calls
  whichever function is configured as the handler, regardless of trigger
  type — SQS event source and a resolver's `Lambda:Invoke` both land on
  the SAME entry point). New `nc-triage-write` tool added (stage 2,
  triage) alongside the existing `capa-open`/`capa-verify-effectiveness`
  (stages 4/6); prompt extended with explicit CAPA-shall-workflow stage
  discipline ("pick the ONE tool matching the NEXT unresolved stage") —
  the MODEL reasons about which stage applies from the context supplied,
  rather than hardcoded TypeScript branching (matches how CAPAGuru's
  existing event-triggered path already works; more robust than rigid
  stage-index branching against real, messy register data).
- **RiskSentinel stood up** (`services/agents/risk-sentinel/`) — new
  agent, Workhorse seat (Nova Pro, PROVISIONAL, already registered for
  this agent in `contracts/model-register.md` — no new Register row
  needed, confirmed against the compiled register). No SQS trigger yet
  (hazard/aspect event chains are catalogued roadmap, not this wave) —
  direct-invoke only, same dual-file structure as CAPAGuru
  (`prompt.ts`/`tools.ts`/`handler.ts`). Single tool: `risk-assessment-write`.
- **`tool-loop.ts` gained `requestedBy`** (threaded to both `enterHitlGate`
  call sites) — the explicit ask ("requestedBy stamped"): user-triggered
  runs now carry the proposing human's sub, so `hitl-approval.ts`'s SOD-1
  check (author ≠ approver, landed in RS-6/dfa8ad4) actually has something
  to check for these two flows. Event-triggered runs (no human proposer)
  correctly omit the field entirely rather than sending an empty string.
- **`execute-writeback.ts` gained two new commit cases** —
  `nc-triage-write` (UPDATE `nc_type`, CHECK-constraint-validated, no new
  migration needed) and `risk-assessment-write` (UPDATE
  likelihood/severity, refreshes `risk_register_view` in the same
  transaction — `createRisk`'s established pattern; `rationale` has no
  register column, preserved only in the `Agent.WritebackCommitted` audit
  payload, same convention as `closeCapa`'s `closureNotes`).

## Gates (architect-run)
| Gate | Result |
|---|---|
| `tool-loop.test.ts` | 9/9 pass (+2 new: requestedBy threaded / omitted) |
| `execute-writeback.test.ts` | 26/26 pass (+6 new: nc-triage-write + risk-assessment-write source-pinning, matching this file's established text-pattern-vs-migration style) |
| `capa-guru/__tests__/handler.test.ts` (new) | 6/6 — SQS/direct-invoke dispatch, requestedBy threading, stage-context in prompt, PENDING_APPROVAL/NO_PROPOSAL status |
| `risk-sentinel/__tests__/handler.test.ts` (new) | 6/6 — same shape |
| `rs8-run-agent-analysis.test.ts` (new) | 4/4 — RDS fetch, fire-and-forget Event invoke (never RequestResponse), requestedBy in payload, NOT_FOUND paths |
| `ai-stack.unit.test.ts` | 66/66 (2 pre-existing tests updated for the infra fix: app-role-secret assertion now matches the `Fn::ImportValue` shape; agent-handler count 11→12 for RiskSentinelFn) |
| `api-stack.unit.test.ts` | resolver count 87→89 (`runCapaAnalysis` on m2DS, `runRiskAssessment` on m5DS), both with schema node dependencies |
| `cdk synth` | Successfully synthesized; dependency reversal + all new exports/imports verified against the rendered template (not just synth exit code) |
| `npm run typecheck` | clean |
| Backend `npm run test` | 1212 passed / 3 skipped (was 1188 after RS-9 — clean +24, no shrinkage) |
| Frontend `npm run test` | 155 passed (untouched) |

## Explicitly deferred (tracked, not silently dropped)
- Frontend: "AI: draft this" buttons on the M2 CAPA drawer / `/risk`
  register; the Iterate-with-agent thread + editable HITL card UX
  (Collaboration Law) the full spec acceptance criterion requires.
- Int-lane e2e witness (propose → pause → approve → commit → sealed trail
  row) — needs a real deployed environment with a real NC/risk to click
  against; will run alongside the Dev live witness once this wave deploys.
- `GetAgentRun(runId)` query — `AgentRunAck.runId` is currently
  write-only/traceability-only (stamped into the eventual HITL item's
  context, not independently look-up-able). Noted as a natural follow-up,
  not built here — out of the spec's literal scope.
- CAPAGuru's `capa-rootcause` tool remains advisory-only (no
  execute-writeback case) — a human still calls `recordRootCause` directly
  to commit root-cause findings; making that HITL-gated too (architecture
  §4 stage 3's "analysis itself approved") is real follow-up scope, not
  silently absorbed into this wave.
