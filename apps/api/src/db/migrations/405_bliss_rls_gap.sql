-- Bliss module audit: 6 tables had zero RLS at the database layer, missed by
-- every prior retrofit pass (349_hr_calls_rls.sql, 353_chat_rls.sql,
-- 242_force_row_level_security.sql) because they were never in the earlier
-- audits' scope. Every one of the six carries tenant_id directly, so each
-- gets the standard direct policy — no joins needed. Per CLAUDE.md: RLS is a
-- second line of defense, not a substitute for the app-level withTenant()
-- filter, but every RLS-enabled table must still carry FORCE ROW LEVEL
-- SECURITY plus the standard tenant_isolation_policy.
--
-- platform_support_tickets/messages/attachments are also read cross-tenant by
-- Hudumika's own platform staff via the separate dbPlatform connection
-- (platform-support.routes.ts) — that connection bypasses RLS by design (the
-- documented platform/cross-tenant carve-out), so FORCE RLS here only closes
-- the gap for the restricted app role, exactly as intended.

ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'kb_categories'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON kb_categories
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE live_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_chat_sessions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'live_chat_sessions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON live_chat_sessions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE live_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_chat_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'live_chat_messages'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON live_chat_messages
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE platform_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_support_tickets FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'platform_support_tickets'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON platform_support_tickets
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE platform_support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_support_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'platform_support_messages'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON platform_support_messages
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE platform_support_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_support_attachments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'platform_support_attachments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON platform_support_attachments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
