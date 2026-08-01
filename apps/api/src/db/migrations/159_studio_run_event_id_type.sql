-- Migration 159: correct workflow_studio_runs.domain_event_id to BIGINT.
--
-- 158 declared it UUID by assumption. domain_events.id is BIGSERIAL
-- (migration 129), so every event-driven run failed at insert with
-- "invalid input syntax for type uuid". Manual runs were unaffected because
-- they pass NULL — which is exactly why this only showed up once the event
-- bus was wired to the executor.
--
-- Safe to retype in place: no row has ever carried a value here.

DROP INDEX IF EXISTS workflow_studio_runs_once_per_event;
DROP INDEX IF EXISTS workflow_studio_runs_by_event;

ALTER TABLE workflow_studio_runs
  ALTER COLUMN domain_event_id TYPE BIGINT USING NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_studio_runs_once_per_event
  ON workflow_studio_runs (workflow_id, domain_event_id)
  WHERE domain_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_studio_runs_by_event
  ON workflow_studio_runs (tenant_id, domain_event_id) WHERE domain_event_id IS NOT NULL;
