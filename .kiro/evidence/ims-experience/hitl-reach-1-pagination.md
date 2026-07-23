# HITL-REACH-1 Approval Queue Pagination — Build Evidence

**Date:** 2026-07-23 · **Builder:** Kiro · **Commit:** TBD (this commit)
**cdk-outputs.json blob SHA:** `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Summary

`HitlQueuePanel` fetched page 1 only (20 items, `nextToken` unused) — items
beyond page 1 were UI-unreachable. Fixed with an explicit "Load more" button
that consumes `nextToken` until drained.

## Design choice

**Explicit load-more button** over infinite scroll. Rationale:
- User controls fetch cadence (no surprise network activity on scroll)
- No scroll-jank on large queues (the list already has max-height with overflow)
- Deterministic test surface (click → assert, not scroll-intersection)
- Button disappears when `nextToken` is null (all items loaded)

## Mount / call-site

| Feature | File:line | Reachable from |
|---------|-----------|----------------|
| Load more button | `frontend/src/app/(authenticated)/dashboard/_panels/HitlQueuePanel.tsx:143` | `/dashboard` Command Center panel, below the approval card list |
| fetchMore handler | `HitlQueuePanel.tsx:66` | Called by the button's onClick |
| nextToken state | `HitlQueuePanel.tsx:141` | Conditionally renders the button when non-null |

## Behavior

1. Initial load: fetches page 1 (limit 20), stores `nextToken` from response.
2. If `nextToken` is non-null → "Load more" button renders below the card list.
3. Click → fetches next page with `{ pagination: { limit: 20, nextToken } }`.
4. Response items APPENDED to existing list (no replacement).
5. New `nextToken` stored; if null → button disappears (all items loaded).
6. 15s polling refresh continues on page 1 only (matches pre-existing behavior
   for the most-recent items; load-more pages are additive snapshots).

## Files modified

| File | Change |
|------|--------|
| `frontend/src/app/(authenticated)/dashboard/_panels/HitlQueuePanel.tsx` | loadingMore/nextToken state, fetchMore callback, load-more button |
| `frontend/src/app/(authenticated)/dashboard/_panels/HitlQueuePanel.module.css` | `.loadMore` flex container |
| `frontend/src/app/(authenticated)/dashboard/_panels/HitlQueuePanel.test.tsx` | +3 tests (renders when nextToken, hides when null, appends page 2) |
| `frontend/messages/en.json` | +loadMore, +loadingMore in commandCenter |
| `frontend/messages/es.json` | +loadMore, +loadingMore in commandCenter |
| `frontend/messages/pt.json` | +loadMore, +loadingMore in commandCenter |

## Test evidence (rule 8)

| Run | Timestamp (UTC) | Exit | Result |
|-----|-----------------|------|--------|
| Backend vitest | 2026-07-23T20:09:10Z | 0 | 1283 passed, 3 skipped |
| Frontend vitest | 2026-07-23T20:09:43Z | 0 | 207 passed |
| Root tsc --noEmit | 2026-07-23T20:09:10Z | 0 | clean |
| Frontend tsc --noEmit | 2026-07-23T20:09:10Z | 0 | clean |

**Digest input (verbatim):** `backend:1283/3skip frontend:207 root-tsc:0 frontend-tsc:0`
**Outputs SHA-256 (first 16 hex):** `38e11bb342c079ff`
**Resolved against:** `cdk-outputs.json` blob `b91620ef1c49542eba35375abbc2a21b4b58c766`

## Baselines

| Lane | Before (B2 close) | After (HITL-REACH-1) | Delta |
|------|-------------------|----------------------|-------|
| Backend | 1283 / 3 skip | 1283 / 3 skip | 0 |
| Frontend | 204 | 207 | +3 (pagination tests) |
| Resolver pin | 99 | 99 | 0 |
| Root tsc | clean | clean | — |
| Frontend tsc | clean | clean | — |
