-- 129_domain_events.sql
-- A generic, append-only cross-app event log. ClearOS (and every other
-- first-party app) call emitDomainEvent() at real lifecycle moments
-- (case opened, stage advanced, declaration released, ...); any app —
-- including one that doesn't exist yet — reacts by registering an
-- in-process subscriber for the event type it cares about, without the
-- emitting app's code ever needing to know who's listening. Third-party
-- apps listed in marketplace_apps with an approved status and a
-- webhook_url receive the same events over HTTP (see
-- domain-events.service.ts) — that column already existed but was never
-- wired to anything until now.
--
-- This is a log, not a ledger: no hash chain here. Tamper-evidence for
-- specific business records (e.g. customs declarations) is handled by
-- their own dedicated append-only chain (see declaration_events), not by
-- this general-purpose event bus.
CREATE TABLE domain_events (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  source_app  TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_domain_events_tenant_type ON domain_events(tenant_id, event_type, created_at DESC);
CREATE INDEX idx_domain_events_entity ON domain_events(entity_type, entity_id);

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_domain_events ON domain_events
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
