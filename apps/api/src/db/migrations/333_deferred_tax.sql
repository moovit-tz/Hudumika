-- Migration 333: M3 of the FinOps corporate-tax build-out — deferred tax,
-- fixed-asset timing differences only (see deferred-tax.service.ts's own
-- header for the explicit scope disclosure this is not the whole picture).
-- Same backfill-existing-tenants pattern as 332_corporate_income_tax.sql.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '1250', 'Deferred Tax Asset', 'ASSET', 'DEFERRED_TAX', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2450', 'Deferred Tax Liability', 'LIABILITY', 'DEFERRED_TAX', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5951', 'Deferred Tax Expense', 'EXPENSE', 'TAX_EXPENSE', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- One row per period-end computation — the position (gross temporary
-- difference, rate, resulting asset/liability balance) *and* the movement
-- actually posted, which is not always the same as "this period's position
-- minus last period's row" since the movement is computed off the real
-- current GL balance (deferred-tax.service.ts's own "post the delta, not
-- the balance" rule) — a manual correction posted directly to 1250/2450
-- between runs must not cause drift, so the stored prior figure here is a
-- record of what was read, not the sole source for the next computation.
CREATE TABLE IF NOT EXISTS deferred_tax_computations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  as_of_date               DATE NOT NULL,
  rate_pct                 NUMERIC(6,3) NOT NULL,
  gross_temporary_difference NUMERIC(16,2) NOT NULL,
  target_dta_balance       NUMERIC(16,2) NOT NULL DEFAULT 0,
  target_dtl_balance       NUMERIC(16,2) NOT NULL DEFAULT 0,
  prior_dta_balance        NUMERIC(16,2) NOT NULL DEFAULT 0,
  prior_dtl_balance        NUMERIC(16,2) NOT NULL DEFAULT 0,
  journal_entry_id         UUID REFERENCES journal_entries(id),
  computed_by              UUID,
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, as_of_date)
);

ALTER TABLE deferred_tax_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deferred_tax_computations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON deferred_tax_computations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
