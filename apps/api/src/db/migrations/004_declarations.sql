-- Migration 004: TANESW Declaration Management
-- Adds declarations, declaration_items, declaration_notices, tax_lines,
-- and declaration_attachments tables for customs declaration tracking.

-- ═══════════════════════════════════════════════════════════════
-- Add TANCIS fields to shipment_cases
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS tancis_ref VARCHAR(100);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS tansad_number VARCHAR(100);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS selectivity_channel VARCHAR(10);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS declaration_id UUID;

-- ═══════════════════════════════════════════════════════════════
-- Declarations (mirrors TANESW Declaration Registration form)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- TANCIS Reference
  tancis_ref VARCHAR(100) NOT NULL,
  tansad_number VARCHAR(100),
  declaration_mode VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  tansad_form_type VARCHAR(5) NOT NULL DEFAULT 'G',
  clearing_office VARCHAR(100) NOT NULL,
  reference_date DATE NOT NULL,

  -- General
  cl_plan VARCHAR(50),
  total_packages INTEGER NOT NULL DEFAULT 0,
  package_type VARCHAR(50),
  gross_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
  net_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
  ucr_number VARCHAR(100),
  no_of_items INTEGER NOT NULL DEFAULT 0,

  -- Trade Operators / Country
  consignment_country VARCHAR(5) NOT NULL,
  country_of_export VARCHAR(5) NOT NULL,
  trading_country VARCHAR(5),
  country_of_destination VARCHAR(5) NOT NULL,
  exporter_tin VARCHAR(50),
  exporter_name VARCHAR(255),
  exporter_address TEXT,
  importer_tin VARCHAR(50) NOT NULL,
  importer_name VARCHAR(255) NOT NULL,
  importer_address TEXT,
  declarant_tin VARCHAR(50) NOT NULL,
  declarant_name VARCHAR(255) NOT NULL,
  declarant_address TEXT,

  -- Financial
  delivery_term VARCHAR(10),
  delivery_place VARCHAR(255),
  invoice_number VARCHAR(100),
  invoice_date DATE,
  total_invoice_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  invoice_currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(15,5) NOT NULL DEFAULT 1,
  payment_method VARCHAR(50),
  payment_bank VARCHAR(255),
  payment_bank_account VARCHAR(100),
  security_distinction_type VARCHAR(50),
  security_account_no VARCHAR(100),
  nature_of_transaction VARCHAR(100),

  -- Valuation Note
  freight_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  freight_currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  insurance_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  insurance_currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  other_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_charges_currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
  deductions_currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  total_customs_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  self_assessment BOOLEAN NOT NULL DEFAULT false,

  -- Transportation
  transport_mode VARCHAR(50),
  identity_of_transport VARCHAR(100),
  nationality_of_transport VARCHAR(5),
  arrival_date DATE,
  crn VARCHAR(100),
  bl_number VARCHAR(100),
  vessel_name VARCHAR(255),
  portal_of_bl VARCHAR(10),
  shipment_place VARCHAR(100),
  discharge_place VARCHAR(100),
  discharge_date DATE,
  entry_office VARCHAR(100),
  location_of_goods VARCHAR(255),
  total_container_count INTEGER,
  warehouse VARCHAR(255),
  previous_warehouse VARCHAR(255),
  period_days INTEGER,
  cargo_receipt_ref VARCHAR(100),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  selectivity_channel VARCHAR(10),

  -- Timestamps
  declared_at TIMESTAMPTZ,
  assessed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_declarations_tenant ON declarations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_declarations_shipment ON declarations(shipment_id);
CREATE INDEX IF NOT EXISTS idx_declarations_tancis_ref ON declarations(tancis_ref);
CREATE INDEX IF NOT EXISTS idx_declarations_tansad ON declarations(tansad_number);
CREATE INDEX IF NOT EXISTS idx_declarations_status ON declarations(status);
CREATE INDEX IF NOT EXISTS idx_declarations_importer ON declarations(importer_tin);

