-- Ondi M7 (house-style expansion): a visible log for the two real
-- joiner/leaver automation hooks this milestone adds — not a generic
-- workflow engine (the platform already has one, Studio; this is two
-- specific, hardcoded reactions to domain events already emitted
-- elsewhere: user.joined on invitation-accept, hr.staff_deactivated on
-- deactivation). The rule's own configuration (which role joiners get)
-- lives in tenant_settings.settings.automation, matching sessionPolicy's
-- existing pattern — this table is just a record of what automation
-- actually did, for an admin to audit.
CREATE TABLE IF NOT EXISTS ondi_automation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule        TEXT NOT NULL CHECK (rule IN ('joiner_default_role', 'leaver_revoke_access')),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_automation_log_tenant ON ondi_automation_log(tenant_id, created_at DESC);

ALTER TABLE ondi_automation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_automation_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_automation_log'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_automation_log
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
