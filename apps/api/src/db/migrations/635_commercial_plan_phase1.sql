-- Migration 635: Commercial plan Phase 1 — TZS catalog, billing cycle,
-- included seats, location limits, price snapshots, commercial availability.
--
-- Implements the Hudumika Tanzania-first commercial plan (Phase 1 of the
-- implementation brief). Extends existing tables additively; no existing
-- data is deleted or rewritten. Every new column is nullable or has a
-- default so this migration cannot break running code that doesn't know
-- about it yet.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. packages: flat pricing, included seats, location caps, currency
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS currency           VARCHAR(3)     DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS included_seats     INTEGER,         -- flat-price model: users included before overage
  ADD COLUMN IF NOT EXISTS max_locations      INTEGER,         -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS price_flat_monthly NUMERIC(12,2),   -- flat monthly price (vs per-seat)
  ADD COLUMN IF NOT EXISTS price_flat_annual  NUMERIC(12,2);   -- flat annual price (vs per-seat)

COMMENT ON COLUMN packages.included_seats IS
  'Number of users included in the flat price. Extra users above this count are billed at extra_seat_price. NULL = pure per-seat (legacy model).';
COMMENT ON COLUMN packages.price_flat_monthly IS
  'Flat monthly price for the package (currency column). NULL = use price_per_seat × seats (legacy model). Both may coexist during transition.';
COMMENT ON COLUMN packages.max_locations IS
  'Maximum locations (branches/warehouses) allowed on this plan. NULL = unlimited.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. tenants: billing cycle tracking
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(10) DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'annual'));

-- Backfill: every existing tenant is monthly (the only cycle that has
-- ever been billed by subscription-billing.service.ts).
UPDATE tenants SET billing_cycle = 'monthly' WHERE billing_cycle IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. subscription_invoices: billing cycle + price snapshot
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS billing_cycle  VARCHAR(10) DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS price_snapshot JSONB;

COMMENT ON COLUMN subscription_invoices.price_snapshot IS
  'Frozen copy of the package pricing at invoice generation time. Ensures changing catalog prices does not rewrite historical invoices.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. app_status: commercial availability flag
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE app_status
  ADD COLUMN IF NOT EXISTS commercially_available BOOLEAN NOT NULL DEFAULT false;

-- Mark all currently active, non-beta apps as commercially available
-- (they're already being sold/used). Beta apps stay false.
UPDATE app_status
  SET commercially_available = true
  WHERE status = 'active' AND is_beta = false;

COMMENT ON COLUMN app_status.commercially_available IS
  'Whether this feature may appear on public pricing pages and be promised to new signups. A feature can be technically enabled (status=active) but not commercially available — e.g. internal testing or beta. Checked by the pricing/onboarding UI, NOT by requireEntitlement().';

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Insert the three proposed TZS public packages
-- ═══════════════════════════════════════════════════════════════════════
-- These coexist with the existing USD packages. Existing tenants keep
-- their current plan code; new Tanzania-first signups get these.
--
-- Decision placeholders (see decisions ledger D1-D4):
--   - Business included_seats = 8, Scale = 25 (brief says "about")
--   - Business max_locations = 3, Scale = 10
--   - Prices are tax-inclusive per D4 default
--   - No overage billing yet (D3 unresolved) — enforcement blocks at limit
--
-- NOTE: These are inserted with is_active = false. A SuperAdmin must
-- activate them after reviewing the decisions ledger. This matches the
-- project's convention (see 393, 244).

-- Starter TZS (reuses 'starter' concept but is a new row to avoid
-- breaking existing USD tenants on 'starter')
INSERT INTO packages (
  code, name, currency, monthly_price, annual_price,
  price_flat_monthly, price_flat_annual,
  price_per_seat, included_seats, max_users, max_locations,
  monthly_item_limit, storage_limit_bytes,
  features, color, popular, is_active, sort_order
) VALUES (
  'starter-tzs', 'Starter', 'TZS', 29900, 299000,
  29900, 299000,
  NULL, 2, 2, 1,
  100, 10737418240,  -- 10 GB
  '["Basic finance & POS", "Invoices, quotations, receipts, expenses", "CRM & Contacts", "Basic tasks & reporting", "10 GB Cloud storage", "Email support", "M-Pesa, Airtel Money, Mixx by Yas"]'::jsonb,
  '#e8461a', false, false, 1
), (
  'business-tzs', 'Business', 'TZS', 99000, 990000,
  99000, 990000,
  NULL, 8, 8, 3,
  500, 53687091200,  -- 50 GB
  '["Advanced finance, POS & inventory", "Purchasing & procurement", "CRM & Projects", "Standard HR (NexusHR)", "Manufacturing, BOM, warehouse, serial/batch", "Standard automation & reporting", "50 GB Cloud storage", "Priority support"]'::jsonb,
  '#e8461a', true, false, 2
), (
  'scale-tzs', 'Scale', 'TZS', 299000, 2990000,
  299000, 2990000,
  NULL, 25, 25, 10,
  2000, 268435456000,  -- 250 GB
  '["Everything in Business", "Multiple business lines", "Advanced controls, finance, inventory & HR", "Advanced automation & analytics", "Consolidation & multi-entity", "Higher API allowance", "250 GB Cloud storage", "Priority support with dedicated contact"]'::jsonb,
  '#e8461a', false, false, 3
)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Grant feature keys to the new TZS packages
-- ═══════════════════════════════════════════════════════════════════════
-- Starter-TZS: basic modules only
INSERT INTO package_features (package_code, feature_key)
SELECT 'starter-tzs', f.key FROM (VALUES
  ('finops'), ('finance.core'), ('crm'), ('contacts'),
  ('tasks'), ('calendar'), ('cloud'), ('email'),
  ('store'), ('inventory')
) AS f(key)
ON CONFLICT DO NOTHING;

-- Business-TZS: everything Starter has + advanced modules
INSERT INTO package_features (package_code, feature_key)
SELECT 'business-tzs', f.key FROM (VALUES
  ('finops'), ('finance.core'), ('finance.accounting.advanced'),
  ('finance.budgets'), ('finance.procurement'), ('finance.pos'),
  ('finance.inventory'), ('finance.warehouse'),
  ('finance.manufacturing'),
  ('crm'), ('contacts'), ('tasks'), ('calendar'),
  ('cloud'), ('email'), ('store'), ('inventory'),
  ('clearos'), ('seal'), ('tracking'), ('tracking.reports'),
  ('onepi'), ('bliss'), ('studio'),
  ('complyos'), ('ondi'), ('notes'), ('sms'), ('sign'),
  ('ai')
) AS f(key)
ON CONFLICT DO NOTHING;

-- Scale-TZS: everything (same as current enterprise grant set)
INSERT INTO package_features (package_code, feature_key)
SELECT 'scale-tzs', pf.feature_key
FROM package_features pf
WHERE pf.package_code = 'enterprise'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Plan change history (for upgrade/downgrade audit trail)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_plan_changes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_plan       VARCHAR(50) NOT NULL,
  to_plan         VARCHAR(50) NOT NULL,
  from_cycle      VARCHAR(10),
  to_cycle        VARCHAR(10),
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT,
  initiated_by    UUID,        -- user who triggered the change
  proration_amount NUMERIC(12,2),
  proration_currency VARCHAR(3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_plan_changes_tenant
  ON tenant_plan_changes(tenant_id, created_at DESC);

ALTER TABLE tenant_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_plan_changes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_isolation_policy'
      AND polrelid = 'tenant_plan_changes'::regclass
  ) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_plan_changes
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
