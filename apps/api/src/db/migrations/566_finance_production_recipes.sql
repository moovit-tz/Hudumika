CREATE TABLE finance_production_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, version integer NOT NULL CHECK (version > 0), recipe jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,name,version)
);
ALTER TABLE finance_production_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_production_recipes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_production_recipes USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
