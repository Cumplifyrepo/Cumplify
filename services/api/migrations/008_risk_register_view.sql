-- Migration 008: risk_register_view materialized view + SECURITY DEFINER accessor (D-6/FF-5)
-- RLS cannot be applied to materialized views.
-- Design: SECURITY DEFINER function filters by app.tenant_id; app role has EXECUTE only.

-- Cross-standard risk register rollup (materialized for dashboard performance)
CREATE MATERIALIZED VIEW m5_views.risk_register_view AS
SELECT
  r.id,
  r.tenant_id,
  r.standard,
  r.category,
  r.description,
  r.likelihood,
  r.severity,
  r.risk_rating,
  r.treatment,
  r.owner_id,
  r.status,
  r.source_ref,
  r.created_at,
  r.updated_at
FROM m5.risks r
WHERE r.status != 'closed'
WITH NO DATA;

-- Refresh on first creation (empty until data exists)
-- Future: refresh triggered by Risk.* events or scheduled
REFRESH MATERIALIZED VIEW m5_views.risk_register_view;

-- Index for tenant-filtered queries via the accessor function
CREATE INDEX idx_risk_register_view_tenant ON m5_views.risk_register_view(tenant_id);

-- SECURITY DEFINER accessor function (design §6.4, corrected per D-6/FF-6)
-- Owner (migration role) retains SELECT on the matview.
-- Hardened: SET search_path prevents search_path injection.
-- WHERE tenant_id = current_setting('app.tenant_id') enforces isolation.
CREATE OR REPLACE FUNCTION m5_views.get_risk_register_view()
RETURNS SETOF m5_views.risk_register_view
LANGUAGE sql
SECURITY DEFINER
SET search_path = m5_views, m5, pg_temp
AS $$
  SELECT * FROM m5_views.risk_register_view
  WHERE tenant_id = current_setting('app.tenant_id');
$$;

-- Revoke direct access from app role; grant only EXECUTE on the function.
-- The app_role name is set during deployment (parameterized in migrator).
-- For now, use a DO block that gracefully handles the role not existing yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    EXECUTE 'REVOKE ALL ON m5_views.risk_register_view FROM app_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION m5_views.get_risk_register_view() TO app_role';
  END IF;
END $$;
