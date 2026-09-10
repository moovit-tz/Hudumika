-- Production-readiness audit HUD-0001 follow-up, found only by the HUD-0006
-- CI pipeline's fresh-database run (not visible scanning the live database):
-- compliance_marketplace_requests (093_compliance_marketplace_requests.sql)
-- is a real tenant_id-NOT-NULL-REFERENCES-tenants table, created with no RLS
-- at all. It doesn't exist on the live dev database today (dropped outside
-- the migration system at some point — see HUD-0019), which is exactly why
-- the earlier pg_class-driven scan (migration 456) never saw it: that scan
-- can only find gaps in the database it's run against. Any fresh install —
-- or the day this table's real feature (Trade-Wizard "post this requirement
-- to a compliance marketplace") gets finished and reintroduced on live —
-- would otherwise ship it unprotected on day one.
--
-- Guarded with IF EXISTS / a DO block so this is a safe no-op everywhere the
-- table is absent (the live database today) and a real fix everywhere it
-- exists (any fresh install, and live again if the feature is ever restored).

ALTER TABLE IF EXISTS compliance_marketplace_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS compliance_marketplace_requests FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'compliance_marketplace_requests') THEN
    DROP POLICY IF EXISTS tenant_isolation_policy ON compliance_marketplace_requests;
    CREATE POLICY tenant_isolation_policy ON compliance_marketplace_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;
