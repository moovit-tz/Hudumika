-- Vehicle per-unit speed limit (km/h).
-- SPEEDING has been documented in fleet_alerts.alert_type since migration 055,
-- and TrackingAlerts.tsx promises it as an alert category, but there was no
-- threshold column to wire up (HUD-0137). This column supplies that threshold.
-- NULL means "no limit configured for this vehicle" — the GPSWOX sync job
-- will not fire a SPEEDING alert for a vehicle whose speed_limit_kmh is NULL.

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS speed_limit_kmh INTEGER
    CHECK (speed_limit_kmh IS NULL OR (speed_limit_kmh > 0 AND speed_limit_kmh <= 300));
