-- HS Codes & Tanzania Customs Database
-- East Africa Community Common External Tariff (EAC CET)
-- Based on HS 2022 nomenclature with Tanzania-specific rates

-- Master HS code table (chapters + headings + subheadings)
CREATE TABLE IF NOT EXISTS hs_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) NOT NULL UNIQUE,          -- e.g. "8471.30" or "84" or "8471"
  level SMALLINT NOT NULL,                   -- 2=chapter, 4=heading, 6=subheading, 8=tariff line
  description TEXT NOT NULL,
  parent_code VARCHAR(12),                   -- parent chapter/heading code
  -- Tanzania EAC CET rates
  import_duty_rate NUMERIC(5,2) DEFAULT 0,   -- % import duty
  vat_rate NUMERIC(5,2) DEFAULT 18,          -- % VAT (18 standard, 0 exempt)
  excise_rate NUMERIC(5,2) DEFAULT 0,        -- % excise duty
  rdl_rate NUMERIC(5,2) DEFAULT 1.5,         -- Railway Development Levy
  cpf_rate NUMERIC(5,2) DEFAULT 0.6,         -- Customs Processing Fee
  ifs_rate NUMERIC(5,2) DEFAULT 0,           -- Infrastructure Fund Surcharge
  -- Control/permits
  pvoc_required BOOLEAN DEFAULT FALSE,       -- Pre-Verification of Conformity
  di_required BOOLEAN DEFAULT FALSE,         -- Destination Inspection
  permits TEXT,                              -- Comma-separated: GCLA, TBS, CAMARTEC, etc.
  restrictions TEXT,                         -- Import restrictions note
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Penalty records (tracked violations per tenant)
CREATE TABLE IF NOT EXISTS customs_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  shipment_ref VARCHAR(100),
  hs_code VARCHAR(12),
  violation_type VARCHAR(50) NOT NULL,       -- under_declaration, misclassification, late_payment, no_pvoc, no_di
  declared_value NUMERIC(15,2),
  actual_value NUMERIC(15,2),
  declared_hs VARCHAR(12),
  actual_hs VARCHAR(12),
  duty_shortfall NUMERIC(15,2) DEFAULT 0,
  penalty_amount NUMERIC(15,2) DEFAULT 0,
  late_months INT DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'TZS',
  status VARCHAR(20) DEFAULT 'open',        -- open, paid, appealing, waived
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Landed cost calculations history
CREATE TABLE IF NOT EXISTS landed_cost_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  shipment_ref VARCHAR(100),
  hs_code VARCHAR(12),
  description TEXT,
  cif_usd NUMERIC(15,2),
  fx_rate NUMERIC(12,4),
  cif_tzs NUMERIC(15,2),
  duty_rate NUMERIC(5,2),
  duty_amount NUMERIC(15,2),
  vat_amount NUMERIC(15,2),
  rdl_amount NUMERIC(15,2),
  cpf_amount NUMERIC(15,2),
  icd_amount NUMERIC(15,2),
  wharfage_amount NUMERIC(15,2),
  total_tzs NUMERIC(15,2),
  qty NUMERIC(10,2) DEFAULT 1,
  per_unit_tzs NUMERIC(15,2),
  source VARCHAR(20) DEFAULT 'calculator',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vessel positions cache (from AISstream)
CREATE TABLE IF NOT EXISTS vessel_positions (
  mmsi VARCHAR(20) PRIMARY KEY,
  imo VARCHAR(20),
  vessel_name VARCHAR(200),
  vessel_type VARCHAR(50),
  latitude NUMERIC(10,6),
  longitude NUMERIC(11,6),
  speed NUMERIC(6,2),
  course NUMERIC(6,2),
  heading NUMERIC(6,2),
  nav_status VARCHAR(50),
  destination VARCHAR(200),
  eta_raw VARCHAR(100),
  draught NUMERIC(5,2),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hs_codes_code ON hs_codes(code);
CREATE INDEX IF NOT EXISTS idx_hs_codes_level ON hs_codes(level);
CREATE INDEX IF NOT EXISTS idx_hs_codes_parent ON hs_codes(parent_code);
CREATE INDEX IF NOT EXISTS idx_hs_codes_search ON hs_codes USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_customs_penalties_tenant ON customs_penalties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landed_cost_tenant ON landed_cost_records(tenant_id);
