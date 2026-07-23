# HITL-REACH-1 — UI WITNESS PASS on deployed Dev, STAGE CLOSED GREEN

**Date:** 2026-07-23 · **Validator:** architect · **Deployed chain:**
`609f5b0` (Kiro build) + `6d77e9d` (rejection) + `0002037` (B6) + `a395de7`
(amendment) via pipeline execution `9671b560-464d-4a16-b72e-03dd6502dd70`
(revision-pinned `a395de7…`, Dev stage Succeeded, monitor b8eeplnm9).

## Witness (real clicks, live dev, 20:58:19–20:58:41Z, exit 0)

`witness_hitl_reach1.mjs`, signed in as acc-aaa-admin on `/dashboard`:

| Beat | Result |
|---|---|
| Page 1 renders | **20 cards** + a visible "Load more" button — the button's existence is itself bundle-provenance (no prior deploy has it) |
| Click Load more | **24 cards (+4)** — the previously UI-unreachable tail of the pending queue is now reachable |
| Hold 18s across a REAL poll cycle | **24 cards, missing=0, dups=0** — the loaded page survived the live 15s poll; HR1-POLL-1 and HR1-DUP-1 acceptance proven against the deployed system, not mocks |

Screenshots (sha256₁₆): `hitl-reach1-1-page1.png` `0af2175f0746a5d0` ·
`hitl-reach1-2-loaded.png` `487b5c8c3aae9a87` ·
`hitl-reach1-3-postpoll.png` `dde6cafc93ac80db`.

This is exactly the leg the rejection demanded: on `609f5b0` as delivered,
beat 3 would have shown the 4 loaded cards wiped by the first poll tick.

## Stage ledger

- Kiro build `609f5b0`: mounts/wiring/i18n correct, poll interaction fatal
  (`hitl-reach-1-rejected.md`).
- Amendment `a395de7` (architect-built under owner ruling): merge-by-id
  poll preserving the loaded tail + token depth, dedup on both paths,
  3 tests fail-verified against the old component
  (`hitl-reach-1-amendment.md`).
- Suites at close: backend 1283/3 skipped, frontend 210, pin 99, tsc
  clean both roots.

## HITL-REACH-1: CLOSED. Queue debris note

The 24 pending cards now all reachable include the 07-09-era debris —
the owner's sweep decision (approve/send-back/purge) is now actionable
entirely from the UI.

## Next in Kiro's queue

`stripe-billing` (owner-gated T3 plan catalog + T7 Meters-vs-Metronome)
and B6/GEN-LANE-1 design (composer empty-factRefs). LC-1 still awaits the
owner's design ruling.
