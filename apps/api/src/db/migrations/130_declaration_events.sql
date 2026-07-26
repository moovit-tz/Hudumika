-- 130_declaration_events.sql
-- ClearOS's own TANCIS-style declarations (004_declarations.sql) have no
-- tamper-evident history today, unlike SEAL's seal_movements
-- (106_seal_bonded_warehouse.sql). This gives them the same append-only,
-- hash-chained ledger, using the exact same convention:
-- hash = sha256(prev_hash || canonical_json(payload) || occurred_at || actor_id),
-- scoped per declaration_id so each declaration's history is independently
-- verifiable — and, later, externally anchorable to Bitcoin the same way.
CREATE TABLE declaration_events (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a cascaded delete would still be a DELETE
  -- statement against this append-only table, which the trigger below
  -- blocks regardless of where it originated — CASCADE would just turn
  -- "delete this declaration" into a confusing trigger error instead of a
  -- clear, intentional one. Mirrors seal_movements' identical RESTRICT
  -- choice (106_seal_bonded_warehouse.sql) for the same reason: a record
  -- with real audit history isn't deletable, full stop.
  declaration_id UUID NOT NULL REFERENCES declarations(id) ON DELETE RESTRICT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id       UUID,
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'CREATED','DRAFT','VALIDATED','SAVED','TRANSFERRED',
                   'ACCEPTED','ASSESSED','PAID','RELEASED','AMENDED','CANCELLED'
                 )),
  payload        JSONB NOT NULL,
  prev_hash      TEXT,
  hash           TEXT NOT NULL
);
CREATE INDEX idx_declaration_events_declaration ON declaration_events(declaration_id, id);
CREATE INDEX idx_declaration_events_tenant ON declaration_events(tenant_id);

ALTER TABLE declaration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_declaration_events ON declaration_events
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only enforcement at the database layer, same pattern as
-- seal_movements_block_mutation.
CREATE OR REPLACE FUNCTION declaration_events_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'declaration_events is append-only — % is not permitted (use a compensating event instead)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER declaration_events_no_update
  BEFORE UPDATE ON declaration_events
  FOR EACH ROW EXECUTE FUNCTION declaration_events_block_mutation();

CREATE TRIGGER declaration_events_no_delete
  BEFORE DELETE ON declaration_events
  FOR EACH ROW EXECUTE FUNCTION declaration_events_block_mutation();
