-- 735_cargo_damage_claims.sql
-- Logistics P1 follow-through: cargo_items.damaged_quantity was recorded at
-- load verification (616_cargo_loading_six_stages.sql) but nothing downstream
-- ever gave it a financial consequence — the exact "recorded, not enforced"
-- pattern already closed for POS batch/expiry, pharmacy dispensing and SEAL
-- fulfillment expiry. This table is the missing claim/settlement record that
-- turns a damage note into a real, auditable credit-note outcome.

CREATE TABLE IF NOT EXISTS cargo_damage_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifest_id         UUID NOT NULL REFERENCES cargo_manifests(id) ON DELETE CASCADE,
  cargo_item_id       UUID NOT NULL REFERENCES cargo_items(id) ON DELETE CASCADE,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  damaged_quantity    INTEGER NOT NULL CHECK (damaged_quantity > 0),
  damage_description  TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED')),
  claimed_amount      NUMERIC(14,2),
  approved_amount     NUMERIC(14,2),
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  credit_note_id      UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
  resolution_notes    TEXT,
  resolved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One live claim per handling unit at a time — re-verifying a load with an
  -- updated damage note (see cargoLoading.routes.ts's verify-load) updates
  -- the existing OPEN claim rather than piling up duplicates; once a claim is
  -- resolved (APPROVED/REJECTED) it's no longer "live" so a fresh one can open.
  CONSTRAINT cargo_damage_claims_one_open_per_item UNIQUE (cargo_item_id, status)
    DEFERRABLE INITIALLY IMMEDIATE
);

-- The UNIQUE(cargo_item_id, status) constraint above would also block two
-- separate APPROVED (or two REJECTED) claims existing historically on the
-- same item across repeat damage events, which is wrong — only OPEN needs to
-- be unique. Replace it with a partial unique index instead.
ALTER TABLE cargo_damage_claims DROP CONSTRAINT cargo_damage_claims_one_open_per_item;
CREATE UNIQUE INDEX IF NOT EXISTS cargo_damage_claims_one_open_per_item
  ON cargo_damage_claims (cargo_item_id) WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_cargo_damage_claims_tenant_status ON cargo_damage_claims (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cargo_damage_claims_manifest ON cargo_damage_claims (manifest_id);

ALTER TABLE cargo_damage_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_damage_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cargo_damage_claims ON cargo_damage_claims
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
