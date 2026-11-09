-- Migration 733: shared resource/equipment booking with real conflict
-- prevention (S07 of the industry-readiness backlog, the last of its
-- named reusable commerce modules). Confirmed absent before this pass —
-- Calendar's "booking page" (migration 287) is a PERSON's own availability
-- link for scheduling a meeting with them, not a bookable physical/shared
-- ASSET (a room, a vehicle, a piece of equipment). Generic by design, not
-- industry-siloed: any tenant registers whatever it actually has to book.

-- One row per bookable thing. `capacity` generalizes beyond the usual
-- "one room, one booking at a time" case — a tenant with 3 identical
-- projectors registers capacity=3, and up to 3 overlapping bookings are
-- legitimately fine; capacity=1 (the default) reduces to the simple
-- double-booking case property/hospitality already handle elsewhere.
CREATE TABLE IF NOT EXISTS bookable_resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  resource_type TEXT,
  description TEXT,
  capacity    INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookable_resources_tenant ON bookable_resources (tenant_id);

ALTER TABLE bookable_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookable_resources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON bookable_resources;
CREATE POLICY tenant_isolation_policy ON bookable_resources
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS resource_bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES bookable_resources(id),
  customer_id UUID REFERENCES customers(id),
  booked_by   UUID,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  note        TEXT,
  cancelled_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The conflict query (overlapping, still-confirmed bookings for one
-- resource) is always scoped this way — see bookResource()'s own comment
-- for why the resource row itself is locked first, not just this index
-- relied on for correctness.
CREATE INDEX IF NOT EXISTS resource_bookings_resource_window ON resource_bookings (resource_id, starts_at, ends_at) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS resource_bookings_customer ON resource_bookings (tenant_id, customer_id);

ALTER TABLE resource_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON resource_bookings;
CREATE POLICY tenant_isolation_policy ON resource_bookings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
