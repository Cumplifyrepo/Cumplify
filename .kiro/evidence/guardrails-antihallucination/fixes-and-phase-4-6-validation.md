# Spec-35 FIX-V1..V4 + Phase 4/5/6 wave — architect validation (2026-07-16)

**Verdict: wave ACCEPTED.** All four ordered fixes landed correctly and all
six tasks (14–19) match design; Kiro's evidence claims REPRODUCED exactly
this time (root suite + tsc at the delivered tree — the binding evidence
rule held). One process breach and two small code findings noted below;
none block Task 20.

## Re-execution (architect, delivered working tree)

| Claim | Architect re-execution | Result |
|---|---|---|
| "npx vitest run (ROOT) 970 tests / 0 failures" | `npx vitest run` | 92 files + 1 skipped, **970 passed / 0 failed** — MATCHES |
| "tsc --noEmit exit 0" | `npx tsc --noEmit` | exit 0 — MATCHES |
| (not claimed) | `npx cdk synth --quiet` | exit 0 |

## Fix verification

- **FIX-V1 ✓** parseGroundingResponse derives verdict from per-filter
  `action === 'BLOCKED'` on GROUNDING/RELEVANCE; mixed-assessment test
  present (PII intervened + grounding passed → 'pass').
- **FIX-V2 ✓** Ai.GuardrailChecked published per section check in
  runGroundingFlow with verdict/scores/latencyMs. NOTE (low): payload
  carries `groundingScore` + `relevanceScore` instead of design §9.3's
  single `score` field — richer; reconcile §9.3 when convenient.
- **FIX-V3 ✓** `InvokeRequest.standard` union added, threaded through both
  grounding flows + hop check; gurus pass their standard (guru-9001 read).
- **FIX-V4 ✓** Diacritics restored in .es/.pt templates + honest-miss.ts
  (spot-checked: "información/alcanzó/Não/possível/fundamentação").

## Task verification (14–19)

- Task 14/15: hop-check.ts — ApplyGuardrail source:'INPUT' on agent-routing
  tool payloads (registry of 4 names + isAgentRoutingTool), Ai.HopBlocked +
  Ai.GuardrailChecked emission, 500-char sanitized payload summary,
  InvokeError('HOP_BLOCKED') halts the chain; wired in invoke() on
  stopReason='tool_use'. 10 tests.
- Task 16/17: four prompts/shared/ files (factual-claim-free, spot-read);
  buildSystemPrompt(basePrompt) prepends all four; index.ts wraps
  request.system (closes Task 13's struck-through bullet). 9 tests.
- Task 18: no code duplicated — verified against the architect-rewritten
  clamp test in the root suite, as ordered.
- Task 19: guru-9001/14001/45001 rewritten — createEmbedFn() (C-1 upheld,
  no embed.ts import), retrieve() under the 45s budget wrapper, chunks
  joined '\n---\n', query.slice(0,1000), locale + per-guru standard;
  tenantId still FAIL-CLOSED from resolverContext; retrieval failure
  degrades to the dormant (ungrounded) path — wrapper logs the failure.
  12 tests. **Copilot leg: BLOCKED claim VERIFIED** (no
  services/agents/copilot/ in the tree) — recorded as a NAMED CARRY on
  Task 19; re-attaches when the copilot spec lands.

## Findings (non-blocking, ordered to next wave)

- **W-1 (M-low):** On a blocked hop, invoke() propagates HOP_BLOCKED
  WITHOUT metering the converse usage already consumed — the honest-miss
  path meters before returning; the hop-block path leaks unmetered spend.
  Fires only on blocked hops (rare), but billing integrity is a core
  invariant. FIX: meter usage before the hop-check throw propagates
  (try/finally or meter-then-rethrow).
- **W-2 (low):** prompt-library injection is skipped when request.system is
  absent (`request.system ? buildSystemPrompt(...) : undefined`) — L4-1
  says uniform. All current callers pass a system prompt; make the wrap
  unconditional (buildSystemPrompt('') base) or document the exemption.
- **Process breach (rule 7):** the wave was delivered UNCOMMITTED (evidence
  logs written, zero commits — same class as D1's L-6). Per-task commit
  granularity is unrecoverable post-hoc (index.ts interleaves four tasks'
  edits), so the architect commits the wave as ONE commit for the record.
  Standing rule reiterated in the next order: COMMIT PER TASK, tick +
  evidence log in the same commit — an uncommitted delivery is not
  delivered.

## Wave commit

Committed by architect with this file; push triggers the pipeline run whose
Dev deploy is Task 20's step-0 (architect lane, witnessed).
