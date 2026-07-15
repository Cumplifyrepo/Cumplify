-- Migration 015: Add 'finding' to forms.template_fields relation_target CHECK (spec 41, Task 9)
-- The internal audit checklist generator creates per-clause fields with
-- relation_target = 'finding' pointing to m3.audit_findings.
-- Never edit applied migrations — this is a new ALTER per standing rule.

-- Drop the existing CHECK constraint and re-create with 'finding' added
ALTER TABLE forms.template_fields
  DROP CONSTRAINT IF EXISTS template_fields_relation_target_check;

ALTER TABLE forms.template_fields
  ADD CONSTRAINT template_fields_relation_target_check
  CHECK (relation_target IS NULL OR relation_target IN (
    'nonconformity', 'corrective_action', 'audit', 'risk', 'document', 'clause', 'user', 'finding'
  ));
