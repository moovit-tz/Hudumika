INSERT INTO chart_of_accounts (tenant_id,code,name,type,subtype,normal_balance,is_system)
SELECT id,'1310','Production work in progress','ASSET','CURRENT_ASSET','DEBIT',true FROM tenants
ON CONFLICT (tenant_id,code) DO NOTHING;
CREATE TABLE finance_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  work_id uuid NOT NULL, output_item_id uuid NOT NULL REFERENCES inventory_items(id),
  source_location_id uuid NOT NULL REFERENCES inventory_locations(id),
  target_location_id uuid NOT NULL REFERENCES inventory_locations(id),
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity numeric(18,4) CHECK (actual_quantity > 0),
  output_batch text NOT NULL DEFAULT '',
  material_cost numeric(18,2) NOT NULL DEFAULT 0,
  conversion_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (conversion_cost >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','completed')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz, completed_at timestamptz,
  UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id,work_id) REFERENCES finance_industry_work(tenant_id,id)
);
CREATE TABLE finance_production_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  production_id uuid NOT NULL, item_id uuid NOT NULL REFERENCES inventory_items(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0), unit text NOT NULL, batch text NOT NULL DEFAULT '',
  FOREIGN KEY (tenant_id,production_id) REFERENCES finance_production_orders(tenant_id,id)
);
CREATE INDEX ON finance_production_orders (tenant_id,work_id);
ALTER TABLE finance_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_production_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_production_orders USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE finance_production_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_production_materials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_production_materials USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
