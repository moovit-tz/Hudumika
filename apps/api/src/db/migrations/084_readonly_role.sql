-- Dedicated read-only Postgres role for the Query Builder's raw-SQL mode.
-- This is the real backstop for "read-only" — even if the application-layer
-- keyword/statement checks in queryBuilder.service.ts were somehow bypassed,
-- Postgres itself rejects any write/DDL under this role. Dev default
-- password below — rotate it for any non-local deployment (set
-- DATABASE_URL_READONLY in the environment instead of relying on this).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hudumika_readonly') THEN
    CREATE ROLE hudumika_readonly LOGIN PASSWORD 'hudumika_readonly_pass';
  END IF;
END
$$;

DO $$
DECLARE
  dbname text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hudumika_readonly', dbname);
END
$$;

GRANT USAGE ON SCHEMA public TO hudumika_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hudumika_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hudumika_readonly;
ALTER ROLE hudumika_readonly SET statement_timeout = '10s';
