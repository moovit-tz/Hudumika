BEGIN;
ALTER TABLE user_email_accounts ADD COLUMN sync_claim_token uuid;
ALTER TABLE user_email_accounts ADD COLUMN sync_claim_until timestamptz;
CREATE TABLE email_remote_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 mailbox_path text NOT NULL,
 uid_validity text NOT NULL,
 uid bigint NOT NULL,
 message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
 seen_token uuid NOT NULL,
 remote_deleted boolean NOT NULL DEFAULT false,
 desired_patch jsonb,
 operation_error text,
 UNIQUE(account_id,mailbox_path,uid_validity,uid)
);
CREATE INDEX email_remote_message_local ON email_remote_messages(tenant_id,user_id,message_id);
ALTER TABLE email_remote_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_remote_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON email_remote_messages
 USING (tenant_id = NULLIF(current_setting('app.tenant_id', true),'')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
ALTER TABLE onsite_email_domains ADD COLUMN provider_config_ciphertext text;
ALTER TABLE onsite_email_domains ADD COLUMN required_dns_records jsonb NOT NULL DEFAULT '[]';
ALTER TABLE onsite_email_mailboxes ADD COLUMN provision_status text NOT NULL DEFAULT 'unconfigured'
 CHECK (provision_status IN ('unconfigured','provisioning','ready','error','review'));
ALTER TABLE onsite_email_mailboxes ADD COLUMN provider_mailbox_id text;
ALTER TABLE onsite_email_mailboxes ADD COLUMN provision_error text;
ALTER TABLE onsite_email_mailboxes ADD COLUMN mailbox_secret_ciphertext text;
CREATE TABLE email_live_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
 outbox_id uuid REFERENCES email_outbox(id) ON DELETE SET NULL,
 token uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','received','failed')),
 received_message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 received_at timestamptz
);
ALTER TABLE email_live_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_live_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON email_live_checks
 USING (tenant_id = NULLIF(current_setting('app.tenant_id', true),'')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true),'')::uuid);
COMMIT;
