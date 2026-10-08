ALTER TABLE finance_expense_report_items ADD COLUMN customer_id uuid REFERENCES customers(id);
ALTER TABLE finance_expense_report_items ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
CREATE INDEX ON finance_expense_report_items (tenant_id,customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX ON finance_expense_report_items (tenant_id,supplier_id) WHERE supplier_id IS NOT NULL;
