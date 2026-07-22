-- 055_fleet_operations.sql
-- Fleet management suite on top of the Tracking app's vehicle registry
-- (054_vehicle_tracking.sql): drivers, vendors, trips, maintenance, parts
-- stock, fuel logs, vehicle documents, reminders, driver chat, and alerts.
-- Employee/Attendance/Payroll, Accounts, and Customer records are NOT
-- duplicated here — they link out to the existing onepi/finops/customers
-- data (users.id, customers.id) via nullable references, no FK constraint
-- across app boundaries.

CREATE TABLE drivers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    phone               VARCHAR(50),
    license_number      VARCHAR(100),
    license_expiry      DATE,
    employee_id         UUID,                 -- optional link to users.id (onepi) for payroll drivers
    assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | SUSPENDED
    photo_url           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_drivers_tenant ON drivers(tenant_id);
CREATE INDEX idx_drivers_vehicle ON drivers(assigned_vehicle_id);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_drivers ON drivers
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE vehicle_vendors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    vendor_type VARCHAR(30) NOT NULL DEFAULT 'WORKSHOP', -- WORKSHOP | FUEL_STATION | PARTS_SUPPLIER | INSURANCE | OTHER
    phone       VARCHAR(50),
    email       VARCHAR(200),
    address     TEXT,
    notes       TEXT,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_vendors_tenant ON vehicle_vendors(tenant_id);

ALTER TABLE vehicle_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_vendors ON vehicle_vendors
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE trips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id       UUID REFERENCES drivers(id) ON DELETE SET NULL,
    customer_id     UUID,                 -- optional link to customers.id (shared with CRM)
    origin          VARCHAR(300),
    destination     VARCHAR(300),
    scheduled_start TIMESTAMPTZ,
    scheduled_end   TIMESTAMPTZ,
    actual_start    TIMESTAMPTZ,
    actual_end      TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'PLANNED', -- PLANNED | IN_PROGRESS | COMPLETED | CANCELLED
    cargo_desc      TEXT,
    distance_km     NUMERIC(8,2),
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trips_tenant ON trips(tenant_id);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX idx_trips_status ON trips(status);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trips ON trips
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE maintenance_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id        UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    vendor_id         UUID REFERENCES vehicle_vendors(id) ON DELETE SET NULL,
    service_type      VARCHAR(100) NOT NULL,
    description       TEXT,
    cost              NUMERIC(12,2),
    odometer_km       NUMERIC(10,1),
    service_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    next_due_date     DATE,
    next_due_odometer NUMERIC(10,1),
    status            VARCHAR(20) NOT NULL DEFAULT 'COMPLETED', -- SCHEDULED | COMPLETED
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_maintenance_tenant ON maintenance_records(tenant_id);
CREATE INDEX idx_maintenance_vehicle ON maintenance_records(vehicle_id);
CREATE INDEX idx_maintenance_next_due ON maintenance_records(next_due_date) WHERE next_due_date IS NOT NULL;

ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_maintenance_records ON maintenance_records
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE parts_stock (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    part_name     VARCHAR(200) NOT NULL,
    part_number   VARCHAR(100),
    category      VARCHAR(100),
    quantity      INTEGER NOT NULL DEFAULT 0,
    unit_cost     NUMERIC(12,2),
    reorder_level INTEGER NOT NULL DEFAULT 5,
    vendor_id     UUID REFERENCES vehicle_vendors(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_parts_stock_tenant ON parts_stock(tenant_id);

ALTER TABLE parts_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_parts_stock ON parts_stock
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE fuel_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id   UUID REFERENCES drivers(id) ON DELETE SET NULL,
    liters      NUMERIC(8,2) NOT NULL,
    cost        NUMERIC(12,2),
    odometer_km NUMERIC(10,1),
    station     VARCHAR(200),
    vendor_id   UUID REFERENCES vehicle_vendors(id) ON DELETE SET NULL,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fuel_logs_tenant ON fuel_logs(tenant_id);
CREATE INDEX idx_fuel_logs_vehicle ON fuel_logs(vehicle_id, logged_at DESC);

ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fuel_logs ON fuel_logs
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE vehicle_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id   UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    doc_type     VARCHAR(30) NOT NULL DEFAULT 'OTHER', -- REGISTRATION | INSURANCE | INSPECTION | PERMIT | OTHER
    doc_number   VARCHAR(150),
    issued_date  DATE,
    expiry_date  DATE,
    file_url     TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicle_documents_tenant ON vehicle_documents(tenant_id);
CREATE INDEX idx_vehicle_documents_expiry ON vehicle_documents(expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vehicle_documents ON vehicle_documents
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE fleet_reminders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id    UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id     UUID REFERENCES drivers(id) ON DELETE CASCADE,
    title         VARCHAR(300) NOT NULL,
    reminder_type VARCHAR(30) NOT NULL DEFAULT 'CUSTOM', -- MAINTENANCE | DOCUMENT | CUSTOM
    due_date      DATE NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | DONE | DISMISSED
    notes         TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fleet_reminders_tenant ON fleet_reminders(tenant_id);
CREATE INDEX idx_fleet_reminders_due ON fleet_reminders(due_date) WHERE status = 'PENDING';

ALTER TABLE fleet_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fleet_reminders ON fleet_reminders
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE driver_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_id   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    trip_id     UUID REFERENCES trips(id) ON DELETE SET NULL,
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('OPS','DRIVER')),
    sender_id   UUID,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_driver_messages_driver ON driver_messages(driver_id, created_at DESC);
CREATE INDEX idx_driver_messages_tenant ON driver_messages(tenant_id);

ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_driver_messages ON driver_messages
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE fleet_alerts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id    UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    alert_type    VARCHAR(30) NOT NULL, -- SPEEDING | GEOFENCE_BREACH | MAINTENANCE_DUE | DOCUMENT_EXPIRING | DEVICE_OFFLINE
    severity      VARCHAR(10) NOT NULL DEFAULT 'INFO', -- INFO | WARNING | CRITICAL
    message       TEXT NOT NULL,
    acknowledged  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fleet_alerts_tenant ON fleet_alerts(tenant_id);
CREATE INDEX idx_fleet_alerts_unack ON fleet_alerts(tenant_id, acknowledged) WHERE acknowledged = false;

ALTER TABLE fleet_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fleet_alerts ON fleet_alerts
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
