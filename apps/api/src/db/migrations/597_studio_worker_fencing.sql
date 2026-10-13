ALTER TABLE workflow_studio_runs
  ADD COLUMN worker_token UUID,
  ADD COLUMN worker_expires_at TIMESTAMPTZ,
  ADD COLUMN active_step JSONB;
