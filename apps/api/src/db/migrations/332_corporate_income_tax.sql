-- Migration 332: M2 of the FinOps corporate-tax build-out — corporate
-- income tax (CIT). Backfills the two new COA rows (gl.service.ts's
-- STANDARD_COA only reaches brand-new tenants — see 294_payroll_gl_accounts.sql
-- for why every existing tenant needs the same rows inserted directly), then
-- adds the CIT-specific tables.
--
-- Same two-layer rate-provenance shape as 331_withholding_tax.sql: a global,
-- non-tenant-scoped reference table (real, dated, sourced) feeding a
-- tenant-scoped, effective-dated, editable table. Tanzania CIT figures below
-- are real (PwC Worldwide Tax Summaries, "Tanzania - Corporate - Taxes on
-- corporate income", checked 2026-08-25) — not fabricated, not gospel either.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2400', 'Income Tax Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5950', 'Income Tax Expense', 'EXPENSE', 'TAX_EXPENSE', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS cit_rate_reference (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction CHAR(2) NOT NULL,
  category    VARCHAR(40) NOT NULL,
  rate_pct    NUMERIC(6,3) NOT NULL,
  -- How long a preferential rate lasts from the qualifying event (listing,
  -- start of production) before reverting to STANDARD. Null for STANDARD
  -- and AMT_TURNOVER_BASED, which are not time-limited.
  duration_years SMALLINT,
  as_of       DATE NOT NULL,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cit_rate_reference_rate_sane CHECK (rate_pct >= 0 AND rate_pct <= 100),
  UNIQUE (jurisdiction, category)
);
COMMENT ON TABLE cit_rate_reference IS
  'Reference data for onboarding, not a source of truth — same convention as wht_rate_reference. Every row carries as_of and source.';

INSERT INTO cit_rate_reference (jurisdiction, category, rate_pct, duration_years, as_of, source) VALUES
  ('TZ', 'STANDARD',                    30.000, NULL, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — Tanzania Corporate Taxes on Corporate Income'),
  ('TZ', 'NEWLY_LISTED_DSE',            25.000, 3,    DATE '2026-08-25', 'PwC Worldwide Tax Summaries — companies newly listed on the Dar es Salaam Stock Exchange with >=30% of shares issued to the public, for 3 years from the year of listing'),
  ('TZ', 'VEHICLE_ASSEMBLER',           10.000, 5,    DATE '2026-08-25', 'PwC Worldwide Tax Summaries — assemblers of vehicles, tractors, fishing boats, for 5 years from commencement of production'),
  ('TZ', 'PHARMA_LEATHER_MANUFACTURER', 20.000, 5,    DATE '2026-08-25', 'PwC Worldwide Tax Summaries — pharmaceutical or leather manufacturers, for 5 years from commencement of production'),
  ('TZ', 'AMT_TURNOVER_BASED',          1.000,  NULL, DATE '2026-08-25', 'PwC Worldwide Tax Summaries — alternative minimum tax of 1% of turnover for companies in perpetual/persistent loss (three consecutive years of tax losses)')
ON CONFLICT (jurisdiction, category) DO NOTHING;

-- Tenant-scoped, effective-dated, editable — matching wht_rates' own shape.
-- Not seeded automatically (a fresh tenant has none until they adopt a
-- reference category or set their own); computeCitReturn falls back to the
-- STANDARD reference row when a tenant has configured nothing, and flags
-- that fallback explicitly in its result rather than silently assuming it.
CREATE TABLE IF NOT EXISTS cit_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction   CHAR(2) NOT NULL,
  category       VARCHAR(40) NOT NULL,
  rate_pct       NUMERIC(6,3) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cit_rates_rate_sane CHECK (rate_pct >= 0 AND rate_pct <= 100),
  UNIQUE (tenant_id, jurisdiction, category, effective_from)
);
CREATE INDEX IF NOT EXISTS cit_rates_lookup ON cit_rates (tenant_id, jurisdiction, effective_from);

ALTER TABLE cit_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cit_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cit_rates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Manual book-to-tax adjustments not automatable in v1 (disallowed expenses,
-- fines/penalties, exempt income). The depreciation adjustment is computed,
-- not typed here — see cit.service.ts's computeTaxDepreciation().
CREATE TABLE IF NOT EXISTS cit_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  category     VARCHAR(24) NOT NULL,
  description  TEXT NOT NULL,
  -- Signed: positive adds to taxable income (a disallowed expense, a fine —
  -- the book already deducted it, tax does not allow the deduction),
  -- negative reduces it (exempt income the book already counted as revenue).
  amount       NUMERIC(16,2) NOT NULL,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cit_adjustments_category_valid CHECK (category IN ('DISALLOWED_EXPENSE', 'FINE_PENALTY', 'EXEMPT_INCOME', 'OTHER')),
  CONSTRAINT cit_adjustments_dates_ordered CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS cit_adjustments_period ON cit_adjustments (tenant_id, period_start, period_end);

ALTER TABLE cit_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cit_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cit_adjustments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- The resolved computation, stored rather than recomputed on every read —
-- same "a filed computation that quietly rewrites history" avoidance as
-- payroll_payslips. DRAFT is a recomputable preview (compute can be called
-- again and overwrites it); ACCRUED means the GL entry has posted and the
-- figures are now locked.
CREATE TABLE IF NOT EXISTS cit_returns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  accounting_profit     NUMERIC(16,2) NOT NULL,
  book_depreciation     NUMERIC(16,2) NOT NULL DEFAULT 0,
  tax_depreciation      NUMERIC(16,2) NOT NULL DEFAULT 0,
  adjustments_total     NUMERIC(16,2) NOT NULL DEFAULT 0,
  taxable_income        NUMERIC(16,2) NOT NULL,
  rate_category         VARCHAR(40) NOT NULL,
  rate_pct              NUMERIC(6,3) NOT NULL,
  rate_source           VARCHAR(20) NOT NULL DEFAULT 'TENANT',
  is_amt                BOOLEAN NOT NULL DEFAULT false,
  turnover              NUMERIC(16,2),
  tax_liability         NUMERIC(16,2) NOT NULL,
  status                VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  journal_entry_id      UUID REFERENCES journal_entries(id),
  computed_by           UUID,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  accrued_at            TIMESTAMPTZ,
  CONSTRAINT cit_returns_status_valid CHECK (status IN ('DRAFT', 'ACCRUED')),
  CONSTRAINT cit_returns_rate_source_valid CHECK (rate_source IN ('TENANT', 'REFERENCE_DEFAULT')),
  CONSTRAINT cit_returns_dates_ordered CHECK (period_end >= period_start),
  UNIQUE (tenant_id, period_start, period_end)
);

ALTER TABLE cit_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cit_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cit_returns
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Quarterly provisional payments — TRA requires estimated tax paid in
-- instalments through the year, ahead of the final return.
CREATE TABLE IF NOT EXISTS cit_installments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cit_return_id  UUID REFERENCES cit_returns(id),
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  due_date       DATE,
  amount         NUMERIC(16,2) NOT NULL,
  status         VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  paid_at        TIMESTAMPTZ,
  reference      VARCHAR(200),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cit_installments_status_valid CHECK (status IN ('PENDING', 'PAID')),
  CONSTRAINT cit_installments_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS cit_installments_tenant ON cit_installments (tenant_id, period_start);

ALTER TABLE cit_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cit_installments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cit_installments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
