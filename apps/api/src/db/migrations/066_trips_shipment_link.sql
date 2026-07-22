-- 066_trips_shipment_link.sql
-- Links a fleet trip to a ClearOS shipment case when the cargo being moved
-- has gone through customs clearance. When there's no such link, job_type
-- marks the trip explicitly as transport-only (a local haul with no
-- clearance workflow attached) rather than leaving that ambiguous.

-- shipment_cases is a partitioned table (no simple unique key usable for a
-- FK), so this mirrors the existing loose customer_id pattern on trips —
-- unenforced at the DB level, resolved by ID lookup in application code.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS shipment_id UUID,
  ADD COLUMN IF NOT EXISTS job_type    VARCHAR(20) NOT NULL DEFAULT 'TRANSPORT_ONLY'; -- CLEARANCE_LINKED | TRANSPORT_ONLY

CREATE INDEX IF NOT EXISTS idx_trips_shipment ON trips(shipment_id);
