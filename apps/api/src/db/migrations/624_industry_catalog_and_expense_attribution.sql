ALTER TABLE products ADD COLUMN industry_key text;
ALTER TABLE products ADD COLUMN industry_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD CONSTRAINT products_industry_attributes_object CHECK (jsonb_typeof(industry_attributes) = 'object');
CREATE INDEX products_tenant_industry_idx ON products (tenant_id, industry_key);
ALTER TABLE finance_expenses ADD COLUMN industry_key text;
ALTER TABLE finance_expenses ADD COLUMN industry_work_id uuid REFERENCES finance_industry_work(id) ON DELETE RESTRICT;
CREATE INDEX finance_expenses_tenant_industry_work_idx ON finance_expenses (tenant_id, industry_work_id);
ALTER TABLE sales_invoice_lines ADD COLUMN description text;
