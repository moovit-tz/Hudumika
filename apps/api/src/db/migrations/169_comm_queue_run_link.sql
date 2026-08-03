-- Migration 169: link a delayed comm back to the run that queued it.
--
-- Migration 168 gave clearance transitions a run journal, but a comm with
-- delayMinutes > 0 is only recorded as QUEUED — it is sent later, by
-- workflow-comm.job.ts, which had no way to find the run it belonged to. So a
-- delayed message that eventually failed left the run reading QUEUED forever:
-- optimistic, and wrong in exactly the case the journal exists to catch.
--
-- Correlating by (shipment_id, workflow_step_id) would be ambiguous — a
-- shipment can re-enter the same step — so the link is stored explicitly.

ALTER TABLE workflow_comm_queue
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES workflow_step_runs(id) ON DELETE SET NULL;

-- ON DELETE SET NULL, not CASCADE: if a run row is ever removed the queued
-- message must still be sent. The journal is a record of the send, not its
-- reason for existing.

CREATE INDEX IF NOT EXISTS workflow_comm_queue_run ON workflow_comm_queue (run_id) WHERE run_id IS NOT NULL;
