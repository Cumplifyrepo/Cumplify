-- Migration 005: M4 Records Management tables (module-spec entity names govern)
-- 4 tables: records, retention_policies, measuring_resources, calibration_records

CREATE TABLE m4.records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  standard TEXT NOT NULL CHECK (standard IN ('ISO9001', 'ISO14001', 'ISO45001')),
  record_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  retention_class TEXT,
  retain_until TIMESTAMPTZ,
  s3_object_ref TEXT,
  object_lock_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m4.retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  retention_years INTEGER NOT NULL,
  disposition_rule TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m4.measuring_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  asset_tag TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE m4.calibration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measuring_resource_id UUID NOT NULL REFERENCES m4.measuring_resources(id),
  tenant_id TEXT NOT NULL,
  calibrated_at TIMESTAMPTZ NOT NULL,
  next_due TIMESTAMPTZ NOT NULL,
  standard_used TEXT NOT NULL,
  traceability_ref TEXT,
  result TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_m4_records_tenant ON m4.records(tenant_id);
CREATE INDEX idx_m4_calibration_records_tenant ON m4.calibration_records(tenant_id);
CREATE INDEX idx_m4_calibration_records_next_due ON m4.calibration_records(tenant_id, next_due);
