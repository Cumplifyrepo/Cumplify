# S3 Manual Studio — UI witness PASSED (2026-07-22, post-cc81571)

Rig: Playwright chromium on deployed Dev CloudFront, acc-aaa-admin
(tenant-AAA / Meridian). Real clicks, exact role-based locators.
Script: session scratchpad `witness_s3_manual_studio.mjs`.

## First run FAILED → S3.1 (the witness works)

The first click (post-9567f5f) ran the WHOLE backend chain — SECTION MODE
drafted with 3 canon iso-kb chunks, HITL gate opened, card
`01KY5JAGAV4HPBVZ89A208ZA8C` PENDING in DDB — but the mutation errored:
`publishAuditEvent` threw "Unregistered detailType: 'Agent.RunRequested'"
AFTER the Event-invoke (fail-closed registry doing its job), so
AgentRunButton surfaced a dispatch error and never polled. Fix cc81571:
no audit at dispatch (runNcIntake/runDocDraft parity — the HITL plane
audits gate-entry/approval); pinned by "publishes NO audit event" test.
Third consecutive studio surface where only a browser-level witness could
catch the defect (the card existed; the user never saw it).

## The beat (exit 0, cc81571 deployed)

1. /manual: 46 sections, 21 prose, **24 GAPS**, 25 Draft-with-DocStudio
   buttons (24 GAP + 1 FAILED).
2. Clicked the first button — row `10.2#ISO14001`, a **FAILED** section
   (repair path witnessed, not just gap fill).
3. **Inline MANUAL-SECTION-DRAFT card arrived in the section row** —
   PENDING, left for a second approver.

Card content (verbatim, screenshot
`screenshots/s3-manual-studio-card-pending.png`):
- 6 drafted sentences of ISO 14001 10.2 corrective-action prose, grounded:
  names Meridian Design-Build LLC, the Operations Director as management
  representative, and the M2/CAPAGuru corrective-action workflow. No
  invented facts; no bracketed gaps needed for this section.
- rationale for the approver (clause intents covered, grounding basis).
- Approve / **Edit & approve** / Send back with note + "On approval, event
  seals to your audit trail" — doctrine #2/#3/#4 on one card.

## Still open on this surface
- Approve leg (card → GEN-6 override → new manual version → gapCount 24→23)
  is unit-pinned end to end; live proof awaits the second-approver login.
- Two cards for `10.2#ISO14001` now pending (one from the failed first run)
  — the second approver should send one back; both are legitimate drafts.
- S3 slice 2: Tiptap in-place section editing on /manual (plan §S3 item 2).
