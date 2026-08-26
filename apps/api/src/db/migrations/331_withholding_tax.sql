-- Migration 331: M1 of the FinOps corporate-tax build-out — withholding tax
-- (WHT) on vendor payments. Posts to the existing `2300 Withholding Tax
-- Payable` account (seeded by STANDARD_COA, confirmed unused until now).
--
-- Same two-layer rate-provenance shape as tax_jurisdictions/tax_codes
-- (187_tax_registrations.sql): a global, non-tenant-scoped reference table
-- ("a rate is a fact about the world," not authoritative, every row dated
-- and sourced) feeding a tenant-scoped, effective-dated, editable table
-- modeled on payroll_tax_bands (195_statutory_payroll.sql).
--
-- Rates below are real, sourced Tanzania figures (PwC Worldwide Tax
-- Summaries, "Tanzania - Corporate - Withholding taxes", checked 2026-08-25)
-- — not fabricated, but also not gospel: as_of/source exist precisely so a
-- tenant's own finance team can verify and override before relying on them,
-- same as every other rate table in this platform.

CREATE TABLE IF NOT EXISTS wht_rate_reference (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction CHAR(2) NOT NULL,
  category    VARCHAR(40) NOT NULL,
  payee_type  VARCHAR(16) NOT NULL DEFAULT 'RESIDENT',
  rate_pct    NUMERIC(6,3) NOT NULL,
  as_of       DATE NOT NULL,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wht_rate_reference_payee_valid CHECK (payee_type IN ('RESIDENT', 'NON_RESIDENT')),
  CONSTRAINT wht_rate_reference_rate_sane CHECK (rate_pct >= 0 AND rate_pct <= 100),
  UNIQUE (jurisdiction, category, payee_type)
);
COMMENT ON TABLE wht_rate_reference IS
  'Reference data for onboarding, not a source of truth — same convention as tax_jurisdictions. Every row carries as_of and source.';

INSERT INTO wht_rate_reference (jurisdiction, category, payee_type, rate_pct, as_of, source) VALUES
  ('TZ', 'SERVICE_FEES',              'RESIDENT',     5.000,  DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'SERVICE_FEES',              'NON_RESIDENT', 15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_LAND_BUILDING',        'RESIDENT',     10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_LAND_BUILDING',        'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_EQUIPMENT_MACHINERY',  'RESIDENT',     10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_EQUIPMENT_MACHINERY',  'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_MOTOR_VEHICLE',        'RESIDENT',     10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_MOTOR_VEHICLE',        'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_AIRCRAFT',             'RESIDENT',     10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_AIRCRAFT',             'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_OTHER',                'RESIDENT',     0.000,  DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'RENT_OTHER',                'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'ROYALTIES',                 'RESIDENT',     15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'ROYALTIES',                 'NON_RESIDENT', 15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'DIRECTOR_FEES',             'RESIDENT',     15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'DIRECTOR_FEES',             'NON_RESIDENT', 15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'INSURANCE_PREMIUMS',        'RESIDENT',     0.000,  DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'INSURANCE_PREMIUMS',        'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'NATURAL_RESOURCE_PAYMENTS', 'RESIDENT',     15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'NATURAL_RESOURCE_PAYMENTS', 'NON_RESIDENT', 15.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'INTEREST',                  'RESIDENT',     10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'INTEREST',                  'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'DIVIDENDS_CONTROLLING',     'RESIDENT',     5.000,  DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes (25%+ shareholding)'),
  ('TZ', 'DIVIDENDS_CONTROLLING',     'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes (25%+ shareholding)'),
  ('TZ', 'DIVIDENDS_DSE_LISTED',      'RESIDENT',     5.000,  DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'DIVIDENDS_DSE_LISTED',      'NON_RESIDENT', 5.000,  DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'DIVIDENDS_OTHER',           'RESIDENT',     10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes'),
  ('TZ', 'DIVIDENDS_OTHER',           'NON_RESIDENT', 10.000, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Withholding Taxes')
ON CONFLICT (jurisdiction, category, payee_type) DO NOTHING;

-- Tenant-scoped, effective-dated, editable — the actual rate a bill payment
-- looks up. Not seeded automatically here (a fresh tenant has none until
-- they explicitly adopt the reference defaults or set their own), matching
-- payroll_tax_bands' own "the tenant's own table is the truth" shape.
CREATE TABLE IF NOT EXISTS wht_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction   CHAR(2) NOT NULL,
  category       VARCHAR(40) NOT NULL,
  payee_type     VARCHAR(16) NOT NULL DEFAULT 'RESIDENT',
  rate_pct       NUMERIC(6,3) NOT NULL,
  -- Only PAYMENT is implemented in v1 (deduction happens when a bill is
  -- paid). Some TRA categories withhold at accrual instead — this column
  -- exists now so that's additive later, not a breaking schema change.
  trigger        VARCHAR(16) NOT NULL DEFAULT 'PAYMENT',
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wht_rates_payee_valid CHECK (payee_type IN ('RESIDENT', 'NON_RESIDENT')),
  CONSTRAINT wht_rates_trigger_valid CHECK (trigger IN ('PAYMENT', 'ACCRUAL')),
  CONSTRAINT wht_rates_rate_sane CHECK (rate_pct >= 0 AND rate_pct <= 100),
  UNIQUE (tenant_id, jurisdiction, category, payee_type, effective_from)
);
CREATE INDEX IF NOT EXISTS wht_rates_lookup ON wht_rates (tenant_id, jurisdiction, category, payee_type, effective_from);

ALTER TABLE wht_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON wht_rates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- NULL means "not yet classified" — matching sales_invoice_lines.tax_code_id
-- and supplier_bill_lines.tax_code_id's own established convention — not
-- "not applicable." A bill line only attracts WHT once someone tags it.
ALTER TABLE supplier_bill_lines ADD COLUMN IF NOT EXISTS wht_rate_id UUID REFERENCES wht_rates(id);

-- One row per (bill, payment) that actually withheld something — not one
-- row per bill line, since WHT is deducted from the payment (a bill can be
-- paid in installments; each installment withholds its proportional share).
CREATE TABLE IF NOT EXISTS wht_deductions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id           UUID NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
  bill_payment_id   UUID NOT NULL REFERENCES bill_payments(id) ON DELETE CASCADE,
  supplier_id       UUID,
  gross_amount      NUMERIC(16,2) NOT NULL,
  wht_amount        NUMERIC(16,2) NOT NULL,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  certificate_number VARCHAR(50),
  certificate_issued_at TIMESTAMPTZ,
  remittance_id     UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bill_payment_id)
);
CREATE INDEX IF NOT EXISTS wht_deductions_bill ON wht_deductions(bill_id);
CREATE INDEX IF NOT EXISTS wht_deductions_supplier ON wht_deductions(supplier_id);

ALTER TABLE wht_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_deductions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON wht_deductions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- A batch payment of accumulated withheld tax to TRA.
CREATE TABLE IF NOT EXISTS wht_remittances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction   CHAR(2) NOT NULL DEFAULT 'TZ',
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  total_amount   NUMERIC(16,2) NOT NULL,
  paid_at        TIMESTAMPTZ,
  reference      VARCHAR(200),
  status         VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wht_remittances_status_valid CHECK (status IN ('PENDING', 'PAID'))
);

ALTER TABLE wht_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_remittances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON wht_remittances
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE wht_deductions ADD CONSTRAINT wht_deductions_remittance_fkey
  FOREIGN KEY (remittance_id) REFERENCES wht_remittances(id);
