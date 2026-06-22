-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Demurrage, Quotations, Road Consignments
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────
-- 1. DEMURRAGE ENGINE
-- ─────────────────────────────────────────────────

-- Tariff configuration per shipping line / container size
CREATE TABLE IF NOT EXISTS demurrage_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carrier_name VARCHAR(100) NOT NULL,
  container_size VARCHAR(10) NOT NULL, -- '20FT', '40FT', '40HC', '45HC'
  free_days INTEGER NOT NULL DEFAULT 7,
  -- Progressive rate tiers stored as JSONB array:
  -- [{ "from_day": 1, "to_day": 5, "daily_rate": 50.00 }, { "from_day": 6, "to_day": 15, "daily_rate": 100.00 }, ...]
  rate_tiers JSONB NOT NULL DEFAULT '[]',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demurrage_tariffs_tenant ON demurrage_tariffs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_demurrage_tariffs_carrier ON demurrage_tariffs(tenant_id, carrier_name);

-- Container-level tracking for demurrage calculations
CREATE TABLE IF NOT EXISTS container_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL,
  container_number VARCHAR(20) NOT NULL,
  container_size VARCHAR(10) NOT NULL,
  seal_number VARCHAR(30),
  carrier_name VARCHAR(100),
  discharge_date DATE,
  gate_out_date DATE,
  return_date DATE,
  free_days INTEGER NOT NULL DEFAULT 7,
  -- Calculated fields (updated by service)
  total_days INTEGER NOT NULL DEFAULT 0,
  demurrage_days INTEGER NOT NULL DEFAULT 0,
  demurrage_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  demurrage_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, WAIVED
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_container_tracking_tenant ON container_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_container_tracking_shipment ON container_tracking(shipment_id);
CREATE INDEX IF NOT EXISTS idx_container_tracking_status ON container_tracking(tenant_id, status);

-- ─────────────────────────────────────────────────
-- 2. QUOTATIONS MODULE
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_number VARCHAR(30) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  -- Basic details
  title VARCHAR(200) NOT NULL,
  shipment_type VARCHAR(20) NOT NULL, -- SEA_FCL, SEA_LCL, AIR, ROAD
  goods_description TEXT,
  -- Route
  origin_port VARCHAR(100),
  origin_city VARCHAR(100),
  destination_port VARCHAR(100),
  destination_city VARCHAR(100),
  -- Container requirements
  container_requirements JSONB DEFAULT '[]', -- [{ "size": "40HC", "quantity": 2 }]
  -- Financial summary
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- Validity
  valid_from DATE,
  valid_until DATE,
  -- Status workflow
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, PENDING, APPROVED, REJECTED, CONVERTED, EXPIRED
  converted_shipment_id UUID,
  -- Metadata
  prepared_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_number ON quotations(tenant_id, quote_number);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant ON quotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(tenant_id, status);

-- Quotation charge line items
CREATE TABLE IF NOT EXISTS quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL, -- FREIGHT, CLEARANCE, HANDLING, TRANSPORT, DUTY, INSURANCE, OTHER
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  vendor VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotation_lines_quote ON quotation_lines(quotation_id);

-- ─────────────────────────────────────────────────
-- 3. ROAD CONSIGNMENTS & TRANSIT TRACKING
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS road_consignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consignment_number VARCHAR(30) NOT NULL,
  shipment_id UUID,
  customer_id UUID NOT NULL REFERENCES customers(id),
  -- Cargo details
  goods_description TEXT,
  weight_kg NUMERIC(10,2),
  volume_cbm NUMERIC(10,2),
  package_count INTEGER,
  -- Route
  origin_location VARCHAR(200) NOT NULL,
  destination_location VARCHAR(200) NOT NULL,
  distance_km NUMERIC(10,2),
  estimated_transit_days INTEGER,
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, DISPATCHED, IN_TRANSIT, AT_BORDER, DELIVERED, CANCELLED
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  -- Assignments
  assigned_driver VARCHAR(100),
  driver_phone VARCHAR(20),
  vehicle_registration VARCHAR(20),
  trailer_registration VARCHAR(20),
  -- Financial
  transport_cost NUMERIC(14,2),
  cost_currency VARCHAR(3) NOT NULL DEFAULT 'TZS',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_road_consignments_number ON road_consignments(tenant_id, consignment_number);
