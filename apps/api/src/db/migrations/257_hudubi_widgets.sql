-- HuduBI configurable widget/report builder (M9 of the ClearOS roadmap).
--
-- Before this, hudubi.routes.ts was five fixed, hardcoded-query endpoints
-- (dashboard/data-sources/analytics/ai-insights/explain) with no service
-- layer and no way for a tenant to choose what they see. hudubi_widget_
-- definitions is the saved-widget record; the metrics it can point at are a
-- curated, hardcoded registry in hudubi-widgets.service.ts (HUDUBI_METRICS)
-- — the same "safe by construction, not a freeform query builder" posture
-- already established by reports.service.ts's METRICS/runMetric (which this
-- mirrors), NOT the SuperAdmin /query-builder tool (which is intentionally
-- broader but SuperAdmin/cross-tenant only, dbPlatform, no forced tenant
-- scoping — wrong security shape for a tenant-facing feature). Every metric
-- here is one of the exact queries the old fixed dashboard already ran,
-- unbundled into individually-selectable pieces — not new data exposure.
--
-- Tenant-scoped, RLS, same policy shape as every other tenant table.

CREATE TABLE IF NOT EXISTS hudubi_widget_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  metric_key VARCHAR(60) NOT NULL,
  chart_type VARCHAR(20) NOT NULL DEFAULT 'bar',   -- number | bar | line | table
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,       -- { date_from?, date_to? }
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hudubi_widgets_tenant ON hudubi_widget_definitions (tenant_id, sort_order);

ALTER TABLE hudubi_widget_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hudubi_widget_definitions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hudubi_widget_definitions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hudubi_widget_definitions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
