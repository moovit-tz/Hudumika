-- Audit trail for the Query Builder (visual + raw SQL modes) — mirrors
-- report_runs' shape (083_report_definitions.sql). No tenant_id column —
-- this belongs to the platform/SuperAdmin, not a tenant.
CREATE TABLE IF NOT EXISTS query_builder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,               -- 'visual' | 'raw'
  table_name TEXT,                  -- set for visual mode
  columns JSONB,                    -- set for visual mode
  filters JSONB,
  raw_sql TEXT,                     -- set for raw mode
  status TEXT NOT NULL DEFAULT 'succeeded',
  row_count INTEGER,
  duration_ms INTEGER,
  run_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_query_builder_runs_started_at ON query_builder_runs (started_at DESC);
