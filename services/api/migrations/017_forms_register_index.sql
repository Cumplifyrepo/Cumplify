-- Migration 017: register-listing index (spec-41 Task 10 / OQ-2 gate).
-- The paginated register listing filters (tenant_id [RLS], template_id) and
-- orders by created_at DESC — this index serves the page as an ordered walk
-- instead of fetching + sorting every record of the template (measured at
-- 10k records: the sort path fetched all 10k rows per call).
CREATE INDEX IF NOT EXISTS idx_forms_records_register
  ON forms.records (tenant_id, template_id, created_at DESC);

-- Exact prefix of the new index — redundant, write amplification only.
DROP INDEX IF EXISTS forms.idx_forms_records_template;
