-- Onsite RLS retrofit.
--
-- Every onsite_* table (migration 209 onward) was created with no RLS at
-- all — confirmed live against pg_class: relrowsecurity = false, zero
-- policies, on all 14 tables. This predates and was missed by the platform-
-- wide RLS-hardening project (migrations 240-242), which enabled+forced RLS
-- on every OTHER tenant-scoped table but never touched Onsite's own.
--
-- The application layer has been correctly scoping every onsite query by
-- tenant_id throughout (confirmed via review of onsite.routes.ts and its
-- siblings), so this is not evidence of a leak — but until now Onsite has
-- had no second line of defense at all: a single missed .where('tenant_id',
-- ...) anywhere in this surface would have leaked silently, with nothing in
-- Postgres to catch it. This brings Onsite to the same standard as every
-- other tenant-scoped table in the schema.
--
-- Same policy shape as every other table (e.g. 004_declarations.sql), same
-- FORCE rationale as 242_force_row_level_security.sql (the app connects as
-- a restricted, non-superuser role today, but table ownership defaults to
-- the migration-running superuser, and Postgres exempts an owner from its
-- own RLS unless FORCE is set).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'onsite_projects', 'onsite_domains', 'onsite_dns_zones', 'onsite_dns_records',
    'onsite_applications', 'onsite_environments', 'onsite_secrets', 'onsite_deployments',
    'onsite_servers', 'onsite_provider_connections', 'onsite_health_checks',
    'onsite_health_check_results', 'onsite_ssl_certificates', 'onsite_websites'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
