-- 591_onsite_email_hosting_and_subdomains.sql
--
-- Email hosting: connects Onsite domain management with the platform's
-- Email app. A tenant registers a domain in Onsite, sets up MX/SPF/
-- DKIM/DMARC via the DNS wizard, then creates mailboxes that link to
-- user_email_accounts in the Email app — so a user assigned
-- info@company.com can send/receive from it in the Email app without
-- manually configuring IMAP/SMTP.
--
-- Subdomains: no new table — a subdomain is a DNS record (A/AAAA/CNAME)
-- whose name is not '@'. The API surfaces them as first-class entities
-- by filtering the existing onsite_dns_records table.

BEGIN;

-- ─── Email Domain Configuration ──────────────────────────────
-- Per-domain email hosting config: tracks which domains have email
-- enabled, their verification status, and the mail provider.
CREATE TABLE IF NOT EXISTS onsite_email_domains (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain_id         uuid NOT NULL REFERENCES onsite_domains(id) ON DELETE CASCADE,
  -- The mail provider backing this domain's mailboxes.
  -- 'platform' = the Hudumika Email app's own SMTP/IMAP;
  -- 'google' / 'microsoft' = Google Workspace / M365 (DNS only, mailboxes live there);
  -- 'external' = any other provider the tenant manages themselves.
  provider          varchar(20) NOT NULL DEFAULT 'platform'
                      CHECK (provider IN ('platform','google','microsoft','external')),
  -- DNS verification status — set by a real DNS lookup, never asserted.
  mx_verified       boolean NOT NULL DEFAULT false,
  spf_verified      boolean NOT NULL DEFAULT false,
  dkim_verified     boolean NOT NULL DEFAULT false,
  dmarc_verified    boolean NOT NULL DEFAULT false,
  last_verified_at  timestamptz,
  -- Catch-all: where mail to non-existent addresses goes.
  catch_all_action  varchar(20) NOT NULL DEFAULT 'reject'
                      CHECK (catch_all_action IN ('reject','forward','drop')),
  catch_all_address varchar(255),
  status            varchar(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','suspended','error')),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, domain_id)
);
CREATE INDEX IF NOT EXISTS idx_onsite_email_domains_tenant ON onsite_email_domains(tenant_id);

ALTER TABLE onsite_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_email_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON onsite_email_domains
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Email Mailboxes / Aliases / Forwards ────────────────────
-- An email address on a hosted domain. Types:
-- 'mailbox'  — a real inbox; linked_user_id connects it to the Email app
-- 'alias'    — another name for an existing mailbox (target_mailbox_id)
-- 'forward'  — forwards to an external address (forward_to)
-- 'group'    — distributes to multiple forward_to addresses
CREATE TABLE IF NOT EXISTS onsite_email_mailboxes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email_domain_id   uuid NOT NULL REFERENCES onsite_email_domains(id) ON DELETE CASCADE,
  -- The local part before @: 'info', 'support', 'john.doe'
  local_part        varchar(64) NOT NULL,
  -- Full address, computed: local_part || '@' || domain
  full_address      varchar(320) NOT NULL,
  display_name      varchar(255),
  type              varchar(20) NOT NULL DEFAULT 'mailbox'
                      CHECK (type IN ('mailbox','alias','forward','group')),
  -- For 'mailbox': the platform user who owns this inbox
  linked_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  -- For 'alias': which mailbox this is an alias of
  target_mailbox_id uuid REFERENCES onsite_email_mailboxes(id) ON DELETE CASCADE,
  -- For 'forward' / 'group': where to send mail (JSONB array for group)
  forward_to        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Quota in MB (0 = unlimited, null = tenant default)
  quota_mb          int,
  -- Usage tracking
  usage_mb          int NOT NULL DEFAULT 0,
  message_count     int NOT NULL DEFAULT 0,
  status            varchar(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended','disabled')),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email_domain_id, local_part)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onsite_email_mailboxes_unique_local
  ON onsite_email_mailboxes(tenant_id, email_domain_id, lower(local_part));
CREATE INDEX IF NOT EXISTS idx_onsite_email_mailboxes_tenant ON onsite_email_mailboxes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onsite_email_mailboxes_domain ON onsite_email_mailboxes(email_domain_id);
CREATE INDEX IF NOT EXISTS idx_onsite_email_mailboxes_user ON onsite_email_mailboxes(linked_user_id)
  WHERE linked_user_id IS NOT NULL;

ALTER TABLE onsite_email_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_email_mailboxes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON onsite_email_mailboxes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Domain registrar connection type ────────────────────────
-- Extend provider_connections to support domain registrars so
-- domain purchase/transfer can complete end-to-end.
-- (No schema change needed — onsite_provider_connections.provider
--  is varchar(50) with no CHECK constraint, so 'namecheap', 'gandi',
--  'godaddy' etc. are already valid values. The seam is in the service.)

COMMIT;
