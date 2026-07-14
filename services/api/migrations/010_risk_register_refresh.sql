-- Migration 010: risk_register_view refresh accessor (follow-up to 008)
-- 008's own comment flagged this as unwired: "matview refresh is unwired.
-- Wire event-driven REFRESH (triggered by Risk.Created / Risk.Escalated /
-- Risk.TreatmentAdded events) ... Dashboard will show stale data until wired."
--
-- app_role is deliberately REVOKE-ALL'd on the view (migration 009) as part
-- of the SECURITY DEFINER isolation design (§6.4) — it cannot REFRESH the
-- view directly (REFRESH requires ownership; there's no separate grantable
-- REFRESH privilege in Postgres). Matches the existing get_risk_register_view()
-- read-accessor pattern: a narrow SECURITY DEFINER function, owned by the
-- view's owner, that performs exactly one privileged action and nothing else.

CREATE OR REPLACE FUNCTION m5_views.refresh_risk_register_view()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = m5_views, m5, pg_temp
AS $$
BEGIN
  EXECUTE 'REFRESH MATERIALIZED VIEW m5_views.risk_register_view';
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION m5_views.refresh_risk_register_view() TO app_role';
  END IF;
END $$;
