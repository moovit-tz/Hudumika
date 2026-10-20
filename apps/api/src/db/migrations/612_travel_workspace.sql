-- Travel workspace — trips, itineraries, bookings, expenses

CREATE TABLE IF NOT EXISTS travel_trips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES users(id),
  title         text NOT NULL,
  destination   text NOT NULL,
  country_code  text,
  cover_image   text,
  start_date    date,
  end_date      date,
  status        text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','upcoming','active','completed','cancelled')),
  budget_amount numeric(14,2) DEFAULT 0,
  budget_currency text NOT NULL DEFAULT 'USD',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS travel_itinerary_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id       uuid NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  day_number    int NOT NULL DEFAULT 1,
  sort_order    int NOT NULL DEFAULT 0,
  item_type     text NOT NULL DEFAULT 'activity' CHECK (item_type IN ('flight','hotel','transport','activity','restaurant','meeting','other')),
  title         text NOT NULL,
  description   text,
  location      text,
  start_time    timestamptz,
  end_time      timestamptz,
  confirmation  text,
  cost          numeric(14,2),
  currency      text DEFAULT 'USD',
  status        text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','cancelled')),
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS travel_bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id       uuid REFERENCES travel_trips(id) ON DELETE SET NULL,
  created_by    uuid NOT NULL REFERENCES users(id),
  booking_type  text NOT NULL DEFAULT 'flight' CHECK (booking_type IN ('flight','hotel','car','train','bus','ferry','tour','insurance','other')),
  provider      text,
  reference     text,
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  start_date    timestamptz,
  end_date      timestamptz,
  cost          numeric(14,2),
  currency      text DEFAULT 'USD',
  passengers    jsonb DEFAULT '[]'::jsonb,
  details       jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS travel_expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id       uuid REFERENCES travel_trips(id) ON DELETE SET NULL,
  created_by    uuid NOT NULL REFERENCES users(id),
  category      text NOT NULL DEFAULT 'other' CHECK (category IN ('flights','accommodation','transport','food','activities','insurance','shopping','other')),
  description   text NOT NULL,
  amount        numeric(14,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  expense_date  date NOT NULL DEFAULT CURRENT_DATE,
  receipt_file_id uuid,
  reimbursable  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_travel_trips_tenant      ON travel_trips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_travel_trips_created_by   ON travel_trips(created_by);
CREATE INDEX IF NOT EXISTS idx_travel_itinerary_trip     ON travel_itinerary_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_tenant    ON travel_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_travel_bookings_trip      ON travel_bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_expenses_tenant    ON travel_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_travel_expenses_trip      ON travel_expenses(trip_id);

-- RLS
ALTER TABLE travel_trips             ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_itinerary_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_expenses          ENABLE ROW LEVEL SECURITY;

ALTER TABLE travel_trips             FORCE ROW LEVEL SECURITY;
ALTER TABLE travel_itinerary_items   FORCE ROW LEVEL SECURITY;
ALTER TABLE travel_bookings          FORCE ROW LEVEL SECURITY;
ALTER TABLE travel_expenses          FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_trips_tenant             ON travel_trips             USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY travel_itinerary_items_tenant   ON travel_itinerary_items   USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY travel_bookings_tenant          ON travel_bookings          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY travel_expenses_tenant          ON travel_expenses          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
