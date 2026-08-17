-- 236_cloud_file_versions.sql
-- Explicit version history for a Cloud file. No existing precedent in this
-- codebase to mirror — a new capability. Deliberately NOT automatic on a
-- same-name re-upload (POST /upload always inserts a new sibling row on a
-- name collision today; changing that silently would alter existing upload
-- behavior for every caller of that route). Instead this is populated only
-- by the explicit "Upload new version" / "Restore" actions on files.
-- routes.ts, which push the file's about-to-be-replaced storage_key/size/
-- mime_type in here before overwriting cloud_files — so a restore is always
-- symmetric with an upload.
CREATE TABLE IF NOT EXISTS cloud_file_versions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id          UUID         NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  storage_key      TEXT         NOT NULL,
  size             BIGINT,
  mime_type        VARCHAR(150),
  uploaded_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name VARCHAR(200) NOT NULL DEFAULT 'You',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_file_versions_file ON cloud_file_versions(file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_file_versions_tenant ON cloud_file_versions(tenant_id);