CREATE INDEX IF NOT EXISTS idx_road_consignments_tenant ON road_consignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_road_consignments_shipment ON road_consignments(shipment_id);
CREATE INDEX IF NOT EXISTS idx_road_consignments_status ON road_consignments(tenant_id, status);

-- Trips: individual legs of a consignment journey
CREATE TABLE IF NOT EXISTS consignment_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id UUID NOT NULL REFERENCES road_consignments(id) ON DELETE CASCADE,
  trip_number INTEGER NOT NULL,
  from_location VARCHAR(200) NOT NULL,
  to_location VARCHAR(200) NOT NULL,
  distance_km NUMERIC(10,2),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  driver_name VARCHAR(100),
  vehicle VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_consignment ON consignment_trips(consignment_id);

-- Border crossings log
CREATE TABLE IF NOT EXISTS border_crossings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id UUID NOT NULL REFERENCES road_consignments(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES consignment_trips(id),
  border_name VARCHAR(100) NOT NULL, -- e.g. 'Tunduma', 'Namanga', 'Rusumo'
  country_from VARCHAR(3) NOT NULL,
  country_to VARCHAR(3) NOT NULL,
  arrival_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, CLEARED, DELAYED, REJECTED
  delay_reason TEXT,
  customs_ref VARCHAR(50),
  documents_checked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_border_crossings_consignment ON border_crossings(consignment_id);
CREATE INDEX IF NOT EXISTS idx_border_crossings_status ON border_crossings(status);

-- ─────────────────────────────────────────────────
-- 4. VENDOR BILLS & CLIENT INVOICES (Ops-to-Finance)
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_number VARCHAR(30) NOT NULL,
  shipment_id UUID,
  vendor_name VARCHAR(200) NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'TZS',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, PAID
  due_date DATE,
  paid_at TIMESTAMPTZ,
  expense_ids JSONB DEFAULT '[]', -- linked expense IDs
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_bills_tenant ON vendor_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_shipment ON vendor_bills(shipment_id);

CREATE TABLE IF NOT EXISTS client_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number VARCHAR(30) NOT NULL,
  shipment_id UUID,
  customer_id UUID NOT NULL REFERENCES customers(id),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'TZS',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SENT, PAID, OVERDUE, CANCELLED
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  expense_ids JSONB DEFAULT '[]', -- linked expense IDs
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_invoices_tenant ON client_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_invoices_shipment ON client_invoices(shipment_id);
CREATE INDEX IF NOT EXISTS idx_client_invoices_customer ON client_invoices(customer_id);

-- ─────────────────────────────────────────────────
-- Enable RLS on all new tables
-- ─────────────────────────────────────────────────
ALTER TABLE demurrage_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE border_crossings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_demurrage_tariffs' AND polrelid = 'demurrage_tariffs'::regclass) THEN
    CREATE POLICY tenant_isolation_demurrage_tariffs ON demurrage_tariffs
      USING (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_container_tracking' AND polrelid = 'container_tracking'::regclass) THEN
    CREATE POLICY tenant_isolation_container_tracking ON container_tracking
      USING (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_quotations' AND polrelid = 'quotations'::regclass) THEN
    CREATE POLICY tenant_isolation_quotations ON quotations
      USING (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_road_consignments' AND polrelid = 'road_consignments'::regclass) THEN
    CREATE POLICY tenant_isolation_road_consignments ON road_consignments
      USING (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_vendor_bills' AND polrelid = 'vendor_bills'::regclass) THEN
    CREATE POLICY tenant_isolation_vendor_bills ON vendor_bills
      USING (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_client_invoices' AND polrelid = 'client_invoices'::regclass) THEN
    CREATE POLICY tenant_isolation_client_invoices ON client_invoices
      USING (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
