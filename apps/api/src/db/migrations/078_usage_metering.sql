-- Migration 078: Per-seat pricing + monthly usage metering.
--
-- Product shift: every plan tier now gets every module (package_features
-- already seeds all base features to all tiers as of migration 060 — this
-- migration doesn't touch that). Tiers now differ by (a) price per seat
-- instead of a flat monthly price, and (b) how many billable "items"
-- (shipments, invoices, HR records, CRM leads, etc. — anything created
-- across the platform) the tenant can create per calendar month.
--
-- tenant_usage_counters is a simple per-tenant, per-calendar-month counter,
-- incremented by the onResponse hook in index.ts and checked by
-- checkUsageLimit() (apps/api/src/lib/usage.ts) from within the shared
-- authenticate() preHandler so it applies platform-wide without touching
-- every route file individually.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS price_per_seat NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS monthly_item_limit INTEGER; -- NULL = unlimited

UPDATE packages SET price_per_seat = 4,  monthly_item_limit = 50   WHERE code = 'starter';
UPDATE packages SET price_per_seat = 9,  monthly_item_limit = 300  WHERE code = 'growth';
UPDATE packages SET price_per_seat = 19, monthly_item_limit = 1500 WHERE code = 'scale';
UPDATE packages SET price_per_seat = NULL, monthly_item_limit = NULL WHERE code = 'enterprise'; -- custom/unlimited

CREATE TABLE IF NOT EXISTS tenant_usage_counters (
  tenant_id  UUID NOT NULL,
  period     CHAR(7) NOT NULL,   -- 'YYYY-MM', UTC calendar month
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period)
);
