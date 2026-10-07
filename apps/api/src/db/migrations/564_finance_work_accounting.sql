INSERT INTO chart_of_accounts (tenant_id,code,name,type,subtype,normal_balance,is_system)
SELECT id,'5020','Direct engagement costs','EXPENSE','COST_OF_SERVICES','DEBIT',true FROM tenants
ON CONFLICT (tenant_id,code) DO NOTHING;
ALTER TABLE sales_invoices ADD COLUMN industry_work_id uuid;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_industry_work_fk
FOREIGN KEY (tenant_id, industry_work_id) REFERENCES finance_industry_work(tenant_id,id);
ALTER TABLE finance_industry_work_lines ADD COLUMN cost_journal_id uuid REFERENCES journal_entries(id);
CREATE INDEX ON sales_invoices (tenant_id,industry_work_id) WHERE industry_work_id IS NOT NULL;
