-- 054_vehicle_tracking.sql
-- Tracking (Vehicle GPS & Geospatial): fleet registry, append-only position
-- history (current position derived via DISTINCT ON), and geofence event log.
-- Reuses the existing `geofences` table (already tenant-scoped and subject-
-- agnostic — see 039_geofences.sql) rather than duplicating zone storage;
-- only the event log is vehicle-specific, to avoid touching the live AIS
-- feature's `geofence_events` table which is coupled to `mmsi`.

CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    plate_number VARCHAR(50),
    type VARCHAR(50) NOT NULL DEFAULT 'TRUCK',   -- TRUCK | VAN | MOTORBIKE | OTHER
    driver_name VARCHAR(200),
    driver_phone VARCHAR(50),
    device_id VARCHAR(100) NOT NULL,             -- GPS/GPRS device identifier, posts to /ingest
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vehicles_device_id_unique UNIQUE (device_id)
);
CREATE INDEX idx_vehicles_tenant ON vehicles(tenant_id);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicles ON vehicles
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE vehicle_positions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    latitude      NUMERIC(9,6) NOT NULL,
    longitude     NUMERIC(9,6) NOT NULL,
    speed         NUMERIC(6,2),
    heading       NUMERIC(6,2),
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_positions_vehicle_time ON vehicle_positions(vehicle_id, recorded_at DESC);
CREATE INDEX idx_vehicle_positions_tenant ON vehicle_positions(tenant_id);

ALTER TABLE vehicle_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_positions ON vehicle_positions
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE vehicle_geofence_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geofence_id   UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type    VARCHAR(10) NOT NULL CHECK (event_type IN ('ENTER','EXIT')),
    latitude      NUMERIC(9,6) NOT NULL,
    longitude     NUMERIC(9,6) NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_geofence_events_vehicle ON vehicle_geofence_events(vehicle_id, occurred_at DESC);

ALTER TABLE vehicle_geofence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_geofence_events ON vehicle_geofence_events
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
