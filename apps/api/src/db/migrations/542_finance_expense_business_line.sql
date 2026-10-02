-- Business lines are management dimensions, not legal entities or paid
-- modules. Persist the selected dimension on the source transaction so a GL
-- reversal/re-post can reproduce the same dimensional attribution.
ALTER TABLE finance_expenses
  ADD COLUMN IF NOT EXISTS business_line_id UUID REFERENCES finance_business_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_expenses_business_line
  ON finance_expenses(tenant_id, business_line_id, expense_date DESC)
  WHERE business_line_id IS NOT NULL;
