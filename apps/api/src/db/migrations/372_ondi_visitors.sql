-- Ondi M9 (house-style expansion, final milestone): front-desk visitor
-- sign-in — the one genuinely new concept of the three this milestone
-- covers. Assets is a real, already-working NexusHR feature (hr_assets/
-- HrAssets.tsx) that Ondi's Enterprise nav just links out to rather than
-- duplicating; Integrations governs tenant_marketplace_installs (migration
-- 156), which already exists — this table is the only new schema M9 needs.
CREATE TABLE IF NOT EXISTS ondi_visitors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  company        TEXT,
  purpose        TEXT,
  host_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  badge_code     TEXT NOT NULL,
  checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_visitors_tenant ON ondi_visitors(tenant_id, checked_in_at DESC);

ALTER TABLE ondi_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_visitors FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_visitors'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_visitors
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
