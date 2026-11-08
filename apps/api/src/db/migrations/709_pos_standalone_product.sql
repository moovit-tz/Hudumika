-- POS standalone commercialization — giving POS its own identity (Phase 1
-- of the "Hudumika Commerce" scope), mirroring migrations 685/687/689's
-- ClearOS/HuduFreight/CargoTracker treatment exactly.
--
-- Real difference from those three: POS was never a free grant on any base
-- plan — it's a configurable Finance capability (finance.pos) with a real
-- dependency chain (finance.core -> finance.inventory -> finance.pos, see
-- packages/types/src/finance-capabilities.ts). A tenant subscribing to POS
-- standalone (no finops/base plan at all) needs that whole chain granted,
-- not just the 'finance.pos' leaf — otherwise entitlement.ts's own
-- dependency-aware getFinanceCapabilities() would show finance.pos as
-- "available" but never "enabled". So there is no grandfather step here
-- (nothing is being unbundled/revoked from an existing free grant) — this
-- migration only ADDS a new standalone purchase path.
--
-- finance.core and finance.inventory stay CONFIGURABLE in the capability
-- UI after subscribing (finance.core is non-configurable so it auto-
-- enables; finance.inventory and finance.pos need the tenant's own
-- Settings -> Finance Capabilities toggle, exactly like any existing
-- finops tenant already does today to turn POS on) — deliberately not
-- auto-enabled here, so a tenant isn't silently opted into inventory
-- tracking without ever seeing that screen.

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('pos-addon', 'Point of Sale', 'TZS', 59000, 590000, 59000, 590000, false, 908)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key) VALUES
  ('pos-addon', 'finance.core'),
  ('pos-addon', 'finance.inventory'),
  ('pos-addon', 'finance.pos')
ON CONFLICT DO NOTHING;

-- commercial_products already has a generic insert pattern from migration
-- 682 (the catalogue table itself) — this follows the same shape as
-- 685/687/689's UPDATE-after-INSERT-if-missing, since 'pos' was never
-- seeded as an internal placeholder the way clearos/hudufreight/
-- cargotracker were.
INSERT INTO commercial_products (product_key, name, standalone_purchasable, readiness_state, default_billing_method, default_package_code)
VALUES ('pos', 'Point of Sale', true, 'pilot', 'flat_tier', 'pos-addon')
ON CONFLICT (product_key) DO UPDATE SET
  standalone_purchasable = true, readiness_state = 'pilot',
  default_billing_method = 'flat_tier', default_package_code = 'pos-addon';
