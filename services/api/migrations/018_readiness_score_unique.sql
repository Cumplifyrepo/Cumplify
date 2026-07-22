-- Migration 018: UNIQUE(tenant_id, standard, clause_ref) on m3.audit_readiness_scores
-- (read-surface-completion RS-7: agentScoreReadiness upserts). Enables
-- ON CONFLICT DO UPDATE re-scoring instead of check-then-insert/update races.
-- Never edit applied migrations — this is a new ALTER per standing rule.

ALTER TABLE m3.audit_readiness_scores
  ADD CONSTRAINT unique_tenant_standard_clause UNIQUE (tenant_id, standard, clause_ref);
