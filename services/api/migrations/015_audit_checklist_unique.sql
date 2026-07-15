-- Migration 015: UNIQUE(audit_id, clause_ref) on m3.audit_checklists (spec 41, Task 9)
-- Enables idempotent checklist generation: re-running the generator for an audit
-- skips clauses that already have a checklist row (ON CONFLICT DO NOTHING).
-- Never edit applied migrations — this is a new ALTER per standing rule.

ALTER TABLE m3.audit_checklists
  ADD CONSTRAINT unique_audit_clause UNIQUE (audit_id, clause_ref);
