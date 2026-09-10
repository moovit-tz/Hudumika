-- Drive ("cloud") app hardening pass. Four things, one migration:
--
--  1. RLS on all 8 cloud_* tables. Confirmed live against pg_class before
--     writing this — relrowsecurity / relforcerowsecurity were false and
--     zero policies existed on every one of them. Missed by
--     242_force_row_level_security.sql (cloud_files is migration 042, older
--     than that bulk pass but never in its list) and by every later retrofit
--     (245_onsite_rls, 285_tasks_calendar_rls, 296_finops_core_rls,
--     397_hr_core_rls, 405_bliss_rls_gap, 440_contacts_rls_gap) because
--     Drive was never in any of those audits' scope. Same reasoning as
--     440_contacts_rls_gap: files.routes.ts / drives.routes.ts already scope
--     every query on tenant_id, but per CLAUDE.md RLS is the mandatory
--     second line of defence and every RLS table must also carry FORCE.
--
--     Six tables carry tenant_id directly. cloud_file_shares and
--     cloud_drive_members did not — they get a real tenant_id column
--     (backfilled from their parent, then NOT NULL), rather than an EXISTS
--     policy through the parent, so the app can also filter them directly
--     and a future orphaned row can't sit outside any tenant. Same shape as
--     245_onsite_rls's column-adding retrofit.
--
--  2. Full-text file search. cloud_files.search_text holds extracted text
--     content (populated by the upload path for text/csv/md/json + PDF);
--     search_tsv is a stored generated tsvector over name + that text, with
--     a GIN index. GET /v1/files?q= was previously name ILIKE '%q%' only.
--
--  3. Per-file access audit. cloud_file_access_log records every
--     download / preview / version-download / public-link fetch, so "who
--     opened this and when" is answerable — the domain-event stream only
--     ever recorded writes (upload/rename/version), never reads.
--
--  4. Real third-party connector credentials. cloud_storage_connections
--     gains the per-tenant BYO-OAuth columns (client id + encrypted secret,
--     encrypted access/refresh tokens, expiry, account email) that the
--     OneDrive / Dropbox sync in files.routes.ts needs — same pattern as
--     contact_sync_connections for the Google/Outlook contact sync.

-- ─────────────────────────────────────────────────────────────────────────
-- 1a. tenant_id on the two junction tables that lacked it
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE cloud_file_shares ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE cloud_file_shares s
   SET tenant_id = f.tenant_id
  FROM cloud_files f
 WHERE f.id = s.file_id AND s.tenant_id IS NULL;
-- Any share whose parent file is already gone is dead weight — drop it so
-- the NOT NULL below can't fail on it.
DELETE FROM cloud_file_shares WHERE tenant_id IS NULL;
ALTER TABLE cloud_file_shares ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cloud_file_shares_tenant ON cloud_file_shares(tenant_id);

ALTER TABLE cloud_drive_members ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE cloud_drive_members m
   SET tenant_id = d.tenant_id
  FROM cloud_drives d
 WHERE d.id = m.drive_id AND m.tenant_id IS NULL;
DELETE FROM cloud_drive_members WHERE tenant_id IS NULL;
ALTER TABLE cloud_drive_members ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cloud_drive_members_tenant ON cloud_drive_members(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 1b. RLS enable + FORCE + standard tenant_isolation_policy on all 8
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cloud_files', 'cloud_file_shares', 'cloud_file_comments', 'cloud_file_versions',
    'cloud_drives', 'cloud_drive_members', 'cloud_storage_connections', 'cloud_external_files'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Full-text search on cloud_files
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS search_text TEXT;
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(search_text, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_cloud_files_search_tsv ON cloud_files USING GIN (search_tsv);
-- Trigram index so the ILIKE fallback (short queries, partial words) stays fast too.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_cloud_files_name_trgm ON cloud_files USING GIN (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Per-file access log
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cloud_file_access_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id     UUID NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  version_id  UUID REFERENCES cloud_file_versions(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = anonymous public share-link fetch
  actor_name  VARCHAR(255) NOT NULL DEFAULT 'Someone',
  action      VARCHAR(20)  NOT NULL,                          -- 'download' | 'preview' | 'version_download' | 'link_download'
  via         VARCHAR(20)  NOT NULL DEFAULT 'app',            -- 'app' | 'public_link'
  ip          VARCHAR(64),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_file_access_log_file   ON cloud_file_access_log(file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_file_access_log_tenant ON cloud_file_access_log(tenant_id, created_at DESC);

ALTER TABLE cloud_file_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_file_access_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'cloud_file_access_log'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON cloud_file_access_log
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. BYO-OAuth credential columns for real Box/Dropbox/OneDrive connectors
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS oauth_client_id        TEXT;
ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS oauth_client_secret_enc TEXT;
ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS access_token_enc       TEXT;
ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS refresh_token_enc      TEXT;
ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS token_expires_at       TIMESTAMPTZ;
ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS account_email          VARCHAR(255);
ALTER TABLE cloud_storage_connections ADD COLUMN IF NOT EXISTS last_sync_error        TEXT;

-- cloud_external_files gains the provider's own id + a direct download ref
-- so a synced listing can later be opened, not just counted.
ALTER TABLE cloud_external_files ADD COLUMN IF NOT EXISTS external_id  TEXT;
ALTER TABLE cloud_external_files ADD COLUMN IF NOT EXISTS web_url      TEXT;
ALTER TABLE cloud_external_files ADD COLUMN IF NOT EXISTS path         TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_external_files_provider_ext
  ON cloud_external_files(tenant_id, provider, external_id) WHERE external_id IS NOT NULL;
