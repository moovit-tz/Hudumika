-- 300_budgets.sql
-- No budgeting concept existed at all — the only prior trace was dead
-- placeholder BUDGET/VARIANCE labels sitting unused in the orphaned
-- FinancePlaceholder.tsx (deleted in M4). One budget per fiscal year, one
-- line per (account, month) — actuals are never stored here, only
-- computed live against journal_lines/journal_entries when compared.
-- RLS from day one, same as every table this program adds.

CREATE TABLE budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          VARCHAR(300) NOT NULL,
  fiscal_year   INT NOT NULL,
  entity_id     UUID REFERENCES accounting_entities(id),
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, fiscal_year, entity_id)
);

CREATE TABLE budget_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id     UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_code  VARCHAR(20) NOT NULL,
  period_month  INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  UNIQUE(budget_id, account_code, period_month)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON budgets
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON budget_lines
  USING (EXISTS (
    SELECT 1 FROM budgets b
    WHERE b.id = budget_lines.budget_id
      AND b.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
