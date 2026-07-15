-- Migration 012: QMS Forms & Records Engine (spec 41, design §2)
-- Schema: forms (tenant-less catalog + tenant record tables)
-- Depends on: 011_qms_engine.sql (IMS enum, clause registry) — same deploy wave.
--
-- BC-1: templates are DATA, not code. Counts are queries over rows.
-- BC-2: relation fields validated via existence probe inside tenant transaction.
-- BC-7: label keys are i18n catalog references, not strings.

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS forms;

-- ============================================================
-- CATALOG TABLES (tenant-less; BC-1)
-- ============================================================

CREATE TABLE forms.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  title_key TEXT NOT NULL,
  description_key TEXT NOT NULL,
  category TEXT NOT NULL,
  clause_refs TEXT[] NOT NULL DEFAULT '{}',
  standards TEXT[] NOT NULL CHECK (standards <@ ARRAY['ISO9001','ISO14001','ISO45001','IMS']::TEXT[]),
  maps_to TEXT NULL CHECK (maps_to IS NULL OR maps_to IN ('m2_ncr')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE forms.template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES forms.templates(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE forms.template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES forms.template_sections(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label_key TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'textarea', 'number', 'date', 'select',
    'multiselect', 'radio', 'checkbox', 'user', 'relation'
  )),
  required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NULL,
  relation_target TEXT NULL CHECK (relation_target IS NULL OR relation_target IN (
    'nonconformity', 'corrective_action', 'audit', 'risk', 'document', 'clause', 'user'
  )),
  maps_to_column TEXT NULL,
  validation JSONB NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- BC-2: relation fields MUST have a target
  CONSTRAINT relation_requires_target CHECK (
    field_type != 'relation' OR relation_target IS NOT NULL
  )
);

-- Indexes on catalog tables
CREATE INDEX idx_forms_template_sections_template ON forms.template_sections(template_id);
CREATE INDEX idx_forms_template_fields_section ON forms.template_fields(section_id);

-- ============================================================
-- RECORD TABLES (tenant-scoped; RLS-enforced)
-- ============================================================

CREATE TABLE forms.records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES forms.templates(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_progress', 'complete', 'approved', 'reopened'
  )),
  opened_by TEXT NOT NULL,
  completed_by TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  m2_nc_id UUID NULL,
  m4_record_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE forms.record_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES forms.records(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  field_id UUID NOT NULL REFERENCES forms.template_fields(id),
  value_text TEXT NULL,
  value_number NUMERIC NULL,
  value_date TIMESTAMPTZ NULL,
  value_bool BOOLEAN NULL,
  value_uuid UUID NULL,
  value_json JSONB NULL,

  -- Exactly one value column must be non-null (design §2.2)
  CONSTRAINT exactly_one_value CHECK (
    (CASE WHEN value_text   IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN value_number IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN value_date   IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN value_bool   IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN value_uuid   IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN value_json   IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),

  CONSTRAINT unique_record_field UNIQUE (record_id, field_id)
);

-- Partial indexes for relation/date queries (design §2.2)
CREATE INDEX idx_record_values_uuid ON forms.record_values(field_id, value_uuid)
  WHERE value_uuid IS NOT NULL;
CREATE INDEX idx_record_values_date ON forms.record_values(field_id, value_date)
  WHERE value_date IS NOT NULL;

-- Tenant index on record tables
CREATE INDEX idx_forms_records_tenant ON forms.records(tenant_id);
CREATE INDEX idx_forms_records_template ON forms.records(tenant_id, template_id);
CREATE INDEX idx_forms_record_values_tenant ON forms.record_values(tenant_id);
CREATE INDEX idx_forms_record_values_record ON forms.record_values(record_id);

-- ============================================================
-- ROW-LEVEL SECURITY (tenant tables only — catalog is tenant-less)
-- ============================================================

-- forms.records
ALTER TABLE forms.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms.records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON forms.records
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- forms.record_values
ALTER TABLE forms.record_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms.record_values FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON forms.record_values
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ============================================================
-- GRANTS (app_role)
-- ============================================================

GRANT USAGE ON SCHEMA forms TO app_role;

-- Catalog tables: SELECT only (BC-1 — catalog changes ship as seed migrations)
GRANT SELECT ON forms.templates TO app_role;
GRANT SELECT ON forms.template_sections TO app_role;
GRANT SELECT ON forms.template_fields TO app_role;

-- Tenant tables: full DML (under RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON forms.records TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forms.record_values TO app_role;
