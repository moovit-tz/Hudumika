-- RLS retrofit for the three core ledger tables.
--
-- chart_of_accounts, journal_entries and journal_lines (021_finance_gl.sql)
-- have carried zero row-level security since the GL was first built —
-- confirmed via grep of every migration file, and self-documented as a
-- known gap in 256_multi_entity_accounting.sql's trailing comment ("a live
-- financial-table RLS change deserves its own dedicated review"). This is
-- that review. Isolation today is 100% the application's own
-- .where('tenant_id', ...) filtering; this brings these three tables to the
-- same standard every other tenant-scoped table already has (same FORCE
-- rationale as 242_force_row_level_security.sql, same policy idiom as
-- 245_onsite_rls.sql / 256's own accounting_entities policy).
--
-- journal_lines has no tenant_id column of its own (by original design —
-- tenant scoping is transitive via journal_entry_id -> journal_entries).
-- Its policy is therefore an EXISTS against journal_entries rather than a
-- direct column comparison, unlike every other policy in the schema.

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'chart_of_accounts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON chart_of_accounts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'journal_entries'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON journal_entries
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'journal_lines'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON journal_lines
      USING (
        EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.id = journal_lines.journal_entry_id
            AND je.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      );
  END IF;
END $$;
