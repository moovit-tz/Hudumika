-- 066_advanced_fleet_ops.sql
-- Movex-style features: Vehicle lifecycle, assignments, issues pipeline, and sensors.

-- 1. Extend `vehicles` table with lifecycle and financial fields
ALTER TABLE vehicles ADD COLUMN purchase_vendor VARCHAR(200);
ALTER TABLE vehicles ADD COLUMN purchase_date DATE;
ALTER TABLE vehicles ADD COLUMN purchase_price NUMERIC(15,2);
ALTER TABLE vehicles ADD COLUMN initial_odometer NUMERIC(10,1);
ALTER TABLE vehicles ADD COLUMN financing_type VARCHAR(20) DEFAULT 'NONE'; -- NONE | LOAN | LEASE
ALTER TABLE vehicles ADD COLUMN in_service_date DATE;
ALTER TABLE vehicles ADD COLUMN in_service_odometer NUMERIC(10,1);
ALTER TABLE vehicles ADD COLUMN est_life_months INTEGER;
ALTER TABLE vehicles ADD COLUMN est_life_meter NUMERIC(10,1);
ALTER TABLE vehicles ADD COLUMN est_resale_value NUMERIC(15,2);
ALTER TABLE vehicles ADD COLUMN out_of_service_date DATE;
ALTER TABLE vehicles ADD COLUMN out_of_service_odometer NUMERIC(10,1);
ALTER TABLE vehicles ADD COLUMN lifecycle_notes TEXT;

-- 2. Vehicle Assignments Table
CREATE TABLE vehicle_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id     UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    start_time    TIMESTAMPTZ NOT NULL,
    end_time      TIMESTAMPTZ,
    labels        VARCHAR(200),
    comment       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_assignments_tenant ON vehicle_assignments(tenant_id);
CREATE INDEX idx_vehicle_assignments_vehicle ON vehicle_assignments(vehicle_id);

ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_assignments ON vehicle_assignments
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 3. Extend `vehicle_issues` table
ALTER TABLE vehicle_issues ADD COLUMN priority VARCHAR(20) DEFAULT 'Medium'; -- Low | Medium | High | Critical

-- 4. Vehicle Issue Events (Timeline)
CREATE TABLE vehicle_issue_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    issue_id      UUID NOT NULL REFERENCES vehicle_issues(id) ON DELETE CASCADE,
    event_type    VARCHAR(50) NOT NULL, -- OPENED | COMMENTED | STATUS_CHANGED | RESOLVED
    description   TEXT NOT NULL,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_issue_events_tenant ON vehicle_issue_events(tenant_id);
CREATE INDEX idx_vehicle_issue_events_issue ON vehicle_issue_events(issue_id);

ALTER TABLE vehicle_issue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_issue_events ON vehicle_issue_events
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 5. Vehicle Sensor Snapshots
CREATE TABLE vehicle_sensor_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    snapshot_type VARCHAR(50) NOT NULL, -- TEMPERATURE | DOORS | ENGINE | OBD2
    payload       JSONB NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_sensor_snapshots_tenant ON vehicle_sensor_snapshots(tenant_id);
CREATE INDEX idx_vehicle_sensor_snapshots_vehicle ON vehicle_sensor_snapshots(vehicle_id, recorded_at DESC);

ALTER TABLE vehicle_sensor_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_sensor_snapshots ON vehicle_sensor_snapshots
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
