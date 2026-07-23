# S4 approve leg — LIVE WITNESSED (the last unit-pinned-only leg of S4)

**Date:** 2026-07-23 · **Witness:** architect · **Approver:**
acc-aaa-imslead@example.com (IMSLead → management-rep, owner-fixed standing
credentials) — **first cross-studio approval on dev**.

## The leg (previously pinned by unit tests only)

LeadAuditor's major-nc 9.2 finding card (created at the S4 slice-1 witness,
PENDING since 2026-07-22T23:09:41Z, hitlItemId `01KY61F312AH4HJKPJ4X5T88Z1`)
approved by the SECOND approver → ExecuteWriteback → finding INSERT **+
same-transaction NC spawn into m2** (major→high, source 'audit').

| Step | Result (UTC) |
|---|---|
| Approve (SoD leg) | `approveHitlItem(APPROVE)` as imslead 15:31:44Z → decision APPROVE, **auditEventId `01KY7SN9AWZ0HKN5F1CGRJAG2V`**, resolvedBy `54e8a438-1011-70a6-0f24-d62873a4f7ee` (imslead's sub ≠ proposer — SOD-1 held) |
| /audits finding row | 15:32:19Z — empty-state gone; major-nc ISO 9001 9.2 finding rendered on the expanded audit. `s4-cross-1-finding.png` sha256 `6fad6d03…` |
| /capa spawned NC | 15:32:26Z — CAPA Studio register TOP ROW: "Audit finding (major_nc): …absence of audit plans, checklists, and records…" · **HIGH** · **ISO 9001 · 9.2** · raised 7/23/2026 · **OPEN**. `s4-cross-2-capa.png` sha256 `9487bb75…` |

Method note: the approve fired via the `approveHitlItem` mutation as the real
imslead Cognito user (SRP), NOT via the dashboard button — because of
HITL-REACH-1 below the card is unreachable in the UI. The HitlCard Approve
button itself was UI-witnessed in S1 (same chassis); the leg under test here
(SoD + writeback + cross-studio spawn) is fully exercised by the mutation.

## Live-found defect — HITL-REACH-1 (Kiro backlog)

`HitlQueuePanel` (dashboard Approval Queue) fetches ONLY page 1 of
`listPendingHitlItems` (20 items) and never paginates (`nextToken` typed but
unused). Dev has 24 pending items → the finding card sat on PAGE 2,
**invisible to every approver in the UI**. Any tenant with >20 pending
approvals silently loses access to the older ones. Fix: paginate (or
load-all with a cap + "show more"), and consider surfacing pending cards on
their home studio surfaces too.

Related observation: the pending queue carries demo debris back to
2026-07-09 (task-11 CAPA cards, RecordsVault duplicates). Owner may want a
sweep — send-back with note is the clean path; NOT done unilaterally.

## State changed on dev (disclosed)

- HITL item `01KY61F3…` PENDING → APPROVED (sealed, audit event above).
- New finding row on the (completed) readback audit; new OPEN high-severity
  NC in m2 (the register's top row). Both are the intended demo artifacts —
  this IS the Checkpoint-B cross-studio story, now real on dev.
