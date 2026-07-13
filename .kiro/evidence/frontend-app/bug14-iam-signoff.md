# BUG-14 — tenant-data role UpdateItem (HITL-pinned) — owner sign-off

**Date:** 2026-07-13
**Surface:** cumplify-dev-tenant-data-role inline policy (owner-signed IAM surface,
REQUIRES-HUMAN carve-out) + resolveHitlItem client routing.

**Defect (witnessed live at ACC-3, 2026-07-13 09:21Z):** approveHitlItem →
`AccessDeniedException: assumed-role/cumplify-dev-tenant-data-role ... not authorized
to perform: dynamodb:UpdateItem`. The role grants GetItem/PutItem/Query/
TransactWriteItems only; the approval Lambda's ambient role has zero DDB actions.
Both approval-path writes (PENDING→RESOLVING guard, resolveHitlItem bookkeeping)
were never granted anywhere — every HITL approval in the product failed.

**Fix as approved:** ONE new statement on the tenant-data role —
`dynamodb:UpdateItem` on CumplifyCore with
`ForAllValues:StringLike dynamodb:LeadingKeys = ['TENANT#${aws:PrincipalTag/tenantId}#HITL']`
(exact partition, no wildcard tail). Deliberately NOT added to the broad tenant-wide
statement: that would open a same-tenant AUDITLOG modify surface. resolveHitlItem now
rides the same tenant-scoped client; ambient role unchanged (zero DDB). Sweeper
unchanged (its own cross-tenant-by-design policy). Template + source assertions pin:
broad statement never gains UpdateItem.

**Owner decision:** "Approve — deploy" (AskUserQuestion, 2026-07-13; full diff shown
in the option preview). Deploy target: dev, direct (architect, standing auth).
