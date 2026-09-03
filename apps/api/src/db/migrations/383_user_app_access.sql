-- Per-seat license assignment: today's entitlement system (checkEntitlement,
-- /v1/entitlements) only ever answers "is this app enabled for the TENANT" —
-- there is no way to restrict a tenant-enabled app to specific people, the
-- actual Google-Workspace-Admin-style feature this backs. Purely additive:
-- a row here only ever means anything for an app the tenant has explicitly
-- put into "restricted" mode (tenant_settings.settings['restricted-apps']);
-- every app stays exactly as open as it is today unless an admin opts it in.
CREATE TABLE IF NOT EXISTS user_app_access (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id     TEXT NOT NULL,
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, app_id)
);
CREATE INDEX IF NOT EXISTS idx_user_app_access_lookup ON user_app_access(tenant_id, user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_user_app_access_by_app ON user_app_access(tenant_id, app_id);

ALTER TABLE user_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_app_access FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'user_app_access'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON user_app_access
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
