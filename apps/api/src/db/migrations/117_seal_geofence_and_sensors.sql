-- 117_seal_geofence_and_sensors.sql
-- Increment 10: link a SEAL compartment to Tracking's existing, real
-- `geofences` table directly (039_geofences.sql — already tenant-scoped and
-- subject-agnostic, extended for vehicles in 054_vehicle_tracking.sql via
-- vehicle_geofence_events) rather than duplicating zone/radius storage.
-- No new geofencing math here — SEAL only stores which geofence a
-- compartment corresponds to; entry/exit detection stays wherever it
-- already lives (checkGeofenceTransitions in tracking.routes.ts).
ALTER TABLE seal_compartments ADD COLUMN geofence_id UUID REFERENCES geofences(id) ON DELETE SET NULL;

-- Zone-occupancy sensor/camera registry + readings ledger. Mirrors the
-- vehicle-position-ingest pattern (device_id -> tenant-scoped lookup ->
-- insert reading -> websocket broadcast) already proven in
-- POST /v1/tracking/positions/ingest, but for a fixed warehouse sensor
-- rather than a moving vehicle. Honestly a real, independently-testable
-- contract with no physical sensor wired up yet — same honesty standard as
-- the manual customs adapter and GPSWOX integrations already in this repo.
CREATE TABLE seal_sensor_devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  zone_id        UUID REFERENCES seal_zones(id) ON DELETE SET NULL,
  location_id    UUID REFERENCES seal_locations(id) ON DELETE SET NULL,
  device_id      VARCHAR(100) NOT NULL,
  device_type    TEXT NOT NULL CHECK (device_type IN ('camera', 'occupancy_sensor', 'weight_sensor', 'door_sensor')),
  name           VARCHAR(200) NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, device_id)
);
CREATE INDEX idx_seal_sensor_devices_tenant ON seal_sensor_devices(tenant_id);
CREATE INDEX idx_seal_sensor_devices_compartment ON seal_sensor_devices(compartment_id);

ALTER TABLE seal_sensor_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_sensor_devices ON seal_sensor_devices
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_sensor_readings (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id     UUID NOT NULL REFERENCES seal_sensor_devices(id) ON DELETE CASCADE,
  reading_type  TEXT NOT NULL CHECK (reading_type IN ('occupancy_count', 'motion', 'weight_kg', 'door_state')),
  value         NUMERIC(14,4) NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_sensor_readings_tenant ON seal_sensor_readings(tenant_id);
CREATE INDEX idx_seal_sensor_readings_device ON seal_sensor_readings(device_id, recorded_at DESC);

ALTER TABLE seal_sensor_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_sensor_readings ON seal_sensor_readings
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
