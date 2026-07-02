---
inclusion: always
---
# Scope Discipline
- No AWS service, model, or third-party dependency outside tech.md and
  Appendices A/C/D/E/F/G/H. If a task seems to need one: STOP, flag it in the
  spec's Open Questions, do not implement.
- Prefer the existing pattern over a new one. If a steering file defines a
  pattern (idempotency, eventing, auth, caching), use it verbatim.
- Human-gated domains — never run autonomously, always propose + wait:
  SecurityStack, IAM policies, billing code (Stripe AND Marketplace),
  legal-consent flows, anything under services/audit-trail, metering jobs.
- Tests: follow 13-testing.md; keep tests proportional; do not generate
  speculative abstraction layers, config options, or TODO scaffolds nobody
  asked for.
- Every mutation names its audit event in design BEFORE implementation
  (evidence-first rule). Every clauseRef must exist in the canonical spine.
