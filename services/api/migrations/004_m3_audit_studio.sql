-- Migration 004: M3 Audit Studio tables (module-spec entity names govern)
-- 5 tables: audit_programmes, audits, audit_checklists, audit_findings, audit_readiness_scores

CREATE TABLE m3.audit_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  year INTEGER NOT NULL,
  frequency_plan TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m3.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES m3.audit_programmes(id),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  scope TEXT NOT NULL,
  lead_auditor_id TEXT NOT NULL,
  planned_date TIMESTAMPTZ NOT NULL,
  actual_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m3.audit_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES m3.audits(id),
  tenant_id TEXT NOT NULL,
  clause_ref TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m3.audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES m3.audits(id),
  tenant_id TEXT NOT NULL,
  checklist_id UUID REFERENCES m3.audit_checklists(id),
  finding_type TEXT NOT NULL CHECK (finding_type IN ('major_nc', 'minor_nc', 'observation', 'ofi')),
  clause_ref TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m3.audit_readiness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  clause_ref TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_m3_audit_programmes_tenant ON m3.audit_programmes(tenant_id);
CREATE INDEX idx_m3_audits_tenant ON m3.audits(tenant_id);
CREATE INDEX idx_m3_audit_findings_tenant ON m3.audit_findings(tenant_id);
