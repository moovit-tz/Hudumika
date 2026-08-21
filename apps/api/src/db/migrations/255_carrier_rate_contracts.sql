-- Carrier buy-rate contract storage + rate-shopping (M7 of the ClearOS
-- roadmap), distinct from the existing freight_rate_cards.
--
-- freight_rate_cards (086_freight_booking.sql) bundles cost_rate (buy) and
-- sell_rate (customer-facing) into ONE row per carrier+lane — a quick
-- "pre-agreed quote" shortcut with no way to hold more than one carrier's
-- price for the same lane at once, so there was never anything to actually
-- shop between. It stays exactly as-is; nothing here touches it.
--
-- carrier_rate_contracts is pure buy-side: what a carrier's own contract
-- charges for a lane, with no sell price attached at all — a lane can now
-- have several contracts (different carriers, or the same carrier's
-- tiered pricing), which is what makes real rate-shopping possible. The
-- sell price stays a booking-time decision (freight_bookings.quoted_sell),
-- unchanged.

CREATE TABLE IF NOT EXISTS carrier_rate_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  carrier_id UUID NOT NULL REFERENCES carriers(id),
  contract_reference TEXT,          -- the carrier's own contract/tariff number
  mode TEXT NOT NULL,               -- same taxonomy as freight_rate_cards: 'FCL_20' | 'FCL_40' | 'FCL_40HC' | 'LCL' | 'AIR' | 'ROAD'
  origin_port TEXT NOT NULL,
  destination_port TEXT NOT NULL,
  buy_rate NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  transit_days INTEGER,
  valid_from DATE,
  valid_to DATE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_rate_contracts_tenant ON carrier_rate_contracts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_carrier_rate_contracts_lane ON carrier_rate_contracts (tenant_id, mode, origin_port, destination_port);
CREATE INDEX IF NOT EXISTS idx_carrier_rate_contracts_carrier ON carrier_rate_contracts (carrier_id);

ALTER TABLE carrier_rate_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_rate_contracts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'carrier_rate_contracts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON carrier_rate_contracts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
