---
inclusion: auto
description: "segregation of duties, approver rules, auditor independence"
---
# Segregation of Duties (Part 13.2)
SoD violations are hard-blocked and logged. No workaround, no override.

## Rules table
| Rule | Enforcement | ISO anchor |
|---|---|---|
| Author ≠ Approver | On every approval workflow: the user who authored/submitted cannot be the approver | 7.5.3 control of documented information |
| Auditor independence | An Internal Auditor cannot audit processes where they hold write roles | 9.2 Internal audit (impartiality) |
| Incident-investigator ≠ area supervisor | The investigator of an incident cannot be the supervisor of the area where it occurred | 45001 10.2 Incident investigation |

## Permission model
- `group → base permission set` + optional per-user grants (PERMSET# items
  in CumplifyCore) evaluated by the authorizer.
- Resolvers check `permissions`, never group names (roles can evolve without
  schema churn).
- SoD rules evaluated at mutation time in the resolver/authorizer layer.
- Why: enforcement at the authorization layer, not the UI — no client can
  bypass it.

## Delegation & absence
- Time-boxed delegation records: "EHS Manager delegates approvals to X,
  Jul 1–14". Delegation does NOT override SoD — a delegate inherits the
  constraint (they still cannot approve their own work).
- Every delegation is logged immutably.
- Why: real orgs need absence coverage; auditors love seeing it tracked.

## Build rules
- Every approval workflow MUST implement SoD check before the approval
  mutation commits.
- SoD violations emit a `Security.SodViolationBlocked` audit event (actor,
  attempted action, rule that fired).
- A spec that introduces an approval flow without SoD enforcement is
  incomplete.
