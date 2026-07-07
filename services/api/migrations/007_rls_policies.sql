-- Migration 007: Row-Level Security policies on all 23 base tables
-- RLS keyed to session variable app.tenant_id set via set_config() per request (D-7)
-- A query from tenant-A's session MUST return zero rows from tenant-B's data

-- Enable RLS on all tables (23 base tables across m1..m5)

-- M1 (6 tables)
ALTER TABLE m1.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1.document_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1.document_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE m1.ims_scope ENABLE ROW LEVEL SECURITY;

-- M2 (5 tables)
ALTER TABLE m2.nonconformities ENABLE ROW LEVEL SECURITY;
ALTER TABLE m2.root_cause_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE m2.corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE m2.capa_effectiveness_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE m2.nonconforming_outputs ENABLE ROW LEVEL SECURITY;

-- M3 (5 tables)
ALTER TABLE m3.audit_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE m3.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE m3.audit_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE m3.audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE m3.audit_readiness_scores ENABLE ROW LEVEL SECURITY;

-- M4 (4 tables)
ALTER TABLE m4.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE m4.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE m4.measuring_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE m4.calibration_records ENABLE ROW LEVEL SECURITY;

-- M5 (3 tables)
ALTER TABLE m5.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE m5.risk_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE m5.change_plans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (same pattern for all: tenant_id = current_setting('app.tenant_id'))
-- Policy applies to ALL operations (SELECT, INSERT, UPDATE, DELETE)

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('m1', 'm2', 'm3', 'm4', 'm5')
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I.%I
       FOR ALL
       USING (tenant_id = current_setting(''app.tenant_id'', true))
       WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tbl.schemaname, tbl.tablename
    );
  END LOOP;
END $$;

-- Force RLS for table owners too (defense in depth — even the migration role
-- cannot bypass RLS after this; only superuser can)
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('m1', 'm2', 'm3', 'm4', 'm5')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      tbl.schemaname, tbl.tablename
    );
  END LOOP;
END $$;
