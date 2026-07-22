-- Migration 105: Tenant-configurable Workflows for ClearOS.
-- Lets a tenant define named workflows with ordered custom steps (entry
-- conditions, automated comms, SLA hours), assigned per freight mode /
-- consignment type / customer. Existing shipments and tenants who never
-- create a custom workflow keep running on the legacy fixed 18-stage
-- ClearanceStage system untouched (workflow_id/workflow_step_id stay NULL) —
-- see workflow-resolver.service.ts for the LEGACY-synthesis bridge that
-- makes both regimes flow through the same transition engine.

CREATE TABLE workflows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  is_default   BOOLEAN     NOT NULL DEFAULT false,
  triggers     JSONB       NOT NULL DEFAULT '{"freightModes":[],"consignmentTypes":[],"customerIds":[],"originCountries":[],"destinationCountries":[],"isDefault":false}',
  created_by   UUID        REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS workflows_tenant ON workflows (tenant_id, is_active) WHERE deleted_at IS NULL;
-- At most one is_default=true per tenant among non-deleted rows
CREATE UNIQUE INDEX IF NOT EXISTS workflows_one_default ON workflows (tenant_id) WHERE is_default = true AND deleted_at IS NULL;

CREATE TABLE workflow_steps (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id       UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  description       TEXT        NOT NULL DEFAULT '',
  step_order        INTEGER     NOT NULL,
  is_start          BOOLEAN     NOT NULL DEFAULT false,
  is_terminal       BOOLEAN     NOT NULL DEFAULT false,
  next_step_ids     JSONB       NOT NULL DEFAULT '[]',   -- string[] of workflow_steps.id
  entry_conditions  JSONB       NOT NULL DEFAULT '[]',   -- FieldCondition[]
  auto_comms        JSONB       NOT NULL DEFAULT '[]',   -- AutoComm[]
  sla_hours         INTEGER,
  color             TEXT        NOT NULL DEFAULT '#0d9488',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_steps_workflow ON workflow_steps (workflow_id, step_order);

-- shipment_cases: workflow ownership, resolved ONCE at creation and never
-- re-resolved on transition — a workflow owns a case for its lifecycle.
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflows(id);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS workflow_step_id UUID REFERENCES workflow_steps(id);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS consignment_type TEXT NOT NULL DEFAULT 'import';
-- `stage` (existing VARCHAR(50), no CHECK constraint) stays the single
-- source of truth every existing consumer reads: for legacy/default-workflow
-- shipments it holds a ClearanceStage literal and workflow_id/workflow_step_id
-- stay NULL; for custom-workflow shipments it holds the current step's UUID
-- and workflow_step_id mirrors it.

CREATE INDEX IF NOT EXISTS shipment_cases_workflow ON shipment_cases (workflow_id) WHERE workflow_id IS NOT NULL;

-- Delayed auto-comms queue (AutoComm.delayMinutes > 0)
CREATE TABLE workflow_comm_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- shipment_cases is a partitioned table (composite PK id+created_at) — no
  -- other table in this codebase has a real FK to shipment_cases(id) either;
  -- integrity is enforced at the application layer, matching that convention.
  shipment_id      UUID        NOT NULL,
  workflow_step_id UUID        NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  auto_comm_id     TEXT        NOT NULL,  -- AutoComm.id within the step's auto_comms JSONB
  fire_at          TIMESTAMPTZ NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'PENDING', -- PENDING | SENT | FAILED | CANCELLED
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS workflow_comm_queue_due ON workflow_comm_queue (status, fire_at) WHERE status = 'PENDING';
-- If a shipment leaves a step before its delay elapses, the pending row for
-- that (shipment_id, workflow_step_id) is marked CANCELLED by the transition
-- engine — prevents a stale "you're now at step X" message firing late.

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_comm_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflows'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflows
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_steps'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_steps
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_comm_queue'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_comm_queue
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
