-- 126_seal_ledger_anchors.sql
-- SEAL's seal_movements ledger (106_seal_bonded_warehouse.sql) is
-- append-only and hash-chained per lot, with a DB trigger blocking UPDATE/
-- DELETE. That proves internal consistency but not that today's chain
-- wasn't wholesale rebuilt by someone with direct DB access — a rewritten
-- chain would still verify internally. This adds the missing piece:
-- periodically anchoring each compartment's ledger state externally via
-- OpenTimestamps (a Bitcoin-backed timestamping service), so a party
-- outside Hudumika's own database — a customs authority, an auditor — can
-- verify the ledger independently of trusting Hudumika at all.
--
-- The full snapshot (not just its hash) is stored deliberately: it's what
-- makes independent re-verification possible later — recompute
-- checkpoint_hash from the stored snapshot, then re-derive each listed
-- movement's hash directly from the live (immutable) seal_movements rows
-- by id, without ever trusting Hudumika's own "valid" flag.
CREATE TABLE seal_ledger_anchors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id       UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  checkpoint_hash      CHAR(64) NOT NULL,      -- sha256 hex of the canonical snapshot below
  snapshot             JSONB NOT NULL,         -- [{lotId, movementId, hash}, ...] sorted by lotId
  lot_count            INT NOT NULL,
  ots_proof            BYTEA NOT NULL,         -- serialized proof returned by stamp()
  ots_proof_upgraded   BYTEA,                  -- replaced each time upgrade() advances the proof
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  bitcoin_block_height INT,
  bitcoin_block_time   TIMESTAMPTZ,
  trigger              TEXT NOT NULL CHECK (trigger IN ('manual','scheduled')),
  requested_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  error_message        TEXT,
  last_checked_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_ledger_anchors_compartment ON seal_ledger_anchors(compartment_id, created_at DESC);
CREATE INDEX idx_seal_ledger_anchors_pending ON seal_ledger_anchors(tenant_id, status);

ALTER TABLE seal_ledger_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_ledger_anchors ON seal_ledger_anchors
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
