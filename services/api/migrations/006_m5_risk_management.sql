-- Migration 006: M5 Risk Management tables (module-spec entity names govern)
-- 3 base tables: risks, risk_treatments, change_plans

CREATE TABLE m5.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  category TEXT NOT NULL CHECK (category IN ('quality', 'environmental', 'ohs', 'opportunity')),
  source_ref TEXT,
  description TEXT NOT NULL,
  likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  risk_rating INTEGER NOT NULL GENERATED ALWAYS AS (likelihood * severity) STORED,
  treatment TEXT,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m5.risk_treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES m5.risks(id),
  tenant_id TEXT NOT NULL,
  action_desc TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m5.change_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  change_desc TEXT NOT NULL,
  impact_assessment TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_m5_risks_tenant ON m5.risks(tenant_id);
CREATE INDEX idx_m5_risks_tenant_rating ON m5.risks(tenant_id, risk_rating DESC);
CREATE INDEX idx_m5_risk_treatments_tenant ON m5.risk_treatments(tenant_id);
CREATE INDEX idx_m5_change_plans_tenant ON m5.change_plans(tenant_id);
