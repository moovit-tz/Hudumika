-- Migration 044: add OneDrive as a 4th sync provider, plus a table to hold the
-- (mocked) synced folders/files shown per provider once connected.

ALTER TABLE cloud_storage_connections DROP CONSTRAINT IF EXISTS cloud_storage_connections_provider_check;
ALTER TABLE cloud_storage_connections ADD CONSTRAINT cloud_storage_connections_provider_check
  CHECK (provider IN ('box','dropbox','mega','onedrive'));

CREATE TABLE IF NOT EXISTS cloud_external_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider   VARCHAR(20) NOT NULL CHECK (provider IN ('box','dropbox','mega','onedrive')),
  name       VARCHAR(500) NOT NULL,
  type       VARCHAR(30) NOT NULL DEFAULT 'txt', -- 'folder' or a file extension
  size       BIGINT,
  parent_id  UUID REFERENCES cloud_external_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_external_files_tenant ON cloud_external_files(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_cloud_external_files_parent ON cloud_external_files(tenant_id, provider, parent_id);
