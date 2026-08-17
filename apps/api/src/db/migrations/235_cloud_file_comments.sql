-- 235_cloud_file_comments.sql
-- File comments — a flat, timestamped note log per Cloud file, the same
-- shape as shipment_notes (migration 017): tenant-scoped, author-gated
-- edit/delete, no channel/direction/external_ref fields since this is an
-- internal note log, not customer-facing chat (see support_messages for
-- that shape instead).
CREATE TABLE IF NOT EXISTS cloud_file_comments (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id     UUID         NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  author_id   VARCHAR(255) NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_file_comments_file   ON cloud_file_comments(file_id);
CREATE INDEX IF NOT EXISTS idx_cloud_file_comments_tenant ON cloud_file_comments(tenant_id);
