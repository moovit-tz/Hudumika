-- Contacts app audit: every contacts_* table has zero RLS at the database
-- layer — missed by 242_force_row_level_security.sql (contacts predates it,
-- migration 029, but was never in that bulk pass's table list) and by every
-- later retrofit (296_finops_core_rls.sql, 397_hr_core_rls.sql,
-- 405_bliss_rls_gap.sql) because Contacts was never in any of those audits'
-- scope either. Confirmed live against the dev DB's pg_class, not just the
-- migration source: relrowsecurity/relforcerowsecurity were false on all
-- seven tables below before this migration. Per CLAUDE.md: RLS is a second
-- line of defense, not a substitute for the app-level withTenant() filter
-- (contacts.service.ts already scopes every query on tenant_id) — but every
-- RLS-enabled table must still carry FORCE ROW LEVEL SECURITY plus the
-- standard tenant_isolation_policy.
--
-- Six of the seven carry tenant_id directly and get the standard direct
-- policy. contact_label_mappings is a pure (contact_id, label_id) junction
-- table with no tenant_id column of its own, so its policy scopes through
-- contact_labels via EXISTS instead — same shape as sales_invoice_lines'
-- policy in 296_finops_core_rls.sql.

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contacts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contacts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE contact_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_labels FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_labels'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_labels
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_emails FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_emails'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_emails
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE contact_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_phones FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_phones'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_phones
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE contact_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_activity_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_activity_log'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_activity_log
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE contact_sync_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_sync_connections FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_sync_connections'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_sync_connections
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE contact_label_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_label_mappings FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_label_mappings'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_label_mappings
      USING (EXISTS (
        SELECT 1 FROM contact_labels cl
        WHERE cl.id = contact_label_mappings.label_id
          AND cl.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      ));
  END IF;
END $$;
