-- 132_cloud_file_share_token.sql
-- "Copy link" in the Cloud app's Share modal generated a fabricated URL
-- (https://cloud.hudumika.tz/share/:id) that no route anywhere ever
-- served — clicking it just errored. Adds a real per-file token so a
-- generated link can actually resolve to a public (unauthenticated)
-- download endpoint. The token is only set while the file has at least
-- one active share (see files.routes.ts PUT /:id/share) — removing all
-- shares clears it, so a revoked share also invalidates any link that
-- was copied earlier.
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS share_token UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_files_share_token ON cloud_files(share_token) WHERE share_token IS NOT NULL;
