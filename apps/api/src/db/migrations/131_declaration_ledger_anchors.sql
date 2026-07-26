-- 131_declaration_ledger_anchors.sql
-- External anchoring for ClearOS's declaration_events chain
-- (130_declaration_events.sql), same purpose and mechanism as
-- seal_ledger_anchors (126_seal_ledger_anchors.sql): periodically anchors
-- a checkpoint of the ledger to Bitcoin via OpenTimestamps, so a customs
-- authority or auditor can verify the ledger independently of trusting
-- Hudumika's own database at all. Unlike SEAL (anchored per-compartment),
-- this is a single daily tenant-wide checkpoint — declarations aren't
-- grouped into a per-compartment-like subdivision, so a tenant-wide
-- snapshot is the natural unit here.
CREATE TABLE declaration_ledger_anchors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  checkpoint_hash      CHAR(64) NOT NULL,
  snapshot             JSONB NOT NULL,         -- [{declarationId, eventId, hash}, ...] sorted by declarationId
  declaration_count    INT NOT NULL,
  ots_proof            BYTEA NOT NULL,
  ots_proof_upgraded   BYTEA,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  bitcoin_block_height INT,
  bitcoin_block_time   TIMESTAMPTZ,
  trigger              TEXT NOT NULL CHECK (trigger IN ('manual','scheduled')),
  requested_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  error_message        TEXT,
  last_checked_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_declaration_ledger_anchors_tenant ON declaration_ledger_anchors(tenant_id, created_at DESC);
CREATE INDEX idx_declaration_ledger_anchors_pending ON declaration_ledger_anchors(tenant_id, status);

ALTER TABLE declaration_ledger_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_declaration_ledger_anchors ON declaration_ledger_anchors
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
