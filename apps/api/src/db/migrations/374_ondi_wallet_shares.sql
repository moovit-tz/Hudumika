-- Ondi feature-gap pass (M3): wallet sharing. The fork's feature-map doc
-- lists "share a vault item with someone else at view- or edit-level,
-- revocable" as a real capability — the integrated ondi_wallet_items table
-- (migration 368) was strictly single-owner, no share/grant columns at all.
-- This is that missing piece: not a second encryption scheme (still the
-- same server-side AES-256-GCM secret_cipher on the owner's row, see
-- security.routes.ts's wallet routes), just a real ACL row saying who else
-- may read (or read+write) it.
CREATE TABLE IF NOT EXISTS ondi_wallet_shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id          UUID NOT NULL REFERENCES ondi_wallet_items(id) ON DELETE CASCADE,
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission       TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ
);
-- One active grant per (item, grantee) — re-sharing after a revoke inserts a
-- fresh row rather than reusing the old one, same "revoke-then-re-enable
-- creates a fresh row" property the M9 integrations table already uses.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ondi_wallet_shares_active_grant
  ON ondi_wallet_shares(item_id, grantee_user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ondi_wallet_shares_grantee ON ondi_wallet_shares(tenant_id, grantee_user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ondi_wallet_shares_item ON ondi_wallet_shares(item_id) WHERE revoked_at IS NULL;

ALTER TABLE ondi_wallet_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_wallet_shares FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_wallet_shares'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_wallet_shares
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
