-- Accounting Integrations Schema

CREATE TABLE IF NOT EXISTS accounting_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  provider      VARCHAR(20) NOT NULL CHECK (provider IN ('XERO','SAGE','QUICKBOOKS','TALLY')),
  status        VARCHAR(20) DEFAULT 'DISCONNECTED' CHECK (status IN ('CONNECTED','DISCONNECTED','ERROR')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS accounting_sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  provider      VARCHAR(20) NOT NULL,
  entity_type   VARCHAR(30) NOT NULL CHECK (entity_type IN ('COA','INVOICE','BILL','PAYMENT')),
  entity_id     UUID NOT NULL,
  external_id   VARCHAR(100),
  status        VARCHAR(10) NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  error_message TEXT,
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);
