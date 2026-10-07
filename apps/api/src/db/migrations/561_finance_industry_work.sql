CREATE TABLE finance_industry_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  industry text NOT NULL CHECK (industry IN ('retail','wholesale','manufacturing','warehousing','professional_services','consulting','printing')),
  reference text NOT NULL,
  name text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','cancelled')),
  currency text NOT NULL DEFAULT 'TZS' CHECK (currency ~ '^[A-Z]{3}$'),
  budget numeric(18,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  due_date date,
  specifications jsonb NOT NULL DEFAULT '{}',
  invoice_id uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,reference), UNIQUE (tenant_id,id)
);
CREATE TABLE finance_industry_work_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  work_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('service','time','material','expense','milestone')),
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  rate numeric(18,4) NOT NULL CHECK (rate >= 0),
  cost_rate numeric(18,4) NOT NULL CHECK (cost_rate >= 0),
  billable boolean NOT NULL DEFAULT true,
  approved boolean NOT NULL DEFAULT false,
  work_date date NOT NULL,
  invoice_id uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work(tenant_id,id)
);
CREATE INDEX ON finance_industry_work (tenant_id,industry,status,created_at DESC);
CREATE INDEX ON finance_industry_work_lines (tenant_id,work_id);
ALTER TABLE finance_industry_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_industry_work FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_industry_work USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE finance_industry_work_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_industry_work_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_industry_work_lines USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
