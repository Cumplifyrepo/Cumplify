# AWSJSON wire-shape bug — saveOrgProfile NEVER worked live (found & fixed, architect, 2026-07-22)

Found during owner-directed demo-tenant seeding (Checkpoint B unblock),
NOT by any test suite — the fourth live-witness catch of the day.

## Finding (SEV-1 for the affected surfaces)

`saveOrgProfile` failed live with `"[object Object]" is not valid JSON`.
Root cause: **AppSync delivers AWSJSON arguments to direct Lambda
resolvers already parsed** (object), but three resolvers did a bare
`JSON.parse(input.<field>)` — correct against hermetic fixtures (which
pass JSON strings), wrong against the real wire. `JSON.parse(object)`
coerces to `"[object Object]"` and throws.

Confirmed live at 12:58Z: single-encoded payload → error; double-encoded
payload (outer layer consumed by AppSync, inner string reaches the
resolver) → `saveOrgProfile` succeeded. That asymmetry is the proof of
the delivery shape.

Impact: the /qms org-profile wizard's save (single-stringify) has been
live-broken since ORG-1 shipped — unnoticed because the dev tenant never
had a profile saved (the exact demo-data gap being closed today). The
hermetic suites stayed green throughout: fixtures encoded what the code
expected, not what the wire delivers — same class as BUG-11c
(sfnExecutionArn) and yesterday's SOD-1 (both found only by exercising
deployed behavior).

## Sweep — every AWSJSON input in the schema

| Field | Resolver site | Verdict |
|---|---|---|
| SaveOrgProfileInput.payload | qms.ts saveOrgProfile | **BROKEN → fixed** |
| SaveDocumentSectionEditInput.trackedChanges | m1.ts saveDocumentSectionEdit (RS-9) | **BROKEN → fixed** (would have failed at first real editor save) |
| SaveFormRecordValuesInput.values | forms.ts saveFormRecordValues | **BROKEN → fixed** |
| SetApprovalMatrixEntryInput.steps | m4.ts | already correct (`typeof === 'string'` guard) — why the matrix witness passed live |
| ApproveHitlItemInput.editedPayload | hitl-approval.ts | correct (typed/used as object, never parsed) |
| PublishGenerationEventInput.summary | qms-generation appsync-publish (backend↔backend) | correct pairing; exercised live by today's run |
| askISO*.queryVector | guru handlers | never parsed from arguments — unaffected |

## Fix

The house both-shapes guard (m4's existing idiom) applied at all three
sites: `typeof x === 'string' ? JSON.parse(x) : x`. String form kept for
hermetic fixtures and any legacy double-encoded caller; object form is
the live wire.

Tests: +3 hermetic wire-shape tests (one per site) that pass the value
as a parsed OBJECT/ARRAY — the true live shape — and assert the
round-trip lands intact (jsonb param / S3 body / typed-column upsert).
Backend suite: **1217 passed / 3 skipped** (baseline 1214 + exactly 3).
Frontend suite: 165 (untouched).

## Demo-tenant seed record (owner-approved, all via app doors, no raw SQL)

- `saveOrgProfile` → **Meridian Design-Build LLC** profile v2 (v1 was the
  minimal probe): 2 sites, 52 employees, 8 core processes, design
  responsibility, ISO9001+14001+45001 in scope; `supplyChainShape` and
  `yearFounded` deliberately absent to demo honest gaps.
- `generateImsManual(ISO9001, ISO14001, ISO45001)` → run
  `6da72479-c278-4638-933c-aef5a5bc5751` **COMPLETE in ~31s**
  (12:59:52Z → 13:00:23Z): 46 sections, all with content, **gapCount 24**,
  manualDocumentId `c77806b5-bd54-407f-a533-20cf3cfec6c4`.
- The run consuming profile v2 end-to-end (facts → derive → compose →
  finalize) is itself the readback that the seeded payload landed as
  correct jsonb, not `[object Object]` — the double-encode workaround
  wrote clean data.
- Seed script: `scratchpad/seed_demo_tenant.py` (single-encode becomes
  correct once this fix deploys; the both-shapes guard accepts either).

## Follow-ups

1. Re-witness `saveOrgProfile` single-encoded after this commit deploys
   (the frontend's true encoding).
2. /manual, /documents, RS-9 e2e now UNBLOCKED for the design-gate pass.
