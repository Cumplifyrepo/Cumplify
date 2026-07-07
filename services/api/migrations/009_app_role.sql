-- Migration 009: CREATE app_role + GRANT DML + EXECUTE (C-1 remediation)
-- Resolvers connect as app_role (via dedicated secret), NOT as master.
-- app_role is NOT the object owner → RLS applies (FORCE RLS active on all tables).
-- Master secret reserved for migrator (DDL/ownership).

-- Create the app_role if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Grant USAGE on all module schemas
GRANT USAGE ON SCHEMA m1 TO app_role;
GRANT USAGE ON SCHEMA m2 TO app_role;
GRANT USAGE ON SCHEMA m3 TO app_role;
GRANT USAGE ON SCHEMA m4 TO app_role;
GRANT USAGE ON SCHEMA m5 TO app_role;
GRANT USAGE ON SCHEMA m5_views TO app_role;

-- Grant DML (SELECT, INSERT, UPDATE, DELETE) on all 23 base tables
-- M1 (6 tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON m1.documents TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m1.document_versions TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m1.document_approvals TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m1.document_distribution TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m1.policies TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m1.ims_scope TO app_role;

-- M2 (5 tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON m2.nonconformities TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m2.root_cause_analyses TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m2.corrective_actions TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m2.capa_effectiveness_checks TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m2.nonconforming_outputs TO app_role;

-- M3 (5 tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON m3.audit_programmes TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m3.audits TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m3.audit_checklists TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m3.audit_findings TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m3.audit_readiness_scores TO app_role;

-- M4 (4 tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON m4.records TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m4.retention_policies TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m4.measuring_resources TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m4.calibration_records TO app_role;

-- M5 (3 tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON m5.risks TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m5.risk_treatments TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON m5.change_plans TO app_role;

-- Matview: REVOKE direct SELECT, GRANT only EXECUTE on accessor function
REVOKE ALL ON m5_views.risk_register_view FROM app_role;
GRANT EXECUTE ON FUNCTION m5_views.get_risk_register_view() TO app_role;

-- Grant read on _migrations (for health checks) but not write
GRANT SELECT ON public._migrations TO app_role;
