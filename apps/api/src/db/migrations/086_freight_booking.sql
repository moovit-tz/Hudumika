-- Freight Booking & Rate Management — closes ClearOS's biggest feature gap
-- against EMASuite (booking + rate/margin management). An internally-managed
-- rate-card system: officers enter carrier rates, quote customers, confirm
-- bookings, which then convert into a real shipment_case — mirroring the
-- existing quotations -> shipment_cases conversion pattern in
-- quotation.service.ts, just with a carrier/rate layer in front of it.

CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  mode TEXT NOT NULL,              -- 'OCEAN' | 'AIR' | 'ROAD'
  scac_or_iata TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carriers_tenant ON carriers (tenant_id);

CREATE TABLE IF NOT EXISTS freight_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  carrier_id UUID NOT NULL REFERENCES carriers(id),
  mode TEXT NOT NULL,               -- 'FCL_20' | 'FCL_40' | 'FCL_40HC' | 'LCL' | 'AIR' | 'ROAD'
  origin_port TEXT NOT NULL,
  destination_port TEXT NOT NULL,
  cost_rate NUMERIC NOT NULL,       -- what the carrier charges
  sell_rate NUMERIC NOT NULL,       -- what the customer is quoted (margin = sell - cost)
  currency TEXT NOT NULL DEFAULT 'USD',
  valid_from DATE,
  valid_to DATE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_tenant ON freight_rate_cards (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_lane ON freight_rate_cards (tenant_id, origin_port, destination_port);

CREATE TABLE IF NOT EXISTS freight_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  booking_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  carrier_id UUID REFERENCES carriers(id),
  rate_card_id UUID REFERENCES freight_rate_cards(id),
  mode TEXT NOT NULL,
  origin_port TEXT NOT NULL,
  destination_port TEXT NOT NULL,
  cargo_desc TEXT,
  quantity INTEGER DEFAULT 1,
  requested_ship_date DATE,
  status TEXT NOT NULL DEFAULT 'REQUESTED', -- REQUESTED -> RATE_QUOTED -> CONFIRMED -> CANCELLED
  quoted_cost NUMERIC,
  quoted_sell NUMERIC,
  currency TEXT DEFAULT 'USD',
  vessel_name TEXT,
  voyage_number TEXT,
  carrier_booking_ref TEXT,
  bl_number TEXT,
  awb_number TEXT,
  eta DATE,
  -- No REFERENCES here: shipment_cases is partitioned with a composite
  -- PK (id, created_at), so a plain FK on id alone isn't valid Postgres —
  -- same reason quotations.converted_shipment_id (005_demurrage_quotations_
  -- consignments.sql) is a bare UUID column too.
  converted_shipment_id UUID,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freight_bookings_tenant ON freight_bookings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_freight_bookings_status ON freight_bookings (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_freight_bookings_customer ON freight_bookings (customer_id);
