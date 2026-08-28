-- hr_calls (migration 226) shipped with no RLS at all — a real gap, not a
-- style nit (CLAUDE.md): every RLS-enabled table must carry FORCE ROW LEVEL
-- SECURITY plus the standard tenant_isolation_policy. Found while building
-- group meetings on top of this same call-history table.

ALTER TABLE hr_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_calls FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_calls'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_calls
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
