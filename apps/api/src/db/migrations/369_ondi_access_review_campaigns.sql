-- Ondi M5 (house-style expansion): periodic access-review campaigns.
-- ondi_org_access_requests (365_ondi_break_glass_access.sql) already covers
-- ad-hoc "I need this role" / "approve or deny this one grant" — this adds
-- the other real access-governance workflow: a reviewer periodically
-- sweeping every CURRENT role grant and re-attesting each one is still
-- warranted, not waiting for someone to request something.
--
-- A campaign snapshots every non-expired ondi_org_role_members row at
-- creation time into ondi_access_review_items — role_name is copied in
-- (not just role_id) so a review item still reads sensibly even if the
-- role itself is later renamed or deleted. Deciding "revoked" on an item
-- immediately deletes the underlying ondi_org_role_members row (real
-- effect, not just a record of the decision) — same "the decision does
-- the thing" principle as approving an access request already does.
CREATE TABLE IF NOT EXISTS ondi_access_review_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ondi_access_review_campaigns_tenant ON ondi_access_review_campaigns(tenant_id, created_at DESC);

ALTER TABLE ondi_access_review_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_access_review_campaigns FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_access_review_campaigns'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_access_review_campaigns
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ondi_access_review_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id    UUID NOT NULL REFERENCES ondi_access_review_campaigns(id) ON DELETE CASCADE,
  role_member_id UUID REFERENCES ondi_org_role_members(id) ON DELETE SET NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id        UUID REFERENCES ondi_org_roles(id) ON DELETE SET NULL,
  role_name      TEXT NOT NULL,
  decision       TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'revoked')),
  decided_by     UUID REFERENCES users(id),
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_access_review_items_campaign ON ondi_access_review_items(tenant_id, campaign_id);

ALTER TABLE ondi_access_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_access_review_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_access_review_items'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_access_review_items
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
