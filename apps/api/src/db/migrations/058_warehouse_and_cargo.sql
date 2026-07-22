-- 058_warehouse_and_cargo.sql
-- Warehouse-lite (storage locations + inbound/outbound dock scheduling) and
-- a cargo/CBM load-planning tool (manifests + items, packed server-side by
-- the cargoLoading routes and rendered client-side in 3D). Both are
-- Enterprise-tier features gated by requirePlanTier(), layered on top of
-- the existing Tracking fleet tables (055_fleet_operations.sql).

CREATE TABLE warehouse_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    zone            VARCHAR(100),
    capacity_units  INTEGER,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_warehouse_locations_tenant ON warehouse_locations(tenant_id);

ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_warehouse_locations ON warehouse_locations
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE warehouse_dock_appointments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dock_number      VARCHAR(50) NOT NULL,
    appointment_type VARCHAR(10) NOT NULL CHECK (appointment_type IN ('INBOUND','OUTBOUND')),
    vehicle_id       UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    reference        VARCHAR(200),
    scheduled_at     TIMESTAMPTZ NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
                     CHECK (status IN ('SCHEDULED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')),
    notes            TEXT,
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dock_appointments_tenant ON warehouse_dock_appointments(tenant_id);
CREATE INDEX idx_dock_appointments_scheduled ON warehouse_dock_appointments(scheduled_at);

ALTER TABLE warehouse_dock_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_warehouse_dock_appointments ON warehouse_dock_appointments
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE parts_stock ADD COLUMN location_id UUID REFERENCES warehouse_locations(id) ON DELETE SET NULL;

CREATE TABLE cargo_manifests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id          UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    trip_id             UUID REFERENCES trips(id) ON DELETE SET NULL,
    name                VARCHAR(200) NOT NULL,
    container_length_cm NUMERIC(8,1) NOT NULL,
    container_width_cm  NUMERIC(8,1) NOT NULL,
    container_height_cm NUMERIC(8,1) NOT NULL,
    max_weight_kg       NUMERIC(10,1) NOT NULL,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cargo_manifests_tenant ON cargo_manifests(tenant_id);

ALTER TABLE cargo_manifests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cargo_manifests ON cargo_manifests
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE cargo_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    manifest_id UUID NOT NULL REFERENCES cargo_manifests(id) ON DELETE CASCADE,
    label       VARCHAR(200) NOT NULL,
    length_cm   NUMERIC(8,1) NOT NULL,
    width_cm    NUMERIC(8,1) NOT NULL,
    height_cm   NUMERIC(8,1) NOT NULL,
    weight_kg   NUMERIC(10,1) NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    color       VARCHAR(20),
    -- One {x,y,z} entry (container-space cm, box center) per packed unit,
    -- written by POST /manifests/:id/pack. length < quantity means some
    -- units of this item didn't fit; length 0 means none did.
    placements  JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cargo_items_manifest ON cargo_items(manifest_id);
CREATE INDEX idx_cargo_items_tenant ON cargo_items(tenant_id);

ALTER TABLE cargo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cargo_items ON cargo_items
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
