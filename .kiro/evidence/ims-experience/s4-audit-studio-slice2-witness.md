# S4 Audit Studio Slice 2 — UI witness (browser clicks on deployed Dev)

**Date:** 2026-07-23 · **Witness:** architect (Playwright,
`witness_s4_slice2.mjs` + `witness_s4_slice2_poststate.mjs`) ·
**User:** acc-aaa-admin (tenant-AAA) · **Surface:** `/audits` on
d1tw2kanxo5wnt.cloudfront.net

## Deploy under test

| Fact | Value |
|---|---|
| Commit | `6da6197` (amendment) on top of `cbffddc` (slice 2 build) |
| Pipeline execution | `080044aa` — **Dev stage Succeeded with `latestExecution.pipelineExecutionId = 080044aa`** (cross-checked per the SUPERSEDED-mode lesson; overall execution still InProgress only because an older Staging execution `5cb3fe78` occupies that stage) |
| Push → Dev green | pushed 2026-07-22T23:52:25Z; Dev confirmed 2026-07-23T00:53:13Z |

## Witness verdict — BOTH first-live-caller legs GREEN

| Leg | Result | Evidence |
|---|---|---|
| B1.2 readiness | **PASS** | Click "View readiness scores" → grid rendered **28 clause rows** (exactly the RS-7 `agentScoreReadiness` probe rows), first clause `10.1`, all badges DRAFT (honest score-0 gaps). 00:53:53.102Z, exit 0. Screenshot `s4s2-readiness.png` sha256 `28a1826f…dd01c2` |
| B1.1 completeAudit | **PASS** | First-ever live call. Click "Complete audit" → post-state probe on a **fresh reload** (00:54:45Z, exit 0): row badge **COMPLETED**, "Complete audit" button absent, entire LIFECYCLE section unmounted (gate re-evaluated on refreshed data). Screenshot `s4s2-poststate.png` sha256 `c0a90b44…fec01d` |
| Audit trail | **PASS** | m3 resolver CloudWatch: `"Event published" detailType:"Audit.Completed" tenantId:"tenant-AAA" eventId:"01KY67DWMJDTRX2ZKZA08K1SVW"` at 00:53:53.498Z — the fail-closed registry accepted the event; zero errors in the log window. IAM held (no AccessDenied on rds-data / events:PutEvents) |

## Rig disclosure (architect process error, found and fixed mid-witness)

The first witness run asserted B1.1 by waiting for the "Complete audit"
button to detach — but the button's accessible name changes to
"Completing…" during the mutation, so the name-scoped wait was satisfied
by the **label swap**, and the badge check raced the in-flight mutation
(logged `PARTIAL`, screenshot caught the mid-flight state). The
post-state probe (fresh sign-in + reload, no race) is the authoritative
B1.1 record. Lesson for future rigs: never scope a detachment wait to an
accessible name that the component mutates; assert post-state on a fresh
load.

## Honest gaps

- The amendment's readiness **empty/error states** were not exercised
  live (dev has 28 scored rows, so the grid path ran). They are pinned by
  the two amendment unit tests only.
- Approve leg of the S4 finding card remains blocked on the
  second-approver login (standing owner ask).
- **Data change disclosed:** dev's only audit ("Readback audit for Task 9
  checklist generator", ISO 9001) is now status `completed` — done by
  design as the witness of the completeAudit lifecycle.

## Run log (rule 8)

| Run | Timestamp (UTC) | Exit | Result |
|---|---|---|---|
| Dry run vs old build | 2026-07-22T23:55:17Z | 1 | mount check correctly FAILED pre-deploy (assertion has teeth) |
| Witness (readiness + click) | 2026-07-23T00:53:53Z | 0 | B1.2 PASS; B1.1 click dispatched |
| Post-state probe | 2026-07-23T00:54:45Z | 0 | B1.1 POST-STATE: PASS |
| m3 log readback | 2026-07-23T00:55:09Z | 0 | Audit.Completed published, no errors |
