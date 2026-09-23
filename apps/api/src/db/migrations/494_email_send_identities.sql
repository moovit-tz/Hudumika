-- 494_email_send_identities.sql
-- Migration 491 gave each user exactly ONE configurable send identity
-- directly on user_email_accounts. Gmail's own "Send mail as" is a genuine
-- list — several named aliases, one marked default, an independent
-- reply-from-same-address-it-arrived-at option. This adds that list as its
-- own table (same reasoning email_signatures was split out for) rather than
-- reworking the single-identity columns migration 491 already wired end to
-- end through mail-oauth.routes.ts and EmailIntegration.sendEmail — those
-- stay exactly as they are and now act as the implicit first/fallback
-- identity when nothing here is marked default.
--
-- Scope note: aliases created here are SMTP-only for now (send_protocol
-- 'platform' | 'smtp') — a second/third OAuth-connected alias would need
-- mail-oauth.routes.ts's authorize-personal/callback flow to target a
-- specific identity row instead of always writing to user_email_accounts,
-- which is a real follow-up, not done in this pass. The columns exist here
-- so that follow-up is additive (no migration needed) when it happens.

CREATE TABLE IF NOT EXISTS email_send_identities (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_name                VARCHAR(255),
  from_email               VARCHAR(255) NOT NULL,
  send_protocol            VARCHAR(10) NOT NULL DEFAULT 'smtp', -- 'smtp' | 'outlook' | 'gmail' (never 'platform' here — that's the fallback identity, not a row)
  smtp_host                VARCHAR(255),
  smtp_port                INT NOT NULL DEFAULT 587,
  smtp_user                VARCHAR(255),
  smtp_pass                TEXT, -- encrypted at rest, same cipher as every other *_pass in this schema
  smtp_encryption          VARCHAR(10) NOT NULL DEFAULT 'ssl',
  outlook_access_token     TEXT,
  outlook_refresh_token    TEXT,
  outlook_token_expires_at TIMESTAMPTZ,
  outlook_status           VARCHAR(20),
  gmail_access_token       TEXT,
  gmail_refresh_token      TEXT,
  gmail_token_expires_at   TIMESTAMPTZ,
  gmail_status             VARCHAR(20),
  is_default               BOOLEAN NOT NULL DEFAULT false,
  -- 'same_as_received': a reply/forward uses whichever of the user's own
  -- addresses the original message was actually sent to, when that's one of
  -- their aliases — 'always_default' means every send uses is_default
  -- regardless. Read by email.routes.ts's reply path, not yet by this
  -- migration's own table.
  reply_behavior           VARCHAR(20) NOT NULL DEFAULT 'same_as_received',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_send_identities_user ON email_send_identities(tenant_id, user_id);

ALTER TABLE email_send_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_identities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_send_identities;
CREATE POLICY tenant_isolation_policy ON email_send_identities
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Which alias a given outbound message was actually sent from — a per-
-- message override of the user's default identity, chosen from a "From"
-- picker in Compose when more than one alias exists. NULL (the common case
-- for everyone who never adds an alias) means "use whatever's default at
-- send time," matching today's behavior exactly.
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS from_identity_id UUID REFERENCES email_send_identities(id) ON DELETE SET NULL;
