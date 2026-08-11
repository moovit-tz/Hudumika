-- Migration 222: generic workflow instances — the same engine, any entity.
--
-- ClearOS shipments carry their running workflow inline on shipment_cases
-- (stage / workflow_id / workflow_step_id) and keep doing so — that path is
-- heavily relied on and is left untouched. This table lets ANY OTHER entity
-- (a HuduFreight trip, a SEAL lot/movement, anything added later) run a
-- workflow through the very same resolver and entry-condition evaluator, keyed
-- by (entity_type, entity_id) instead of a shipment column. One active instance
-- per entity.
--
-- Entry conditions are evaluated against an entity CONTEXT supplied by a
-- per-entity-type provider (see services/entity-providers.ts), so a condition
-- like "field X required" or "document Y verified" works for a trip or a lot
-- exactly as it does for a shipment — the engine itself knows nothing about any
-- specific entity.

CREATE TABLE IF NOT EXISTS workflow_instances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id     UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  entity_type     TEXT        NOT NULL,   -- 'shipment' | 'trip' | 'seal_lot' | …
  entity_id       UUID        NOT NULL,
  current_step_id UUID        NOT NULL REFERENCES workflow_steps(id),
  status          TEXT        NOT NULL DEFAULT 'active',   -- active | done
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_instances_entity ON workflow_instances (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS workflow_instance_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id   UUID        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  from_step_id  UUID,
  to_step_id    UUID        NOT NULL,
  to_step_name  TEXT        NOT NULL,
  status        TEXT        NOT NULL,   -- SUCCESS | BLOCKED | FAILED
  note          TEXT,
  conditions    JSONB       NOT NULL DEFAULT '[]',
  actor_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_instance_events_instance ON workflow_instance_events (instance_id, created_at);

ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instance_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_instances'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_instances
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_instance_events'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_instance_events
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
