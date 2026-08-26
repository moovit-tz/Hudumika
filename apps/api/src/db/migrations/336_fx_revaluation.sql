-- Migration 336: M7 of the corporate-tax build-out — period-end FX
-- revaluation of open foreign-currency AR/AP. New COA 5202 Foreign
-- Exchange Gain/(Loss), backfilled the same way every other new account
-- in this program has been.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5202', 'Foreign Exchange Gain/(Loss)', 'EXPENSE', 'FINANCE_COST', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- One row per open document (or cash account) per revaluation run — not
-- one row per account+period, because the "comparison_rate = prior
-- revaluation's rate" correctness rule (the naive-implementation trap the
-- plan explicitly calls out) only makes sense tracked per monetary item:
-- an account-level aggregate can't recover which underlying document's
-- history a rate belongs to once documents settle and new ones open
-- between periods. UNIQUE(subject) per period_date makes a same-date
-- re-run idempotent, matching fixed_asset_depreciation_entries' own
-- UNIQUE(asset_id, period_date) shape.
CREATE TABLE IF NOT EXISTS fx_revaluations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_date       DATE NOT NULL,
  subject_type      VARCHAR(20) NOT NULL,
  subject_id        UUID NOT NULL,
  currency          VARCHAR(10) NOT NULL,
  open_balance_fc   NUMERIC(18,2) NOT NULL,
  comparison_rate   NUMERIC(18,6) NOT NULL,
  current_rate      NUMERIC(18,6) NOT NULL,
  gain_loss         NUMERIC(16,2) NOT NULL,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fx_revaluations_subject_type_valid CHECK (subject_type IN ('AR_INVOICE', 'AP_BILL')),
  UNIQUE (tenant_id, subject_type, subject_id, period_date)
);
CREATE INDEX IF NOT EXISTS fx_revaluations_subject ON fx_revaluations (tenant_id, subject_type, subject_id, period_date DESC);

ALTER TABLE fx_revaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_revaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON fx_revaluations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
