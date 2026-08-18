-- RLS hardening, phase 2 (security checklist #4). Two new, restricted
-- Postgres roles — both dormant today, nothing in the app connects through
-- either of them yet. The cutover (a later migration adds FORCE ROW LEVEL
-- SECURITY and the app's connection string switches to hudumika_app) only
-- happens once every real tenant-scoped query in the codebase has been
-- verified to route through withTenant().
--
--   hudumika_app      — the app's real day-to-day connection once cutover
--                        happens. Ordinary read/write, explicitly NOT a
--                        superuser and NOT BYPASSRLS, so FORCE ROW LEVEL
--                        SECURITY (added at cutover) actually constrains
--                        it — unlike the current superuser connection,
--                        which bypasses RLS unconditionally regardless of
--                        policy.
--   hudumika_platform — a narrow, explicitly-audited exception for the
--                        small, confirmed set of SUPER_ADMIN-gated /
--                        genuinely cross-tenant call sites (SuperAdmin
--                        console, tenant management & reports, platform
--                        settings, lens, reference data, and the two
--                        pre-tenant auth lookups in middleware/auth.ts)
--                        that legitimately need to read/write across
--                        tenant boundaries. Used only by that explicit
--                        file list — never by anything handling ordinary
--                        tenant traffic.
--
-- Both modeled on hudumika_readonly's existing shape
-- (084_readonly_role.sql), extended with write access and (for
-- hudumika_platform only) BYPASSRLS. Dev-default passwords below, same as
-- hudumika_readonly's — rotate for any non-local deployment via
-- DATABASE_URL_APP / DATABASE_URL_PLATFORM rather than relying on these.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hudumika_app') THEN
    CREATE ROLE hudumika_app LOGIN PASSWORD 'hudumika_app_pass' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hudumika_platform') THEN
    CREATE ROLE hudumika_platform LOGIN PASSWORD 'hudumika_platform_pass' NOSUPERUSER BYPASSRLS;
  END IF;
END
$$;

DO $$
DECLARE
  dbname text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hudumika_app', dbname);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hudumika_platform', dbname);
END
$$;

-- hudumika_app
GRANT USAGE ON SCHEMA public TO hudumika_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hudumika_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hudumika_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hudumika_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hudumika_app;

-- hudumika_platform
GRANT USAGE ON SCHEMA public TO hudumika_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hudumika_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hudumika_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hudumika_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hudumika_platform;
