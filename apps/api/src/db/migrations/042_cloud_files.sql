-- Migration 042: Cloud / Drive file manager (folders, files, trash, sharing)

CREATE TABLE IF NOT EXISTS cloud_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(500) NOT NULL,
  type         VARCHAR(30)  NOT NULL DEFAULT 'txt', -- 'folder' or a file extension
  size         BIGINT,
  file_count   INTEGER NOT NULL DEFAULT 0,          -- only meaningful when type = 'folder'
  parent_id    UUID REFERENCES cloud_files(id) ON DELETE SET NULL,
  color        VARCHAR(20),
  description  TEXT,
  owner_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_name   VARCHAR(200) NOT NULL DEFAULT 'You',
  starred      BOOLEAN NOT NULL DEFAULT FALSE,
  is_trash     BOOLEAN NOT NULL DEFAULT FALSE,
  trashed_at   TIMESTAMPTZ,
  storage_key  TEXT,        -- null for folders; local-disk key for files (see MinioIntegration)
  mime_type    VARCHAR(150),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_files_tenant ON cloud_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_files_parent ON cloud_files(tenant_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_cloud_files_trash  ON cloud_files(tenant_id, is_trash);

CREATE TABLE IF NOT EXISTS cloud_file_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  person_name VARCHAR(200) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'Viewer' CHECK (role IN ('Viewer','Editor')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id, person_name)
);
CREATE INDEX IF NOT EXISTS idx_cloud_file_shares_file ON cloud_file_shares(file_id);
