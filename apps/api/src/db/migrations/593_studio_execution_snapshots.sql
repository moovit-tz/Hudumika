ALTER TABLE studio_event_outbox ADD COLUMN workflow_snapshots JSONB;
ALTER TABLE workflow_studio_runs ADD COLUMN workflow_snapshot JSONB;
-- Legacy events have no trustworthy graph and need operator review.
UPDATE studio_event_outbox SET status = 'dead', lease_id = NULL, error_message = 'Legacy delivery has no frozen workflow graph; operator review required' WHERE workflow_snapshots IS NULL AND status IN ('pending', 'processing');
