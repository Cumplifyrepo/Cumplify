-- Migration 016: doc_type values for spec-40 Task 6 derived documents (GEN-8).
-- The Standards Correlation Matrix and Documented-Information Master List are
-- DERIVED data documents (registry × section state — never model-authored).
-- Honest labeling: they are not 'procedure'/'scope'; they get their own types.

ALTER TABLE m1.documents DROP CONSTRAINT documents_doc_type_check;
ALTER TABLE m1.documents ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN ('manual', 'procedure', 'work_instruction', 'policy', 'scope',
                      'correlation_matrix', 'master_list'));
