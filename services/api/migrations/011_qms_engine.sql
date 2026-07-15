-- Migration 011: QMS Document Engine (spec 40, design §2)
-- Schema: qms (tenant-less clause registry + tenant org-profile/generation tables)
-- Also carries BC-6: m4.records CHECK += 'IMS'; m1.document_versions += content_sha256.
--
-- BC-1: clause registry stores clause numbers + titles (factual references) and
--       architect-authored paraphrased intent. NO verbatim ISO text, no "shall".
-- BC-7: registry integrity is asserted over PARSED clause numbers (test), never a line count.
-- Ordering note: ships in the same deploy wave as 012/013 (forms) + 014 (registry seed).

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS qms;

-- ============================================================
-- CLAUSE REGISTRY (tenant-less reference data; SELECT-only for app_role)
-- ============================================================

CREATE TABLE qms.clause_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  clause_no TEXT NOT NULL,
  clause_title TEXT NOT NULL,
  intent_paraphrase TEXT NOT NULL,
  annex_sl_mode TEXT NOT NULL CHECK (annex_sl_mode IN ('shared', 'forked', 'standard_only')),
  harmonization_key TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('manual', 'procedure', 'work_instruction', 'policy', 'scope')),
  required_sources JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL,

  CONSTRAINT unique_standard_clause UNIQUE (standard, clause_no)
);

CREATE INDEX idx_qms_registry_harmonization ON qms.clause_registry(harmonization_key);
CREATE INDEX idx_qms_registry_standard ON qms.clause_registry(standard, sort_order);

-- ============================================================
-- ORG PROFILE (tenant; versioned JSONB payload — design §2.2)
-- ============================================================

CREATE TABLE qms.org_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT unique_tenant_profile UNIQUE (tenant_id)
);

CREATE TABLE qms.org_profile_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES qms.org_profiles(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,

  CONSTRAINT unique_profile_version UNIQUE (profile_id, version_no)
);

-- ============================================================
-- CLAUSE APPLICABILITY (tenant; exclusion requires justification — ORG-4)
-- ============================================================

CREATE TABLE qms.clause_applicability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  clause_registry_id UUID NOT NULL REFERENCES qms.clause_registry(id),
  applicable BOOLEAN NOT NULL,
  justification TEXT NULL,
  decided_by TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  -- A clause cannot be excluded silently
  CONSTRAINT exclusion_requires_justification CHECK (applicable OR justification IS NOT NULL),
  CONSTRAINT unique_tenant_clause UNIQUE (tenant_id, clause_registry_id)
);

-- ============================================================
-- GENERATION RUNS + SECTIONS (tenant; idempotency spine — design §2.4)
-- ============================================================

CREATE TABLE qms.generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  sfn_execution_arn TEXT NULL,
  profile_version INTEGER NOT NULL,
  standards TEXT[] NOT NULL CHECK (standards <@ ARRAY['ISO9001','ISO14001','ISO45001']::TEXT[]),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'failed', 'partial')),
  manual_document_id UUID NULL,
  requested_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE qms.generation_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES qms.generation_runs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  harmonization_key TEXT NOT NULL,
  clause_registry_ids UUID[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'prose', 'gap', 'na_justified', 'failed')),
  content_s3_key TEXT NULL,
  content_sha256 TEXT NULL,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  -- GEN-5 idempotency spine: a retried Map iteration conflicts here and skips
  CONSTRAINT unique_run_section UNIQUE (run_id, harmonization_key)
);

CREATE INDEX idx_qms_sections_run ON qms.generation_sections(run_id, status);

-- ============================================================
-- ASSERTION LEDGER (tenant; BC-4 — append-only for app_role)
-- ============================================================

CREATE TABLE qms.assertion_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  section_id UUID NOT NULL REFERENCES qms.generation_sections(id) ON DELETE CASCADE,
  sentence_idx INTEGER NOT NULL,
  sentence_sha256 TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_source TEXT NOT NULL,
  fact_value_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_qms_ledger_section ON qms.assertion_ledger(section_id, sentence_idx);
CREATE INDEX idx_qms_ledger_tenant ON qms.assertion_ledger(tenant_id);

-- ============================================================
-- BC-6: IMS becomes first-class on m4.records
-- (m1.documents already accepts 'IMS' — migration 002)
-- ============================================================

ALTER TABLE m4.records DROP CONSTRAINT IF EXISTS records_standard_check;
ALTER TABLE m4.records ADD CONSTRAINT records_standard_check
  CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001', 'IMS'));

-- ============================================================
-- BC-8: content becomes real on m1.document_versions
-- ============================================================

ALTER TABLE m1.document_versions ADD COLUMN IF NOT EXISTS content_sha256 TEXT NULL;

-- ============================================================
-- ROW-LEVEL SECURITY (tenant tables only — clause_registry is tenant-less)
-- ============================================================

ALTER TABLE qms.org_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms.org_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms.org_profiles
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE qms.org_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms.org_profile_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms.org_profile_versions
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE qms.clause_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms.clause_applicability FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms.clause_applicability
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE qms.generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms.generation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms.generation_runs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE qms.generation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms.generation_sections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms.generation_sections
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE qms.assertion_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms.assertion_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms.assertion_ledger
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ============================================================
-- GRANTS (app_role)
-- ============================================================

GRANT USAGE ON SCHEMA qms TO app_role;

-- Clause registry: SELECT only (reference data; changes ship as migrations)
GRANT SELECT ON qms.clause_registry TO app_role;

-- Tenant tables: full DML under RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON qms.org_profiles TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON qms.org_profile_versions TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON qms.clause_applicability TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON qms.generation_runs TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON qms.generation_sections TO app_role;

-- Assertion ledger: append-only for app_role (SELECT + INSERT; no UPDATE/DELETE —
-- the ledger is the BC-4 evidence trail and must not be editable by the app path)
GRANT SELECT, INSERT ON qms.assertion_ledger TO app_role;
