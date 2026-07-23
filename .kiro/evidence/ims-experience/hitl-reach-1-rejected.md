# HITL-REACH-1 (609f5b0) — STAGE REJECTED (poll wipes paginated pages every 15s)

**Date:** 2026-07-23 · **Validator:** architect · **Commit:** `609f5b0`
(local-only per stop-point — must not deploy as-is). On-disk validation +
re-executed suites 20:14–20:17Z, all exit 0.

## Fatal defect — HR1-POLL-1 (HIGH)

The panel keeps its 15s polling fallback (`setInterval(fetchItems, 15_000)`,
HitlQueuePanel.tsx:88), and `fetchItems` **replaces** the whole list with
page 1 (`return [...data.listPendingHitlItems.items, ...keptApproved]`,
:57) and **resets `nextToken` to page-1's token** (:49).

Failure scenario, concrete: user clicks Load more → reviews a page-2 card →
≤15s later the poll fires → **pages 2+ vanish from the list mid-read** (the
R2 merge keeps only approved-banner items) and the Load-more button
reappears. Every 15 seconds, all pagination progress is destroyed; reaching
page 3 requires two clicks inside one poll window. The stage's own
acceptance — items beyond page 1 UI-reachable — is met only in ≤15s
windows, and the commit's design claim ("user controls fetch cadence") is
contradicted 20 lines below the button.

The 3 new tests pass because none advances timers across the poll interval —
the mock suite defends the defect (same class as B3: unit-green ≠ live).

## HR1-DUP-1 (MEDIUM)

`fetchMore` appends with no dedup (:74). The queue mutates between fetches
(approvals remove, dispatches prepend), so cursor windows shift: e.g. an
approval on page 1 slides item U into the fresh page-1 window while a
stale page-2 fetch (cursor before U) also returns U → duplicate
`key={hitlItemId}` → React key error + double card. The poll/fetchMore
interleave also races `setNextToken` (last writer wins → indeterminate
depth).

## Amendment requirements

1. Poll must PRESERVE pagination state: merge page-1 results by
   `hitlItemId` into the existing list (update/refresh page-1 items, keep
   the loaded tail; removals remain owned by the subscription + R2 paths),
   and never clobber `nextToken` with a shallower token while deeper pages
   are loaded. Mechanism is your design call — state it in the header
   comment and pin it.
2. One dedup-by-id merge helper on EVERY list update (fixes HR1-DUP-1 and
   the interleave in the same move).
3. A test that FAILS on today's code: load page 2 → advance fake timers
   past 15s with a page-1 poll response → page-2 card still mounted and
   pagination depth preserved. Plus a dedup test (overlapping windows).
4. Restate baselines after the amendment.

## Validated CORRECT (keep — this was a near-miss, not a rework)

- Mount/call-site gate PASS, all claims exact: button :143, conditional
  :141, `fetchMore` :66.
- Wire shape correct end-to-end: `PaginationInput.nextToken` (schema :854),
  `LIST_PENDING_HITL_QUERY` declares `$pagination` and selects `nextToken`
  (hitl.ts:38-46) — no schema change needed, pin stays 99.
- i18n discipline: `loadMore`/`loadingMore` in en/es/pt in the same commit.
- Load-more failure posture (non-fatal, list intact, button retryable) is
  right.
- Suites re-executed: backend **1283/3 skipped**, frontend **207**, tsc
  clean in BOTH roots (L9), pin **99** (api-stack.unit.test.ts:155).
- Explicit load-more over infinite scroll: design choice accepted.

## After the amendment

Re-validate → push → deploy → architect UI witness on dev (24+ pending
cards: count > 20 reachable, and a loaded page must SURVIVE a poll cycle).
