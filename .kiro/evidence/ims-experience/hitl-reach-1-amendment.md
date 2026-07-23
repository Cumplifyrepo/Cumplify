# HITL-REACH-1 amendment — HR1-POLL-1 + HR1-DUP-1 fixed (architect-built, owner ruling)

**Date:** 2026-07-23 · **Author:** architect, under owner ruling "lets
proceed with build" (fresh ruling per the reinstatement gate — Kiro remains
the default builder). Amends `609f5b0` per `hitl-reach-1-rejected.md`.

## What changed (HitlQueuePanel.tsx only; no schema, pin stays 99)

1. **Poll preserves pagination (HR1-POLL-1).** `fetchItems` no longer
   replaces the list: when pagination is open it merges the fresh page-1
   window by `hitlItemId` and keeps the loaded tail (which contains the R2
   approved-banner items by construction). Single-page mode keeps the
   original R2 replace semantics unchanged.
2. **Token depth preserved.** Page-1 refreshes adopt the page-1 token ONLY
   when pagination is not open at a deeper cursor. Once drained
   (`nextToken === null`) the poll may re-adopt page-1's token so overflow
   items that slid past the loaded window stay reachable — the re-walk is
   dedup-safe. `hasLoadedMoreRef` is set BEFORE the fetch await so a
   concurrent poll tick cannot clobber a cursor mid-flight (restored on
   failure).
3. **One dedup helper (HR1-DUP-1).** `mergeById(first, rest)` applied on
   both update paths — overlapping cursor windows can no longer produce
   duplicate React keys.
4. Stable callbacks via refs (`nextTokenRef`) so the 15s interval does not
   reset on page turns. Contract documented in the header comment.

## Disclosed trade-off

While paginated, the poll cannot distinguish "resolved elsewhere" from
"pushed off page 1", so it keeps the tail — resolved-item removal in the
paginated state is owned by the subscription (and the card's own remove
path), not the poll fallback. Stated in the header comment.

## Tests (the brief's requirement: FAIL on 609f5b0)

Three new tests added; verified BOTH ways in the same session:

| Run | Result |
|---|---|
| New tests vs `609f5b0` component (old code checked out) | **3 failed | 11 passed** — poll-survival, dedup, token-depth all fail exactly |
| Full file vs amended component | 14/14 pass |

## Baselines re-executed (20:37Z, exit 0)

Backend **1283 passed / 3 skipped**, frontend **210** (207 + 3), tsc clean
in BOTH roots, resolver pin **99** untouched.

## Next

Push the chain (one pipeline run) → revision-pinned Dev monitor → UI
witness on dev: load page 2 with 24+ pending cards, hold it across a
≥15s poll cycle, count > 20 reachable.
