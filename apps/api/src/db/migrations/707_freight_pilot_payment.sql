-- Freight-forwarder pilot, closing the "usage -> invoice -> payment ->
-- entitlement" gap flagged in docs/audits/STANDALONE_VERIFICATION_AND_PLAN_
-- 2026-11-05.md. Two parts:
--
-- 1. Payment lifecycle columns on freight_pilot_invoice_drafts (previously
--    write-once: INSERT-only, no UPDATE grant at all per migration 702).
--    A draft now moves draft -> invoiced (checkout started) -> paid
--    (gateway-verified), mirroring esb_checkout_requests' tx_ref pattern.
--
-- 2. Zero-priced "pilot carrier" packages for clearos/hudufreight/
--    cargotracker, mirroring migrations 685/687/689's own grandfathered-
--    package pattern exactly. Per explicit product decision: while a tenant
--    is enrolled in the freight-forwarder usage pilot, its usage-based
--    invoice REPLACES the three products' normal flat monthly fee, not
--    stacks on top of it. Swapping a tenant's tenant_product_subscriptions
--    row onto one of these (done in freight-usage-preview.service.ts, on
--    the first successful pilot payment) makes generatePeriodInvoice's
--    existing `subAmount > 0` guard naturally stop billing the flat fee —
--    no new logic needed in the billing job itself.

ALTER TABLE freight_pilot_invoice_drafts
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'invoiced', 'paid')),
  ADD COLUMN gateway_tx_ref TEXT,
  ADD COLUMN gateway_tx_id TEXT,
  ADD COLUMN invoiced_at TIMESTAMPTZ,
  ADD COLUMN paid_at TIMESTAMPTZ;

CREATE UNIQUE INDEX freight_pilot_invoice_drafts_tx_ref_idx
  ON freight_pilot_invoice_drafts (gateway_tx_ref) WHERE gateway_tx_ref IS NOT NULL;

GRANT UPDATE (status, gateway_tx_ref, gateway_tx_id, invoiced_at, paid_at)
  ON freight_pilot_invoice_drafts TO hudumika_app;

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES
  ('clearos-pilot', 'ClearOS (freight pilot)', 'TZS', 0, 0, 0, 0, false, 950),
  ('hudufreight-pilot', 'HuduFreight (freight pilot)', 'TZS', 0, 0, 0, 0, false, 951),
  ('cargotracker-pilot', 'CargoTracker (freight pilot)', 'TZS', 0, 0, 0, 0, false, 952)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key) VALUES
  ('clearos-pilot', 'clearos'),
  ('hudufreight-pilot', 'tracking'),
  ('cargotracker-pilot', 'cargotracker')
ON CONFLICT DO NOTHING;
