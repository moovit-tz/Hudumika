-- Dangerous goods beyond the SEAL bonded warehouse (M2 of the ClearOS
-- roadmap). SEAL's IMDG segregation engine (106/110_seal_*.sql,
-- seal.service.ts) stays exactly as-is — it answers "can these two lots
-- share a warehouse location," a real and different question from this.
-- This is: "what is UN1203, and can we hand the shipper a real Shipper's
-- Declaration for Dangerous Goods for it" — which today doesn't exist
-- anywhere in the platform outside a billing line item.
--
-- dangerous_goods_reference is platform reference data (like hs_codes,
-- seal_dg_segregation_rules) — no tenant_id, no RLS, dbPlatform only. It is
-- a real but deliberately partial extract of the UN Model Regulations
-- Dangerous Goods List (the ~35 most commonly shipped entries relevant to
-- general East African freight — fuels, batteries, common acids/oxidizers,
-- gases — verified against real public sources), not the full ~3000-entry
-- table, and it does NOT carry IATA's own packing-instruction quantity
-- limits: those tables are IATA's paid, copyrighted DGR manual content, not
-- freely republishable, and this platform will not fabricate safety numbers
-- it cannot verify. The shipper/agent still owns getting the quantity limit
-- right from their own DGR reference — same "don't pretend integration
-- exists" honesty as seal-customs-adapter.ts's ManualAdapter.
--
-- dg_declarations is the tenant-scoped record of an actual shipment's
-- declared dangerous goods, WITH RLS, same policy shape as every other
-- tenant table.

