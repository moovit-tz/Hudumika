CREATE TABLE finance_stock_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_id uuid NOT NULL, item_id uuid NOT NULL REFERENCES inventory_items(id), location_id uuid NOT NULL REFERENCES inventory_locations(id),
  batch text NOT NULL DEFAULT '', quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  dispatched_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (dispatched_quantity >= 0 AND dispatched_quantity <= quantity),
  released boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,work_id) REFERENCES finance_industry_work(tenant_id,id)
);
CREATE INDEX ON finance_stock_allocations (tenant_id,item_id,location_id,batch) WHERE NOT released;
ALTER TABLE finance_stock_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_stock_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_stock_allocations USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
