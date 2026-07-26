-- 122_inventory_control_app.sql
-- Inventory Control — a brand-new, standalone app (per the user's own
-- explicit phasing: bonded warehouse first, then sorting/fulfillment
-- centres, then this as a separate future app). Deliberately its own,
-- simpler domain from SEAL: no customs status, no hash-chained ledger
-- (that rigor is specific to SEAL's regulatory audit requirement) — just
-- a real, honest stock ledger + live projection for general multi-
-- warehouse goods (raw materials, finished goods, retail stock).
--
-- Table names are all `inventory_`-prefixed to avoid the naming collision
-- already flagged this session between Fleet's `parts_stock`/
-- `warehouse_locations` (spare parts for trucks) and SEAL's own tables.

-- ── Entitlement registration (mirrors 102_onesite_entitlement.sql) ──────
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'inventory'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status)
VALUES ('inventory', 'active')
ON CONFLICT (app_id) DO NOTHING;

-- ── Warehouses & locations (flat two-level, deliberately simpler than
--    SEAL's compartment/zone/rack tree — general inventory doesn't need
--    customs compartments) ──────────────────────────────────────────────
CREATE TABLE inventory_warehouses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       VARCHAR(50) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  address    TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_inventory_warehouses_tenant ON inventory_warehouses(tenant_id);

ALTER TABLE inventory_warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_warehouses ON inventory_warehouses
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE inventory_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  code          VARCHAR(50) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'bin' CHECK (location_type IN ('bin','shelf','floor','staging')),
  is_pickable   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);
CREATE INDEX idx_inventory_locations_tenant ON inventory_locations(tenant_id);
CREATE INDEX idx_inventory_locations_warehouse ON inventory_locations(warehouse_id);

ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_locations ON inventory_locations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Items + UOM conversions (multi-UOM from the start, per the user's own
--    scope decision — a movement can be entered in any registered UOM and
--    is converted to base_uom before being written to the ledger) ───────
CREATE TABLE inventory_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku              VARCHAR(100) NOT NULL,
  name             VARCHAR(200) NOT NULL,
  -- Soft link to the existing billing catalog — products.id is a plain
  -- VARCHAR(64) (052_products.sql), not UUID, and this app never
  -- duplicates its name/price fields, only references them for display.
  product_id       VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  base_uom         VARCHAR(20) NOT NULL DEFAULT 'each',
  item_type        TEXT NOT NULL DEFAULT 'finished_good'
                   CHECK (item_type IN ('raw_material','finished_good','retail','consumable')),
  is_batch_tracked BOOLEAN NOT NULL DEFAULT false,
  reorder_point    NUMERIC(18,4),
  reorder_qty      NUMERIC(18,4),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);
CREATE INDEX idx_inventory_items_tenant ON inventory_items(tenant_id);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_items ON inventory_items
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE inventory_item_uoms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  uom_code          VARCHAR(20) NOT NULL,
  conversion_factor NUMERIC(18,6) NOT NULL, -- 1 uom_code = conversion_factor * base_uom
  UNIQUE (item_id, uom_code)
);
CREATE INDEX idx_inventory_item_uoms_tenant ON inventory_item_uoms(tenant_id);
CREATE INDEX idx_inventory_item_uoms_item ON inventory_item_uoms(item_id);

ALTER TABLE inventory_item_uoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_item_uoms ON inventory_item_uoms
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
