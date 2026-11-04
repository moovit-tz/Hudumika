-- Migration 682: Commercial Products catalog — Phase 1 of the multi-product
-- subscription architecture (docs/commercial-plan-phase0-matrix.md's "one
-- tenant, one TZS plan" work stays as-is; this is the new layer on top that
-- lets a tenant subscribe to several independent commercial products).
--
-- `commercial_products` generalizes `app_status`'s two-boolean
-- (status/is_beta) + migration 635's `commercially_available` flag into the
-- fuller readiness lifecycle: internal -> pilot -> sellable ->
-- limited_availability -> general_availability -> suspended -> retired.
-- `app_status` itself is untouched and keeps doing its existing job (the
-- maintenance kill switch checked by requireEntitlement()) — this is an
-- additive, separate table, not a replacement.
--
-- Only `hudumika_business` maps onto something with real pricing today (the
-- existing `packages` catalog — starter-tzs/business-tzs/scale-tzs).
-- clearos/seal/hudufreight/cargotracker are seeded as readiness_state
-- 'internal' placeholders only, per the master prompt's own priority order
-- (section 63) — no pricing, no activation, not purchasable. Each needs its
-- own billing-meter schema work first (see the Phase-0 audit: ClearOS has
-- no draft/active distinction, HuduFreight's vehicle status is an
-- unconstrained string, CargoTracker has no usage-dedup mechanism at all).

CREATE TABLE IF NOT EXISTS commercial_products (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key             TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  description             TEXT,
  standalone_purchasable  BOOLEAN NOT NULL DEFAULT false,
  readiness_state         TEXT NOT NULL DEFAULT 'internal'
                            CHECK (readiness_state IN (
                              'internal', 'pilot', 'sellable',
                              'limited_availability', 'general_availability',
                              'suspended', 'retired'
                            )),
  default_billing_method  TEXT NOT NULL DEFAULT 'flat_tier'
                            CHECK (default_billing_method IN ('flat_tier', 'usage_metered', 'hybrid')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Platform-global catalog, same shape as `packages`/`app_status` — no
-- tenant_id, no RLS, read via dbPlatform like every other catalog table.

INSERT INTO commercial_products (product_key, name, description, standalone_purchasable, readiness_state, default_billing_method) VALUES
  ('hudumika_business', 'Hudumika Business', 'General business management — finance, POS, inventory, CRM, HR.', true, 'pilot', 'flat_tier'),
  ('clearos',           'ClearOS',           'Customs clearance and declaration management.',                  false, 'internal', 'usage_metered'),
  ('seal',              'SEAL',              'Bonded warehouse and trust/compartment operations.',             false, 'internal', 'usage_metered'),
  ('hudufreight',       'HuduFreight',       'Fleet, trip and GPS tracking operations.',                        false, 'internal', 'usage_metered'),
  ('cargotracker',      'CargoTracker',      'External shipment tracking (AWB/Bill of Lading).',                false, 'internal', 'usage_metered')
ON CONFLICT (product_key) DO NOTHING;

-- Resolve the Business-tier pricing conflict between the two source docs
-- (Oct-28 draft: 99,000 TZS/mo; the newer master prompt: 79,000 TZS/mo) —
-- the newer prompt was chosen as authoritative. Only touches the row while
-- it is still unpublished (is_active = false), so this can never reprice a
-- live subscriber — if it has since been activated, leave it untouched and
-- surface the conflict for a human instead of silently repricing someone.
UPDATE packages
  SET monthly_price = 79000, annual_price = 790000,
      price_flat_monthly = 79000, price_flat_annual = 790000,
      updated_at = now()
  WHERE code = 'business-tzs' AND is_active = false;
