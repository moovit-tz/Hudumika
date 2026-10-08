CREATE TABLE finance_close_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES gl_periods(id), reviewer_id uuid NOT NULL REFERENCES users(id),
  checklist jsonb NOT NULL, diagnostics jsonb NOT NULL, note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON finance_close_reviews (tenant_id,period_id,created_at DESC);
ALTER TABLE finance_close_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_close_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_close_reviews USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
