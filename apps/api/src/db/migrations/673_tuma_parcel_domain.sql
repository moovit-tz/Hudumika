-- Tuma geography tables (ported from tuma-api Prisma schema, tuma-api @ 9025f305).
--
-- This file originally re-created the whole Tuma parcel domain a second
-- time; 656_tuma_domain_tables.sql (already applied, and the schema
-- tuma-parcels.routes.ts actually queries — same status enum values,
-- same parcel_number/sender/recipient columns) already covers
-- tuma_parcel_types/tuma_booking_offices/tuma_parcels/tuma_parcel_tracking/
-- tuma_parcel_handovers/tuma_parcel_counters, so recreating them here just
-- collided (`relation "tuma_parcel_types" already exists`) without adding
-- anything the live code uses. Trimmed to the three tables 656 never
-- created: region/district geography and delivery OTPs. Neither is
-- currently referenced by any route file — kept because they were real,
-- deliberate work, not because anything depends on them yet.

-- ── Regions / districts ─────────────────────────────────────
CREATE TABLE tuma_regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id  UUID,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL UNIQUE,
  latitude    NUMERIC(10,8),
  longitude   NUMERIC(11,8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tuma_districts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  region_id   UUID NOT NULL REFERENCES tuma_regions(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Delivery OTPs ───────────────────────────────────────────
-- tuma_parcels already exists (656) — this FK resolves against it fine.
CREATE TABLE tuma_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id   UUID NOT NULL REFERENCES tuma_parcels(id),
  code        TEXT NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tuma_otps_parcel ON tuma_otps(parcel_id);
