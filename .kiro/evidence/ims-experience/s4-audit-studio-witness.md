# S4 Audit Studio — UI witness (browser clicks on deployed Dev)

**Date:** 2026-07-22 · **Witness:** architect (Playwright,
`witness_s4_audit_studio.mjs`) · **User:** acc-aaa-admin (tenant-AAA)
**Surface:** `/audits` on d1tw2kanxo5wnt.cloudfront.net

## Two live defects found and fixed before the witness passed

Both shipped with fully green suites — only the deploy/witness caught them.

1. **`efbbf44` deploy FAILED at `DeployFrontendContent`** (CodeBuild
   `0e6c654a`): `/audits` passed `{label, onClick}` to `EmptyState.action`,
   which is a `ReactNode` (API pattern-matched from `GuidanceBanner`). Root
   `tsc --noEmit` does NOT cover `frontend/` — `next build` is the only
   frontend typecheck and it runs at deploy time. Fixed `c583571`:
   SecondaryButton element + empty-branch render test (frontend 197→198) +
   brief lesson L9.
2. **First witness run on `c583571`: no HITL card in 180 s.** LeadAuditor
   logs (RequestId `61210d27`, 22:45:12Z): invoked ✓, VPC retrieval ✓
   (iso-kb 3 canon chunks; tenant-docs 404 = known no-indexer state), then
   `stopReason: guardrail_intervened` at turn 0. Handler sent ONE plain text
   block — no `guardedText` — so the whole message was PROMPT_ATTACK-
   evaluated (S2/L2 class; L2 was missed on this agent while L1/L5 were
   applied). Fixed `40cbd46`: scope/checklist/prior findings/SQS payloads →
   `guardedText`; test rewritten to pin the split (tenant text must NOT
   appear in plain blocks).

## Witness run (PASS)

| Step | Result |
|---|---|
| Deploy under test | `40cbd46` — Dev stage SUCCEEDED end-to-end (poll `bchf164ba`, `RESULT: SUCCEEDED`) |
| LeadAuditor code readback | `cumplify-lead-auditor-dev` LastModified 2026-07-22T23:06:23Z, CodeSha256 `8OSKLHANIf2A7KEeSYPoRv5XuBauO6KBVd2SggkCD4A=`, VPC 2 subnets |
| Sign-in + `/audits` | 1 audit row rendered (`data-testid=audit-row-*`) |
| Expand + click "Propose finding with LeadAuditor" | mutation dispatched, button polled |
| HITL card | ARRIVED — `proposal-view` rendered `true` (pretty FindingView, not raw JSON) |
| Card content | LeadAuditor · PENDING · audit-finding-write · **major-nc** · clause **9.2** · **ISO9001** · description cites absence of audit plans/checklists/records in `register.audits` |
| Actions shown | Approve · Edit & approve · Send back with note; "On approval, event seals to your audit trail" |
| End state | left **PENDING** for a second approver (SoD blocks self-approval) |
| Script exit | `DONE` printed, completed 2026-07-22T23:10:00Z |
| Screenshot | `s4-finding-card-pending.png` (sha256 `8933f6a7…e5bfc10`) |

Approve leg (finding INSERT + same-txn NC spawn into CAPA Studio) remains
unit-pinned only — blocked on the second-approver login (standing owner ask).

Baselines at close: backend **1262**/3 skipped, frontend **198**, resolver
pin **98**, root+frontend tsc clean.
