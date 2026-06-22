-- Migration 007: Analytics KPIs

CREATE TABLE IF NOT EXISTS analytics_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric VARCHAR(100) NOT NULL,
  value NUMERIC NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on analytics_kpis
ALTER TABLE analytics_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON analytics_kpis
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
