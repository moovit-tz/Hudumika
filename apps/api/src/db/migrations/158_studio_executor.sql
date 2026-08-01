-- Migration 158: what a real executor needs on the run log.
--
-- workflow_studio_runs was written for a stub that always succeeded: three
-- statuses (SUCCESS/RUNNING/FAILED), no link to the event that caused the run,
-- and nothing preventing the same event running the same workflow twice.
--
-- 1. SIMULATED — a dry run must never be indistinguishable from a real one.
--    This is the whole reason the old run log could not be trusted: it recorded
--    fabricated node results under status 'SUCCESS'.
-- 2. PARTIAL — some actions succeeded before one failed. Real automation needs
--    this; collapsing it into FAILED hides work that actually happened, and
--    into SUCCESS hides work that did not.
-- 3. domain_event_id — which event caused this run, and the idempotency key.
--    Without it a redelivered event re-charges a customer or re-sends a
--    WhatsApp. The unique index is the enforcement, not application code.

ALTER TABLE workflow_studio_runs DROP CONSTRAINT IF EXISTS workflow_studio_runs_status_check;
ALTER TABLE workflow_studio_runs ADD CONSTRAINT workflow_studio_runs_status_check
  CHECK (status IN ('SUCCESS', 'RUNNING', 'FAILED', 'PARTIAL', 'SIMULATED'));

ALTER TABLE workflow_studio_runs ADD COLUMN IF NOT EXISTS domain_event_id UUID;

-- One real run per (workflow, event). Dry runs and manual runs carry a NULL
-- domain_event_id and are deliberately exempt — you can test a workflow as
-- often as you like.
CREATE UNIQUE INDEX IF NOT EXISTS workflow_studio_runs_once_per_event
  ON workflow_studio_runs (workflow_id, domain_event_id)
  WHERE domain_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_studio_runs_by_event
  ON workflow_studio_runs (tenant_id, domain_event_id) WHERE domain_event_id IS NOT NULL;

ALTER TABLE workflow_studio_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_studio_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_studio_apps'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_studio_apps
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_studio_runs'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_studio_runs
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
