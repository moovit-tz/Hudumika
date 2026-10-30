-- Phase 3: Provider ownership and metering rollout.
--
-- Tracks credential ownership (BYOK vs platform-managed) and metering
-- enablement per tenant+service. Every external call that costs money should
-- record whether the tenant's own key or the platform key was used, and
-- whether the ESB was charged.
--
-- SMS is already fully BYOK (sms_gateways per tenant). AI has a split model:
-- BYOK if plan allows + tenant configured key, else platform-managed with
-- AI credit debit. This migration formalizes the ownership registry and adds
-- metering flags.

-- Per-tenant metering configuration: which services are ESB-metered.
-- When esb_metered=true for a service, the ESB reserve→capture flow is used.
-- When false, the existing model applies (AI credits for AI, tenant-BYOK for SMS).
CREATE TABLE IF NOT EXISTS tenant_service_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_kind  VARCHAR(50) NOT NULL,  -- 'ai', 'sms', 'ocr', 'whatsapp', 'storage'
  -- Who owns the credentials for this service
  credential_owner VARCHAR(20) NOT NULL DEFAULT 'tenant'
                   CHECK (credential_owner IN ('tenant', 'platform', 'hybrid')),
  -- Whether ESB is charged for platform-managed usage
  esb_metered   BOOLEAN NOT NULL DEFAULT false,
  -- Service-specific rate (TZS per unit) for ESB charging
  -- null = use platform default rate from provider_rates
  rate_override NUMERIC(15,4),
  -- Whether this service is enabled for the tenant at all
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_kind)
);
CREATE INDEX IF NOT EXISTS idx_tenant_service_config_tenant ON tenant_service_config(tenant_id);

-- Platform-wide provider rates (TZS per unit of consumption).
-- These are the default rates charged to ESB when no tenant override exists.
-- Managed by SuperAdmin. Rates are explicitly unpublished until reviewed.
CREATE TABLE IF NOT EXISTS provider_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_kind    VARCHAR(50) NOT NULL,     -- 'ai', 'sms', 'ocr'
  provider        VARCHAR(50) NOT NULL,     -- 'anthropic', 'africas_talking', 'twilio'
  unit_label      VARCHAR(50) NOT NULL,     -- 'call', 'segment', 'page', 'token_1k'
  rate_tzs        NUMERIC(15,4) NOT NULL,   -- TZS per unit
  -- Cost basis: what Hudumika actually pays per unit in supplier currency
  supplier_rate   NUMERIC(15,6),
  supplier_currency VARCHAR(5),
  -- Whether this rate is published (visible to tenants) and active
  is_active       BOOLEAN NOT NULL DEFAULT false,
  is_published    BOOLEAN NOT NULL DEFAULT false,
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_rates_lookup ON provider_rates(service_kind, provider, is_active);

-- Seed AI provider rates as unpublished drafts (D6 in decisions ledger:
-- provider markups need owner decision). These are placeholder estimates
-- based on typical Anthropic pricing, not approved retail prices.
INSERT INTO provider_rates (service_kind, provider, unit_label, rate_tzs, supplier_rate, supplier_currency, is_active, is_published, notes)
VALUES
  ('ai', 'anthropic', 'call', 50.00, 0.003, 'USD', true, false, 'Draft: ~TZS 50/call assuming avg 1K tokens Sonnet. Needs pricing decision.'),
  ('ai', 'openai', 'call', 50.00, 0.003, 'USD', true, false, 'Draft: ~TZS 50/call. Needs pricing decision.'),
  ('sms', 'africas_talking', 'segment', 25.00, 0.005, 'USD', true, false, 'Draft: ~TZS 25/segment. Needs pricing decision.'),
  ('sms', 'twilio', 'segment', 35.00, 0.0075, 'USD', true, false, 'Draft: ~TZS 35/segment. Needs pricing decision.'),
  ('sms', 'beem', 'segment', 20.00, 15.00, 'TZS', true, false, 'Draft: ~TZS 20/segment. Needs pricing decision.')
ON CONFLICT DO NOTHING;

-- Extend packages with an esb_metering_default flag: new tenants on this
-- plan get ESB metering enabled by default (can be overridden per-tenant).
ALTER TABLE packages ADD COLUMN IF NOT EXISTS esb_metered_default BOOLEAN NOT NULL DEFAULT false;

-- The new TZS plans should default to ESB metering
UPDATE packages SET esb_metered_default = true WHERE code IN ('starter-tzs', 'business-tzs', 'scale-tzs');

-- RLS on both new tables
ALTER TABLE tenant_service_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_service_config FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_service_config'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_service_config
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- provider_rates is platform-wide (not per-tenant), accessed via dbPlatform —
-- still enable RLS with a permissive policy for safety.
ALTER TABLE provider_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_rates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'allow_all_policy' AND polrelid = 'provider_rates'::regclass) THEN
    CREATE POLICY allow_all_policy ON provider_rates USING (true);
  END IF;
END $$;
