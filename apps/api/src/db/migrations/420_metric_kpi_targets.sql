-- 420_metric_kpi_targets.sql
--
-- Phase M2 of METRICS_AND_SIGN_PLAN.md: KPI Center standing targets.
-- Tenant-scoped standing goals on any metric_definitions key (distinct from
-- metric_alert_rules, which are threshold-breach firing conditions).

CREATE TABLE IF NOT EXISTS metric_kpi_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key        TEXT NOT NULL REFERENCES metric_definitions(metric_key) ON DELETE CASCADE,
  target_value      NUMERIC NOT NULL,
  target_direction  TEXT NOT NULL DEFAULT 'above' CHECK (target_direction IN ('above', 'below')),
  warning_threshold NUMERIC,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, metric_key)
);

CREATE INDEX IF NOT EXISTS metric_kpi_targets_tenant_idx ON metric_kpi_targets(tenant_id);
CREATE INDEX IF NOT EXISTS metric_kpi_targets_metric_key_idx ON metric_kpi_targets(metric_key);

ALTER TABLE metric_kpi_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_kpi_targets FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'metric_kpi_targets' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON metric_kpi_targets
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
