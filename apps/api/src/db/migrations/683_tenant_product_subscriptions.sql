-- Migration 683: tenant_product_subscriptions — the actual multi-product
-- layer. Generalizes `tenants.plan` (one string) into N independent,
-- separately-billed, separately-cancellable product subscriptions per
-- tenant, all sharing one billing anniversary.
--
-- Deliberately NOT a replacement for `tenants.plan`: that column stays the
-- live source of truth for the tenant's Hudumika Business tier (every
-- existing route/service that reads tenant.plan keeps working unmodified).
-- This table's hudumika_business row is kept write-through in sync with it
-- (see subscription-billing.service.ts's addProductSubscription /
-- cancelProductSubscription). Additional products (none activated yet) are
-- the genuinely new capability: a tenant_product_subscriptions row with no
-- counterpart on `tenants` at all.

CREATE TABLE IF NOT EXISTS tenant_product_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  commercial_product_id   UUID NOT NULL REFERENCES commercial_products(id),
  package_code            TEXT REFERENCES packages(code),
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'trial', 'grace', 'suspended', 'cancelled', 'scheduled_cancellation', 'expired')),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancel_at               TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  price_snapshot          JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, commercial_product_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_product_subscriptions_tenant ON tenant_product_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_product_subscriptions_status ON tenant_product_subscriptions(tenant_id, status);

ALTER TABLE tenant_product_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_product_subscriptions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_isolation_policy'
      AND polrelid = 'tenant_product_subscriptions'::regclass
  ) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_product_subscriptions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- The one shared renewal date every tenant_product_subscriptions row bills
-- against — generatePeriodInvoice()'s existing periodBounds() already uses
-- calendar-month boundaries for monthly tenants, so this column only
-- matters once a second product with its own cadence exists; stored now so
-- it has a stable backfilled value (the day the tenant's billing already
-- actually runs on) rather than being invented later from nothing.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS billing_anniversary_day SMALLINT
    CHECK (billing_anniversary_day BETWEEN 1 AND 28);

UPDATE tenants
  SET billing_anniversary_day = LEAST(EXTRACT(DAY FROM created_at)::SMALLINT, 28)
  WHERE billing_anniversary_day IS NULL;

-- Backfill: one tenant_product_subscriptions row per existing tenant with a
-- plan, pointing at the hudumika_business catalog row, package_code =
-- tenants.plan. started_at is backdated to the tenant's own created_at
-- (NOT now()) — this is a continuation of an existing subscription, not a
-- new mid-cycle purchase, and must be billed in the current period exactly
-- like before (generatePeriodInvoice's extra-line lookup filters on
-- started_at < period start, mirroring the existing tenant_addons rule).
-- Idempotent: ON CONFLICT on the (tenant_id, commercial_product_id) unique
-- constraint means a second run of this migration file — which never
-- happens under the forward-only migration runner, but matches the same
-- safety convention used elsewhere in this codebase — inserts nothing new.
INSERT INTO tenant_product_subscriptions (tenant_id, commercial_product_id, package_code, status, started_at)
SELECT t.id, cp.id, t.plan, 'active', t.created_at
FROM tenants t
CROSS JOIN (SELECT id FROM commercial_products WHERE product_key = 'hudumika_business') cp
WHERE t.plan IS NOT NULL
ON CONFLICT (tenant_id, commercial_product_id) DO NOTHING;
