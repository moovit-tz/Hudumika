-- 142_contacts_sync.sql
-- Real Google Contacts (People API) sync + generic CSV/vCard import for
-- "other apps" — Contacts.tsx had no import/sync path of any kind before this.

-- Tracks which external system (if any) a contact came from, and its
-- identifier there, so re-syncing Google updates the same row instead of
-- duplicating it every time. NULL source/external_id = created manually
-- in Hudumika, unaffected by any sync.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- Partial unique index (not a full unique constraint) so manual contacts,
-- which never have an external_id, are never compared against each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_source_external_id
  ON contacts(tenant_id, source, external_id) WHERE external_id IS NOT NULL;

-- One row per (tenant, user, provider) — each staff member connects their
-- own Google account; tokens are that specific connection's, not shared
-- tenant-wide (mirrors how a real person's Google Contacts access works).
CREATE TABLE IF NOT EXISTS contact_sync_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  provider VARCHAR(20) NOT NULL DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  external_account_email VARCHAR(255),
  last_synced_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20),
  last_sync_error TEXT,
  contacts_synced_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_sync_connections_user_provider
  ON contact_sync_connections(tenant_id, user_id, provider);
