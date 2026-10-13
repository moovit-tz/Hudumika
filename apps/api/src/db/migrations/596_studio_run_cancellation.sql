ALTER TABLE workflow_studio_runs
  ADD COLUMN cancellation JSONB,
  ADD COLUMN cancellation_acknowledged_at TIMESTAMPTZ;
