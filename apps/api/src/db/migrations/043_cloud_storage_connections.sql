-- Migration 043: Cloud "Connected Apps" — Box / Dropbox / Mega sync plugins (framework only, sync is mocked)

CREATE TABLE IF NOT EXISTS cloud_storage_connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider       VARCHAR(20) NOT NULL CHECK (provider IN ('box','dropbox','mega')),
  status         VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected')),
  account_label  VARCHAR(200),
  auto_sync      BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at   TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_cloud_storage_connections_tenant ON cloud_storage_connections(tenant_id);
