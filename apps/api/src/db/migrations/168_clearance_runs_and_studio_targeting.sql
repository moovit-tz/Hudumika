-- Migration 168: the two capability borrows between the platform's two
-- workflow builders, now that both live in Studio.
--
--   1. workflow_step_runs — clearance gains Studio's run history. Until now a
--      clearance transition recorded only WHERE a shipment went (stage_history)
--      and nothing about what the automation DID getting it there. A failed
--      customer email was returned by sendOneComm as {success:false,error} and
--      then dropped on the floor by dispatchAutoComms's fire-and-forget call —
--      invisible to everyone. This is the table that makes it visible.
--
--   2. workflow_studio_apps.targeting — Studio gains clearance's targeting.
--      An automation could only say WHICH EVENT fires it, never "only for air
--      imports for customer X". Clearance has modelled exactly that in
--      workflows.triggers since migration 105; same shape, so one mental model
--      and one UI serve both.

CREATE TABLE IF NOT EXISTS workflow_step_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL for a shipment on the legacy fixed 18-stage system, which has no
  -- workflows row (see workflow-resolver.service.ts's LEGACY synthesis).
  workflow_id   UUID        REFERENCES workflows(id) ON DELETE CASCADE,
  -- shipment_cases is partitioned (composite PK id+created_at) so no single
  -- column FK is possible; integrity is enforced at the application layer,
  -- matching workflow_comm_queue and every other table that references it.
  shipment_id   UUID        NOT NULL,
  -- TEXT, not UUID, and deliberately unconstrained: a custom-workflow step id
  -- is a workflow_steps UUID, but a legacy one is a ClearanceStage literal
  -- ('CUSTOMS_ASSESSMENT'). No FK either way — history must outlive the step
  -- it describes, or deleting a step would quietly erase the record of what
  -- happened while it existed.
  from_step_id  TEXT,
  to_step_id    TEXT        NOT NULL,
  to_step_name  TEXT        NOT NULL,
  actor_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- SUCCESS  moved, every comm that was attempted succeeded
  -- PARTIAL  moved, but at least one comm failed  (the case that was invisible)
  -- BLOCKED  refused: an entry condition was not met
  -- FAILED   refused: an error
  -- SIMULATED a dry run — nothing was moved and nothing was sent
  status        TEXT        NOT NULL CHECK (status IN ('SUCCESS','PARTIAL','BLOCKED','FAILED','SIMULATED')),
  conditions    JSONB       NOT NULL DEFAULT '[]',  -- [{label, field, operator, passed}]
  comms         JSONB       NOT NULL DEFAULT '[]',  -- [{commId, channel, recipient, status, error, delayMinutes}]
  error_message TEXT,
  duration_ms   INTEGER     NOT NULL DEFAULT 0,
  simulated     BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_step_runs_workflow
  ON workflow_step_runs (tenant_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_step_runs_shipment
  ON workflow_step_runs (tenant_id, shipment_id, created_at DESC);
-- The builder's "what went wrong lately" view reads only the non-clean rows.
CREATE INDEX IF NOT EXISTS workflow_step_runs_problems
  ON workflow_step_runs (tenant_id, created_at DESC) WHERE status IN ('PARTIAL','BLOCKED','FAILED');

-- Same shape as workflows.triggers (migration 105) on purpose.
ALTER TABLE workflow_studio_apps
  ADD COLUMN IF NOT EXISTS targeting JSONB NOT NULL
  DEFAULT '{"freightModes":[],"consignmentTypes":[],"customerIds":[],"originCountries":[],"destinationCountries":[]}';

ALTER TABLE workflow_step_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_step_runs'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_step_runs
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
