CREATE TABLE finance_work_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_id uuid NOT NULL,
  source_journal_line_id uuid NOT NULL REFERENCES journal_lines(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  allocation_journal_id uuid NOT NULL REFERENCES journal_entries(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  FOREIGN KEY (tenant_id,work_id) REFERENCES finance_industry_work(tenant_id,id),
  UNIQUE (tenant_id,allocation_journal_id)
);
CREATE INDEX ON finance_work_cost_allocations (tenant_id,source_journal_line_id) WHERE reversed_at IS NULL;
ALTER TABLE finance_work_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_work_cost_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_work_cost_allocations
USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
