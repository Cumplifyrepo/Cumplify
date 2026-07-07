-- Migration 003: M2 CAPA tables (module-spec entity names govern)
-- 5 tables: nonconformities, root_cause_analyses, corrective_actions, capa_effectiveness_checks, nonconforming_outputs

CREATE TABLE m2.nonconformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  source TEXT NOT NULL CHECK (source IN ('audit', 'incident', 'complaint', 'process')),
  nc_type TEXT NOT NULL CHECK (nc_type IN ('nonconforming_output', 'nc', 'incident')),
  description TEXT NOT NULL,
  clause_ref TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'verified')),
  raised_by TEXT NOT NULL,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m2.root_cause_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id UUID NOT NULL REFERENCES m2.nonconformities(id),
  tenant_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('5why', 'fishbone', 'fta')),
  findings TEXT NOT NULL,
  root_cause_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m2.corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id UUID NOT NULL REFERENCES m2.nonconformities(id),
  tenant_id TEXT NOT NULL,
  action_desc TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'verified')),
  containment_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m2.capa_effectiveness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrective_action_id UUID NOT NULL REFERENCES m2.corrective_actions(id),
  tenant_id TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  effective BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m2.nonconforming_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id UUID NOT NULL REFERENCES m2.nonconformities(id),
  tenant_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('rework', 'scrap', 'concession', 'regrade')),
  authorized_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_m2_nonconformities_tenant ON m2.nonconformities(tenant_id);
CREATE INDEX idx_m2_corrective_actions_tenant ON m2.corrective_actions(tenant_id);
