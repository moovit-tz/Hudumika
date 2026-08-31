-- Real, API-linked presence for the three-state status dot (grey=offline,
-- yellow=online-but-clocked-out, green=clocked-in) — one row per user,
-- refreshed by a periodic heartbeat from every signed-in tab (useAuth.tsx)
-- rather than a WebSocket presence channel, since none exists platform-wide
-- yet. "Clocked in" itself is derived at read time from the existing
-- hr_clock_sessions table (367's presence.routes.ts) — this table only ever
-- needs to answer "is this browser session still alive".
CREATE TABLE IF NOT EXISTS user_presence (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_presence_tenant ON user_presence(tenant_id);

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'user_presence'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON user_presence
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
