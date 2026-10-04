-- Migration 554: per-rep sales quotas for CRM pipeline
-- Stores monthly revenue and deal-count targets per user so the pipeline
-- can show attainment vs. target alongside the leaderboard.
-- period is YYYY-MM (e.g. '2026-10') — simpler to query than a date range
-- and naturally maps to the calendar-month view managers think in.

CREATE TABLE IF NOT EXISTS crm_sales_quotas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period       CHAR(7) NOT NULL,   -- 'YYYY-MM'
  target_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  target_count INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_crm_quotas_tenant_period ON crm_sales_quotas(tenant_id, period);

ALTER TABLE crm_sales_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_sales_quotas_tenant ON crm_sales_quotas
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
