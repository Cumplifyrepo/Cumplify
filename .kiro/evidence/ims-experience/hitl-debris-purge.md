# HITL debris purge — 24 pending build-artifact cards erased (dev, owner-directed)

**Date:** 2026-07-23 · **Operator:** architect · **Owner directive:**
"July-9-era debris must be totally erased — we can't carry on failed builds
debris." Method chosen by owner: **raw DDB purge on dev** (over the app-door
send-back alternative) — deliberately keeps tenant-AAA's audit trail clean
for the Checkpoint B demo, i.e. NO 24 bulk `Hitl.SentBack` events dated
today. Dev/test tenant only.

## Scope (verified, zero drift)

24 `status=PENDING` HITL rows under `TENANT#tenant-AAA#HITL`, cross-checked
against `listPendingHitlItems` (app door) — DDB set == GraphQL set exactly,
0 in one and not the other. Span: 1× 2026-07-09 (CAPAGuru capa-open, the
ancient one), 21× 2026-07-22 (studio-wave build/witness era), 2× 2026-07-23
(DocStudio doc-draft from the green B3 witness dispatches). Full id/agent/
timestamp manifest: `hitl-debris-purge-manifest.json`.

## Execution (three guarded steps)

1. **Orphan SFN teardown** — each card is a `HitlStateMachine…NaXnao6slsM8`
   execution paused at `waitForTaskToken`. Described all 24: **23 still
   RUNNING** (paused up to 2 weeks; Standard executions allow 1yr), 1
   NO_ARN (07-09, pre-dates ARN storage). Stopped all 23
   (`error=DEBRIS_PURGE`). Raw delete alone would have left these paused
   holding tokens — this is exactly the teardown the app-door send-back
   does via `SendTaskFailure`, done manually here.
2. **Scoped delete** — dry-run printed the 24 keys, then `delete_item` per
   row with `ConditionExpression: attribute_exists(PK) AND status =
   'PENDING'` — an APPROVED/RESOLVING row could not be deleted even on an
   id collision. Result: **24 deleted, 0 skipped**.
3. **Scoping proof** — the 6 pre-existing `APPROVED` rows in the SAME
   partition were untouched (6 before, 6 after) — the delete hit only the
   PENDING debris, nothing else.

## Verification (post-purge)

| Check | Result |
|---|---|
| App-door `listPendingHitlItems` (imslead) | **0 items, nextToken null** |
| Raw partition scan | 6 rows, all APPROVED — **0 PENDING** |
| SFN RUNNING behind debris | 0 (23 stopped, 1 never existed) |
| UI witness `/dashboard` (acc-aaa-admin, 22:19Z) | **0 cards, no Load-more, "No items" empty-state** — `queue-empty-postpurge.png` |

## Artifacts (sha256₁₆)

`hitl-debris-purge-manifest.json` `e53e6530aa32a541` ·
`queue-empty-postpurge.png` `66e35173c6c6d478` · (scratchpad:
`ddb_delete_result.json` `a52f42a8c25c7826`, `sfn_abort_result.json`
`4ba8f5005eb9a8be`).

## Note

Demo material is not lost: any studio dispatches a fresh live agent
proposal in ~15s (the Checkpoint B hero beat), which is better demo
material than a 2-week-old stale card. The Approval Queue now starts clean.
