# Spec-35 design D3 + tasks — architect review (2026-07-16)

**Verdict: APPROVED WITH TWO FOLD-INS — no D4 round. Build opens.**
Both D2 blockers and all three mediums + four lows landed faithfully and were
independently re-verified against the repo and the CFN registry facts from the
D2 round. Two residual items are one-line-fix class, fully specified below,
and fold into the first build commits (F-1, F-2) — they do not reopen design.

Reviewed at HEAD 93a55dc (D3 committed by Kiro — rule 7 satisfied).

## 1. D2 fix verification (all CONFIRMED landed)

| D2 finding | D3 resolution | Independent check |
|---|---|---|
| NEW H-1 (AR maxItems=2) | §1.1 FIVE guardrails: ArClauseGuardrail (clause-canon, 1 policy) + ArAdvisoryGuardrail (role-permissions + plan-entitlements, 2 policies); Tasks 25/29/38 updated; ar-check selects by path (§5.2/§5.4, Task 27) | Policy counts respect minItems:1/maxItems:2 (registry read, D2 review); §0.1/§0.2 now carry the constraint as verified facts |
| NEW H-2 (embed transport) | §2.1–2.3 full transport spec: op discriminator, `createEmbedFn()`, EMB-2 restated ("executes inside the invoker Lambda"); NEW Task 4 (transport) + Task 3 (embed + dispatch); Task 19 uses `createEmbedFn()`, NEVER imports embed.ts | invoke-transport.ts seam matches (AI_INVOKER_ARN, LambdaClient); EmbedOp discriminator is sound (InvokeRequest has no `op` field); back-compat preserved — **but see F-1: the Lambda binding itself** |
| NEW M-1 (AR stub invalid) | Task 6 explicitly refuses AR guardrails ("Policies required, minItems:1 — wait for Task 25"); both AR guardrails born in Task 25 | ✓ |
| NEW M-2 (guardrailProfileArn) | §1.3 + Task 25 use `guardrailProfileArn` and `this.account` throughout | Matches bedrock.generated.d.ts:8630 + registry `GuardrailProfileArn` required |
| NEW M-3 (missing deploy) | Task 20 step-0 deploys Phases 3–6 code; §13.1 row added; blocked-by updated | Handlers + invoker all AiStack Lambdas (ai-stack.ts:139, 769–796) — single-stack deploy correct |

Lows: L4-8 mapped to Tasks 27+28 ✓; Task 31 names tool-loop.ts + hitl.ts +
store-token.ts chain (matches real seams: tool-loop has InvokeResponse in
hand, hitl.ts builds sfnInput, store-token upserts) ✓; §5.3 names the carry
("owned by the future standards-update spec") ✓; `confidenceThreshold: 0.9`
pinned on both AR guardrails (registry: optional, 0–1 — camelCase L1 prop
verified) ✓; base commit 44eea09 ✓. Task renumbering continuous 1–38, lane
distribution updated (29 KIRO / 7 ARCHITECT / 2 HUMAN — Tasks 5, 26), ACC
table consistent.

## 2. Fold-ins (approved-with-conditions; land in first build commits)

**F-1 — The Lambda binding for the entry dispatch (one line + one probe).**
ai-stack.ts:140 binds the invoker as `handler: 'invoke'` — the Lambda invokes
the exported `invoke()` DIRECTLY; there is no `handler` export in index.ts
(verified: grep, and index.ts:31 `export async function invoke`). §2.2/Task 3
as written would add a dispatch function that nothing binds: unit tests pass
(they call exports directly), synth passes, and an `{op:'embed'}` payload
lands in `invoke()` as a malformed InvokeRequest — failing only at the live
leg. FIX (fold into Task 3 text + implementation):
1. index.ts gains `export async function handler(event: InvokeRequest |
   EmbedOp)` per §2.2; `invoke()` stays exported (tests, types).
2. ai-stack.ts AiInvokerFn: `handler: 'invoke'` → `handler: 'handler'`.
3. Task 7 gains probe (M-4c): live micro-invoke of the DEPLOYED invoker
   Lambda with `{op:'embed', text:'probe', ...}` → assert 1024-dim embedding
   + metering row increment; and a no-op back-compat probe (payload without
   `op` → normal invoke path). Phase-1 code is in by Task 7's wave, so the
   probe belongs there, not Task 20.

**F-2 — §9.3 references a revision that no longer exists.** "Same as D2 §9.3"
is a dangling pointer — D2 lives only in git history; the payload interfaces
(GuardrailCheckedPayload, GroundingBlockedPayload, HopBlockedPayload,
ArRejectedPayload) are normative for Tasks 10/14/27. FIX: inline the four
interfaces into §9.3 (they are ~40 lines; requirements TEL-1..4 carry the
field lists if reconciliation is needed). Design must be self-contained.

Nit (no action required): Tasks 13 and 17 both claim the index.ts
`buildSystemPrompt()` wiring — harmless duplication; whichever lands second
is a verify-only step. Noting to pre-empt a "task already done" surprise.

## 3. Round summary (D1 → D3)

| Round | Blockers found | Source |
|---|---|---|
| D1 | H-1 dormant L1 / H-2 AR cost topology / H-3 missing L5 producer | Coverage + architecture review |
| D2 | AR maxItems=2 (CFN registry) / embed door had no door (transport) | Live registry + transport-boundary verification |
| D3 | none blocking; F-1 binding + F-2 self-containment fold in | Lambda-binding verification |

The residual-risk register for the build phase: DQ-3 still honestly OPEN (AR
policy source format — Tasks 22–24 absorb it, architect lane); the
[REQUIRES-HUMAN] gates are Tasks 5 and 26; ACC-1/2 live proof lands at
Task 20 after the step-0 deploy.

**Build opens: Phase 0 (Task 1) + Phase 1 (Tasks 2–4) on the Kiro lane,
with F-1/F-2 folded into the same wave. STOP at Task 5 (owner gate).**
