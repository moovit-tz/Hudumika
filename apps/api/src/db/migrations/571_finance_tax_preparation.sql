CREATE TABLE finance_tax_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES vat_periods(id), prepared_by uuid NOT NULL REFERENCES users(id),
  checks jsonb NOT NULL, evidence_note text NOT NULL, return_snapshot jsonb NOT NULL, source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','approved','rejected')),
  reviewed_by uuid REFERENCES users(id), review_note text, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON finance_tax_preparations (tenant_id,period_id,created_at DESC);
ALTER TABLE finance_tax_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_tax_preparations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_tax_preparations USING(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
