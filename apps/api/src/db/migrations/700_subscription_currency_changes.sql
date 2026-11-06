CREATE TABLE subscription_currency_changes (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  from_plan TEXT NOT NULL REFERENCES packages(code),
  to_plan TEXT NOT NULL REFERENCES packages(code),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  currency TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  requested_by UUID,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'applied', 'blocked')),
  blocked_reason TEXT
);

ALTER TABLE subscription_currency_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_currency_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_currency_changes_tenant ON subscription_currency_changes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