-- ═══════════════════════════════════════════════════════════════
-- Declaration Items (TANSAD line items with HS codes)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS declaration_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL,

  -- Classification
  hs_code VARCHAR(20) NOT NULL,
  commodity_description TEXT,
  marks_and_numbers_1 VARCHAR(255),
  marks_and_numbers_2 VARCHAR(255),
  country_of_origin VARCHAR(5) NOT NULL,
  cpc_code VARCHAR(10) NOT NULL,

  -- Details
  preference_ref VARCHAR(100),
  valuation_method VARCHAR(50),
  brand_name VARCHAR(255),
  purpose_of_submission VARCHAR(100),
  preceding_tansad_no VARCHAR(100),
  preceding_tansad_date DATE,
  preceding_item_no INTEGER,
  letter_ref_no VARCHAR(100),
  vat_deferment_apply_no VARCHAR(100),

  -- Quantities & Values
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(10) NOT NULL,
  base_of_duty NUMERIC(15,2),
  specific_code VARCHAR(50),
  gross_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
  net_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
  customs_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  statistical_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_vehicle BOOLEAN NOT NULL DEFAULT false,
  drawback_specific_code VARCHAR(50),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_declaration_item UNIQUE (declaration_id, item_number)
);

CREATE INDEX IF NOT EXISTS idx_decl_items_declaration ON declaration_items(declaration_id);
CREATE INDEX IF NOT EXISTS idx_decl_items_hs ON declaration_items(hs_code);

-- ═══════════════════════════════════════════════════════════════
-- Declaration Item Models (sub-details per item)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS declaration_item_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES declaration_items(id) ON DELETE CASCADE,
  model_number INTEGER NOT NULL,
  standard_commodity VARCHAR(255),
  model_specification TEXT,
  component VARCHAR(255),
  preceding_model_no VARCHAR(100),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(10),
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  invoice_price NUMERIC(15,2) NOT NULL DEFAULT 0,

  CONSTRAINT unique_item_model UNIQUE (item_id, model_number)
);

-- ═══════════════════════════════════════════════════════════════
-- Declaration Notices (Selectivity, Assessment, Release, etc.)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS declaration_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Notice Identity
  notice_type VARCHAR(30) NOT NULL,
  notice_number VARCHAR(100) NOT NULL,
  tancis_ref VARCHAR(100) NOT NULL,
  importer_tin VARCHAR(50) NOT NULL,
  notice_date TIMESTAMPTZ NOT NULL,
  declare_date TIMESTAMPTZ NOT NULL,

  -- Assessment totals
  total_tax_amount NUMERIC(15,2),

  -- Selectivity
  selectivity_channel VARCHAR(10),

  -- Payment
  bill_number VARCHAR(100),
  bill_date DATE,
  bill_tax_amount NUMERIC(15,2),
  paid_amount NUMERIC(15,2),
  payment_receipt VARCHAR(100),

  -- Query
  query_text TEXT,
  response_deadline TIMESTAMPTZ,

  -- Status
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decl_notices_declaration ON declaration_notices(declaration_id);
CREATE INDEX IF NOT EXISTS idx_decl_notices_tenant ON declaration_notices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_decl_notices_shipment ON declaration_notices(shipment_id);
CREATE INDEX IF NOT EXISTS idx_decl_notices_type ON declaration_notices(notice_type);
CREATE INDEX IF NOT EXISTS idx_decl_notices_date ON declaration_notices(notice_date DESC);

-- ═══════════════════════════════════════════════════════════════
-- Tax Lines (Assessment Notice breakdown)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tax_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES declaration_notices(id) ON DELETE CASCADE,
  tax_type VARCHAR(20) NOT NULL,
  hs_code VARCHAR(20),
  duty_rate_code VARCHAR(50),
  rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  base_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  mot INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tax_lines_notice ON tax_lines(notice_id);

-- ═══════════════════════════════════════════════════════════════
-- Declaration Attachments (TANESW Attached File tab)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS declaration_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  document_no INTEGER NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  document_description TEXT,
  filename VARCHAR(500),
  storage_key VARCHAR(500),
  item_number INTEGER,
  issuing_organization VARCHAR(255),
  issue_date DATE,
  registration_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decl_attach_declaration ON declaration_attachments(declaration_id);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_notices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'declarations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON declarations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'declaration_notices'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON declaration_notices
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