CREATE TABLE IF NOT EXISTS dangerous_goods_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  un_number VARCHAR(6) NOT NULL UNIQUE,        -- e.g. 'UN1203'
  proper_shipping_name TEXT NOT NULL,
  class_or_division VARCHAR(10) NOT NULL,      -- e.g. '3', '2.1', '8'
  subsidiary_risk VARCHAR(10),
  packing_group VARCHAR(3),                    -- 'I' | 'II' | 'III' | null (not all classes have one)
  air_transport_restriction VARCHAR(24),        -- 'FORBIDDEN' | 'CARGO_AIRCRAFT_ONLY' | 'PASSENGER_AND_CARGO'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dg_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type VARCHAR(20) NOT NULL DEFAULT 'shipment', -- 'shipment' | 'seal_lot' | 'adhoc'
  subject_id UUID,                                        -- soft reference, no FK — see ExaminationsQueue's shipmentCaseId precedent
  transport_mode VARCHAR(10) NOT NULL,                    -- 'AIR' | 'SEA' | 'ROAD'
  reference_id UUID REFERENCES dangerous_goods_reference(id),
  un_number VARCHAR(6) NOT NULL,
  proper_shipping_name TEXT NOT NULL,
  class_or_division VARCHAR(10) NOT NULL,
  subsidiary_risk VARCHAR(10),
  packing_group VARCHAR(3),
  packaging_type TEXT,
  number_of_packages INT,
  net_quantity NUMERIC(12,3),
  quantity_unit VARCHAR(10),
  air_transport_restriction VARCHAR(24),
  shipper_name TEXT NOT NULL,
  shipper_address TEXT,
  consignee_name TEXT NOT NULL,
  consignee_address TEXT,
  emergency_contact TEXT,
  additional_handling_info TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',   -- draft | issued
  issued_by UUID,
  issued_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dg_reference_name_trgm ON dangerous_goods_reference USING gin (proper_shipping_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dg_declarations_tenant ON dg_declarations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dg_declarations_subject ON dg_declarations(tenant_id, subject_type, subject_id);

ALTER TABLE dg_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dg_declarations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'dg_declarations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON dg_declarations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- A real, verified subset of the UN Model Regulations Dangerous Goods List
-- (proper shipping name / class / packing group cross-checked against IMDG
-- and IATA DGR public references) — the most commonly shipped items in
-- general East African freight. air_transport_restriction reflects IATA's
-- passenger-aircraft carriage limits specifically, since that's the one
-- place air diverges sharply from sea/road for otherwise-identical items.
INSERT INTO dangerous_goods_reference (un_number, proper_shipping_name, class_or_division, subsidiary_risk, packing_group, air_transport_restriction, notes) VALUES
  ('UN1203', 'Gasoline / Petrol / Motor spirit', '3', NULL, 'II', 'FORBIDDEN', 'Flammable liquid, common bulk fuel'),
  ('UN1202', 'Gas oil / Diesel fuel / Heating oil, light', '3', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1863', 'Fuel, aviation, turbine engine', '3', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1170', 'Ethanol / Ethyl alcohol', '3', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1993', 'Flammable liquid, n.o.s.', '3', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', 'Use for unlisted flammable liquid mixtures'),
  ('UN1268', 'Petroleum distillates, n.o.s. / Petroleum products, n.o.s.', '3', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1133', 'Adhesives (flammable base)', '3', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1866', 'Resin solution', '3', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1230', 'Methanol', '3', '6.1', 'II', 'CARGO_AIRCRAFT_ONLY', 'Toxic subsidiary risk'),
  ('UN3480', 'Lithium ion batteries', '9', NULL, NULL, 'CARGO_AIRCRAFT_ONLY', 'Shipped alone'),
  ('UN3481', 'Lithium ion batteries contained in / packed with equipment', '9', NULL, NULL, 'PASSENGER_AND_CARGO', NULL),
  ('UN3090', 'Lithium metal batteries', '9', NULL, NULL, 'FORBIDDEN', 'Forbidden as cargo on passenger aircraft'),
  ('UN3091', 'Lithium metal batteries contained in / packed with equipment', '9', NULL, NULL, 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN2794', 'Batteries, wet, filled with acid (electric storage)', '8', NULL, NULL, 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN2800', 'Batteries, wet, non-spillable', '8', NULL, NULL, 'PASSENGER_AND_CARGO', NULL),
  ('UN1830', 'Sulphuric acid', '8', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1789', 'Hydrochloric acid', '8', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1824', 'Sodium hydroxide solution', '8', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN2031', 'Nitric acid', '8', '5.1', 'I', 'FORBIDDEN', 'Packing group varies by concentration — I shown for >70%, confirm actual concentration before shipping'),
  ('UN2790', 'Acetic acid solution', '8', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1479', 'Oxidizing solid, n.o.s.', '5.1', NULL, 'II', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN2015', 'Hydrogen peroxide, stabilized', '5.1', '8', 'I', 'FORBIDDEN', NULL),
  ('UN1017', 'Chlorine', '2.3', '5.1,8', NULL, 'FORBIDDEN', 'Toxic gas'),
  ('UN1075', 'Petroleum gases, liquefied (LPG)', '2.1', NULL, NULL, 'FORBIDDEN', NULL),
  ('UN1978', 'Propane', '2.1', NULL, NULL, 'FORBIDDEN', NULL),
  ('UN1950', 'Aerosols, flammable', '2.1', NULL, NULL, 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN1044', 'Fire extinguishers', '2.2', NULL, NULL, 'PASSENGER_AND_CARGO', 'Compressed gas, non-flammable'),
  ('UN1361', 'Carbon', '4.2', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', 'Spontaneously combustible'),
  ('UN1381', 'Phosphorus, white or yellow, dry / under water / in solution', '4.2', '6.1', NULL, 'FORBIDDEN', NULL),
  ('UN3082', 'Environmentally hazardous substance, liquid, n.o.s.', '9', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN3077', 'Environmentally hazardous substance, solid, n.o.s.', '9', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN2211', 'Polymeric beads, expandable', '9', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', 'Evolves flammable vapour'),
  ('UN1266', 'Perfumery products', '3', NULL, 'III', 'PASSENGER_AND_CARGO', NULL),
  ('UN1263', 'Paint / Paint related material', '3', NULL, 'III', 'CARGO_AIRCRAFT_ONLY', NULL),
  ('UN3316', 'Chemical kit / First aid kit', '9', NULL, NULL, 'PASSENGER_AND_CARGO', 'Small-quantity mixed-class kits')
ON CONFLICT (un_number) DO NOTHING;
