-- Gereji port, Milestone 5: ANGA inventory core (stock units, four
-- independent status axes), certificates/traceability, and the rental
-- engine. Ported from the standalone app's anga_goods_receipt(_line),
-- anga_stock_unit, anga_certificate, anga_trace_chain_link, anga_rate_card
-- (_charge), anga_hire_reservation tables. Real RLS + FORCE RLS throughout.

CREATE TABLE gereji_anga_goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES gereji_anga_suppliers(id) ON DELETE SET NULL,
  po_reference TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gereji_anga_stock_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES gereji_anga_parts(id) ON DELETE RESTRICT,
  serial TEXT,
  lot_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  shelf_life_expiry TIMESTAMPTZ,
  location_id UUID REFERENCES gereji_anga_locations(id) ON DELETE SET NULL,
  condition TEXT NOT NULL DEFAULT 'NE' CHECK (condition IN ('NE', 'NS', 'OH', 'SV', 'IN', 'RP', 'AR', 'US', 'SCRAP')),
  ownership TEXT NOT NULL DEFAULT 'OWNED' CHECK (ownership IN ('OWNED', 'CONSIGNMENT', 'CUSTOMER_OWNED', 'LOANED_IN')),
  -- Same enum as gereji_anga_locations.customs_zone (migration 744) for consistency.
  customs_status TEXT NOT NULL DEFAULT 'DUTY_PAID' CHECK (customs_status IN ('DUTY_PAID', 'BONDED', 'FREE_ZONE')),
  availability TEXT NOT NULL DEFAULT 'QUARANTINE' CHECK (availability IN ('AVAILABLE', 'RESERVED', 'ALLOCATED', 'ON_LOAN', 'IN_REPAIR', 'QUARANTINE', 'SOLD', 'SCRAPPED')),
  tsn_hours NUMERIC(10, 2),
  csn_cycles INTEGER,
  tso_hours NUMERIC(10, 2),
  cso_cycles INTEGER,
  last_shop_visit_at TIMESTAMPTZ,
  warranty_expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, part_id, serial)
);
CREATE INDEX idx_gereji_anga_stock_units_part ON gereji_anga_stock_units(tenant_id, part_id);
CREATE INDEX idx_gereji_anga_stock_units_availability ON gereji_anga_stock_units(tenant_id, availability);

CREATE TABLE gereji_anga_goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES gereji_anga_goods_receipts(id) ON DELETE CASCADE,
  stock_unit_id UUID NOT NULL REFERENCES gereji_anga_stock_units(id) ON DELETE CASCADE,
  inspection_outcome TEXT NOT NULL DEFAULT 'pending' CHECK (inspection_outcome IN ('pending', 'accepted', 'quarantined', 'rejected')),
  inspected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  inspected_at TIMESTAMPTZ,
  inspection_notes TEXT,
  putaway_location_id UUID REFERENCES gereji_anga_locations(id) ON DELETE SET NULL,
  putaway_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_goods_receipt_lines_receipt ON gereji_anga_goods_receipt_lines(tenant_id, receipt_id);

CREATE TABLE gereji_anga_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stock_unit_id UUID NOT NULL REFERENCES gereji_anga_stock_units(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('FAA_8130_3', 'EASA_FORM_1', 'UK_CAA_FORM_1', 'TCCA_FORM_ONE', 'CASA_FORM_1', 'ANAC_F100', 'COFC', 'ATA_106', 'TEARDOWN_REPORT', 'NON_INCIDENT_STATEMENT')),
  issuing_authority TEXT,
  issuing_org_approval_ref TEXT,
  form_number TEXT,
  issue_date TIMESTAMPTZ,
  tag_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_certificates_unit ON gereji_anga_certificates(tenant_id, stock_unit_id);

CREATE TABLE gereji_anga_trace_chain_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stock_unit_id UUID NOT NULL REFERENCES gereji_anga_stock_units(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 0,
  from_party TEXT,
  to_party TEXT,
  hop_type TEXT,
  occurred_at TIMESTAMPTZ,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_trace_chain_links_unit ON gereji_anga_trace_chain_links(tenant_id, stock_unit_id);

CREATE TABLE gereji_anga_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  part_id UUID REFERENCES gereji_anga_parts(id) ON DELETE SET NULL,
  part_class TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  daily_rate_minor BIGINT NOT NULL DEFAULT 0,
  weekly_rate_minor BIGINT,
  monthly_rate_minor BIGINT,
  min_rental_days INTEGER NOT NULL DEFAULT 1,
  min_charge_minor BIGINT NOT NULL DEFAULT 0,
  tier_7_discount_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  tier_30_discount_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  tier_90_discount_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gereji_anga_rate_card_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rate_card_id UUID NOT NULL REFERENCES gereji_anga_rate_cards(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  is_per_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_rate_card_charges_card ON gereji_anga_rate_card_charges(tenant_id, rate_card_id);

CREATE TABLE gereji_anga_hire_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stock_unit_id UUID NOT NULL REFERENCES gereji_anga_stock_units(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES gereji_anga_customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'out', 'returned', 'cancelled')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  hold_expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE INDEX idx_gereji_anga_hire_reservations_unit ON gereji_anga_hire_reservations(tenant_id, stock_unit_id, status);

ALTER TABLE gereji_anga_goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_goods_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_goods_receipts;
CREATE POLICY tenant_isolation_policy ON gereji_anga_goods_receipts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_stock_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_stock_units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_stock_units;
CREATE POLICY tenant_isolation_policy ON gereji_anga_stock_units
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_goods_receipt_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_goods_receipt_lines;
CREATE POLICY tenant_isolation_policy ON gereji_anga_goods_receipt_lines
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_certificates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_certificates;
CREATE POLICY tenant_isolation_policy ON gereji_anga_certificates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_trace_chain_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_trace_chain_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_trace_chain_links;
CREATE POLICY tenant_isolation_policy ON gereji_anga_trace_chain_links
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_rate_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_rate_cards;
CREATE POLICY tenant_isolation_policy ON gereji_anga_rate_cards
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_rate_card_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_rate_card_charges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_rate_card_charges;
CREATE POLICY tenant_isolation_policy ON gereji_anga_rate_card_charges
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_hire_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_hire_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_hire_reservations;
CREATE POLICY tenant_isolation_policy ON gereji_anga_hire_reservations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
