-- 059_vehicle_detail.sql
-- Vehicle detail page (CMMS-style): richer vehicle master data plus the
-- three genuinely new record types it needs on top of what already exists
-- (fuel_logs, maintenance_records, vehicle_documents, fleet_reminders,
-- vehicle_positions all already cover Fuel/Service History/Renewal/
-- Reminders/Last Known Location — not duplicated here).

ALTER TABLE vehicles ADD COLUMN vin VARCHAR(50);
ALTER TABLE vehicles ADD COLUMN year INTEGER;
ALTER TABLE vehicles ADD COLUMN make VARCHAR(100);
ALTER TABLE vehicles ADD COLUMN model VARCHAR(100);
ALTER TABLE vehicles ADD COLUMN trim VARCHAR(100);
ALTER TABLE vehicles ADD COLUMN color VARCHAR(50);
ALTER TABLE vehicles ADD COLUMN ownership VARCHAR(20) DEFAULT 'OWNED'; -- OWNED | LEASED | RENTED
ALTER TABLE vehicles ADD COLUMN mileage_km NUMERIC(10,1);
ALTER TABLE vehicles ADD COLUMN photo_url TEXT;

CREATE TABLE vehicle_issues (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title       VARCHAR(300) NOT NULL,
    description TEXT,
    severity    VARCHAR(10) NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
    status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',    -- OPEN | IN_PROGRESS | RESOLVED
    reported_by UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_vehicle_issues_tenant ON vehicle_issues(tenant_id);
CREATE INDEX idx_vehicle_issues_vehicle ON vehicle_issues(vehicle_id);

ALTER TABLE vehicle_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_issues ON vehicle_issues
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE vehicle_expenses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id   UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    category     VARCHAR(50) NOT NULL DEFAULT 'OTHER', -- TOLL | PARKING | FINE | WASH | OTHER
    description  TEXT,
    amount       NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    vendor_id    UUID REFERENCES vehicle_vendors(id) ON DELETE SET NULL,
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_expenses_tenant ON vehicle_expenses(tenant_id);
CREATE INDEX idx_vehicle_expenses_vehicle ON vehicle_expenses(vehicle_id, expense_date DESC);

ALTER TABLE vehicle_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_expenses ON vehicle_expenses
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE vehicle_meter_readings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    reading_km  NUMERIC(10,1) NOT NULL,
    source      VARCHAR(20) NOT NULL DEFAULT 'MANUAL', -- MANUAL | FUEL_LOG | MAINTENANCE
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID
);
CREATE INDEX idx_vehicle_meter_readings_vehicle ON vehicle_meter_readings(vehicle_id, recorded_at DESC);
CREATE INDEX idx_vehicle_meter_readings_tenant ON vehicle_meter_readings(tenant_id);

ALTER TABLE vehicle_meter_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_meter_readings ON vehicle_meter_readings
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
