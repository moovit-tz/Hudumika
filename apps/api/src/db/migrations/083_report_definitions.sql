-- SuperAdmin cross-tenant Reports module: saved report definitions + run
-- history (Phase 1). No tenant_id column on either — these belong to the
-- platform/SuperAdmin, not a tenant.
CREATE TABLE IF NOT EXISTS report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  app_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_definition_id UUID REFERENCES report_definitions(id) ON DELETE SET NULL,
  app_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'succeeded',
  row_count INTEGER,
  duration_ms INTEGER,
  run_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_runs_started_at ON report_runs (started_at DESC);
