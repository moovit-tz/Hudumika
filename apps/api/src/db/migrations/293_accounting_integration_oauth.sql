-- Real OAuth for the Accounting Integrations page.
--
-- accounting-integration.service.ts's connect()/syncCOA()/syncInvoice()/
-- syncBill()/syncPayment() were entirely simulated: connect() stored
-- whatever JSON a client posted with no OAuth handshake or validation;
-- syncCOA() inserted three hardcoded fake accounts into the tenant's REAL
-- chart_of_accounts; the other three fabricated a plausible externalId
-- string with no outbound call at all. This migration adds what real OAuth
-- token storage needs (encrypted, same as mail-oauth's tenant_settings
-- tokens) and a small entity-map table so a real push-sync can resolve our
-- customer/supplier ids to the provider's own contact ids without
-- re-resolving on every sync.
--
-- Also retrofits RLS onto all four accounting-integration tables, none of
-- which have ever had it (confirmed via grep of every migration) — worth
-- doing now regardless of the OAuth work, since this migration is about to
-- make accounting_integrations hold real encrypted refresh tokens.

ALTER TABLE accounting_integrations
  ADD COLUMN IF NOT EXISTS access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_org_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE TABLE IF NOT EXISTS accounting_integration_entity_map (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  provider      VARCHAR(20) NOT NULL,
  local_type    VARCHAR(20) NOT NULL CHECK (local_type IN ('customer', 'supplier')),
  local_id      UUID NOT NULL,
  external_id   VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, provider, local_type, local_id)
);

ALTER TABLE accounting_sync_logs
  DROP CONSTRAINT IF EXISTS accounting_sync_logs_entity_type_check,
  ADD CONSTRAINT accounting_sync_logs_entity_type_check
    CHECK (entity_type IN ('COA', 'INVOICE', 'BILL', 'PAYMENT', 'TEST_CONNECTION'));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounting_integrations', 'accounting_sync_logs',
    'accounting_marketplace_requests', 'accounting_integration_entity_map'
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
