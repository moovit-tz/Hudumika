-- Persist ESB top-up checkout requests so verification can prove
-- the payment was initiated by this tenant.  Without this table a
-- crafted tx_ref could credit the wrong wallet.

CREATE TABLE IF NOT EXISTS esb_checkout_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id   UUID NOT NULL REFERENCES esb_wallets(id) ON DELETE CASCADE,
  tx_ref      TEXT NOT NULL,
  amount      NUMERIC(15,2) NOT NULL,
  currency    VARCHAR(5) NOT NULL DEFAULT 'TZS',
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','completed','expired','failed')),
  initiated_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- One pending checkout per tx_ref (prevents reuse of a ref for a
-- different amount or tenant).
CREATE UNIQUE INDEX IF NOT EXISTS idx_esb_checkout_txref
  ON esb_checkout_requests (tx_ref);

CREATE INDEX IF NOT EXISTS idx_esb_checkout_tenant
  ON esb_checkout_requests (tenant_id, status)
  WHERE status = 'pending';

ALTER TABLE esb_checkout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE esb_checkout_requests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'esb_checkout_requests'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON esb_checkout_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
