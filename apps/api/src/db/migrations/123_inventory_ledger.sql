-- 123_inventory_ledger.sql
-- Inventory Control Phase 2: the core stock ledger + live stock-level
-- projection. Mirrors SealService.recordMovement's discipline (ledger
-- insert + projection update, always in the same transaction) but
-- deliberately without a hash chain — that cryptographic rigor is specific
-- to SEAL's customs regulatory audit requirement, not this general-goods
-- domain. Append-only by convention only (no UPDATE/DELETE route exposed).

CREATE TABLE inventory_movements (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id         UUID,
  actor_type       TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','system','api_client')),
  movement_type    TEXT NOT NULL CHECK (movement_type IN ('receipt','issue','transfer','adjust','count_correction')),
  item_id          UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  from_location_id UUID REFERENCES inventory_locations(id),
  to_location_id   UUID REFERENCES inventory_locations(id),
  -- Always in the item's base_uom — the canonical, comparable unit.
  qty_delta        NUMERIC(18,4) NOT NULL,
  -- What the user actually typed, kept alongside for display/audit —
  -- never re-derived or re-converted after the fact.
  entered_qty      NUMERIC(18,4) NOT NULL,
  entered_uom      VARCHAR(20) NOT NULL,
  batch_no         VARCHAR(100) NOT NULL DEFAULT '',
  expiry_date      DATE,
  reason_code      TEXT,
  reference        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_movements_tenant ON inventory_movements(tenant_id);
CREATE INDEX idx_inventory_movements_item ON inventory_movements(item_id, occurred_at);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_movements ON inventory_movements
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- batch_no defaults to '' for non-batch-tracked items so the primary key
-- stays uniform (no NULL-handling edge cases). Never written to directly —
-- InventoryService.recordMovement() is the only path, always inside the
-- same transaction as the triggering inventory_movements insert.
CREATE TABLE inventory_stock_levels (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id  UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  batch_no     VARCHAR(100) NOT NULL DEFAULT '',
  expiry_date  DATE,
  qty_on_hand  NUMERIC(18,4) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, location_id, batch_no)
);
CREATE INDEX idx_inventory_stock_levels_tenant ON inventory_stock_levels(tenant_id);

ALTER TABLE inventory_stock_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_stock_levels ON inventory_stock_levels
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
