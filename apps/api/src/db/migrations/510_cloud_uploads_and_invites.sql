-- Resumable chunked uploads, and "invite by email" for people outside the workspace.

-- ── Upload sessions ────────────────────────────────────────────────────────
-- A session tracks which fixed-size chunks of one announced file the server holds. Chunks themselves
-- live in the object store under tenants/<t>/uploads/<session>/<n> until /complete assembles them
-- and runs the normal upload pipeline (quota, malware scan, drive access, links, audit).
CREATE TABLE IF NOT EXISTS cloud_upload_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drive_id     UUID NOT NULL REFERENCES cloud_drives(id) ON DELETE CASCADE,
  parent_id    UUID,
  filename     TEXT NOT NULL,
  size         BIGINT NOT NULL CHECK (size > 0),
  mime_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
  chunk_bytes  INT NOT NULL,
  received     JSONB NOT NULL DEFAULT '[]'::jsonb,
  entity_type  TEXT,
  entity_id    UUID,
  fingerprint  TEXT,
  status       VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'failed', 'cancelled')),
  file_id      UUID,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_upload_sessions_resume ON cloud_upload_sessions (tenant_id, user_id, fingerprint) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cloud_upload_sessions_expiry ON cloud_upload_sessions (expires_at) WHERE status = 'open';
ALTER TABLE cloud_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_upload_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cloud_upload_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── Email invitations to a single file ────────────────────────────────────
-- For a recipient who has no account here. The link carries an unguessable token; only its SHA-256 is
-- stored. Read-only (view/download of that one file), expires, and can be revoked. Every open is
-- written to the file's access log under the invitee's email.
CREATE TABLE IF NOT EXISTS cloud_file_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id     UUID NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  role        VARCHAR(10) NOT NULL DEFAULT 'Viewer' CHECK (role = 'Viewer'),
  message     TEXT,
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_file_invites_file ON cloud_file_invites (tenant_id, file_id);
ALTER TABLE cloud_file_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_file_invites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cloud_file_invites
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
