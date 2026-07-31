-- Migration 152: capture where a consignment actually comes from.
--
-- Every landed-cost calculation now records its origin point — the port of
-- loading for sea, airport of loading for air, or the border post for road
-- entries — plus the country of origin and the transport mode. Individually
-- it's one more field on a quote; in aggregate it tells the platform which
-- corridors, ports and source markets the tenants' trade actually flows
-- through, which nothing in the system captures today.
--
-- Also records how the invoice price was quoted. Customers don't know
-- Incoterms, so the calculator asks two plain questions ("does the price
-- include shipping?", "...insurance?") and stores the derived term here.
-- Keeping the derived value means the aggregate data stays meaningful even
-- though the customer never typed "CIF".
--
-- All nullable: historical rows predate the capture, and a user can always
-- skip an optional field. A NULL means "not recorded", never "unknown port"
-- — reporting must exclude them rather than bucket them.

ALTER TABLE landed_cost_records
  ADD COLUMN IF NOT EXISTS origin_country   TEXT,
  ADD COLUMN IF NOT EXISTS loading_point    TEXT,
  ADD COLUMN IF NOT EXISTS loading_point_type TEXT
    CHECK (loading_point_type IS NULL OR loading_point_type IN ('SEA_PORT','AIRPORT','BORDER_POST')),
  ADD COLUMN IF NOT EXISTS shipment_mode    TEXT,
  ADD COLUMN IF NOT EXISTS price_basis      TEXT
    CHECK (price_basis IS NULL OR price_basis IN ('EXW','FOB','CFR','CIF'));

-- Corridor reporting: "which ports do we clear from, how often, how much".
CREATE INDEX IF NOT EXISTS idx_lcr_loading_point
  ON landed_cost_records (tenant_id, loading_point)
  WHERE loading_point IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lcr_origin_country
  ON landed_cost_records (tenant_id, origin_country)
  WHERE origin_country IS NOT NULL;

COMMENT ON COLUMN landed_cost_records.loading_point IS
  'Port/airport/border post the consignment was loaded at, as entered. NULL = not recorded.';
COMMENT ON COLUMN landed_cost_records.price_basis IS
  'Incoterm derived from the plain-language questions, never typed by the customer.';
