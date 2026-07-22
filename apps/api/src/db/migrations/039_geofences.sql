-- Geofencing MVP: radius-based zones checked against live AIS vessel positions.
CREATE TABLE IF NOT EXISTS geofences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          VARCHAR(200) NOT NULL,
  zone_type     VARCHAR(50) DEFAULT 'CUSTOM', -- e.g. PORT, CUSTOMS_CHECKPOINT, RESTRICTED
  center_lat    NUMERIC(9,6) NOT NULL,
  center_lon    NUMERIC(9,6) NOT NULL,
  radius_km     NUMERIC(8,2) NOT NULL,
  active        BOOLEAN DEFAULT true,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_tenant ON geofences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(active) WHERE active = true;

CREATE TABLE IF NOT EXISTS geofence_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id   UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  mmsi          VARCHAR(20) NOT NULL,
  vessel_name   VARCHAR(255),
  event_type    VARCHAR(10) NOT NULL CHECK (event_type IN ('ENTER','EXIT')),
  latitude      NUMERIC(9,6) NOT NULL,
  longitude     NUMERIC(9,6) NOT NULL,
  occurred_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_mmsi ON geofence_events(mmsi);
CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence ON geofence_events(geofence_id, mmsi);

ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS vessel_mmsi VARCHAR(20);
