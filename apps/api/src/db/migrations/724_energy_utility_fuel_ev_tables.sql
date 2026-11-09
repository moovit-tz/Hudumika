-- Energy & Utilities (industry-readiness backlog item 26), all three
-- modules per the business's own scope decision — utility billing, fuel
-- retail, and EV charging are genuinely separate business models (the
-- backlog's own P0: "separate utility billing, fuel retail and EV
-- charging modules"), kept as distinct table groups rather than one
-- forced-generic "meter" concept.

-- ── Utility billing: meters, effective-dated tariffs, readings/corrections ──

CREATE TABLE IF NOT EXISTS energy_meters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  work_id       UUID NOT NULL,
  meter_number  TEXT NOT NULL,
  service_point TEXT,
  meter_type    TEXT NOT NULL CHECK (meter_type IN ('electricity','water','gas')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','removed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
ALTER TABLE energy_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_meters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON energy_meters
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Effective-dated, same discipline tax_codes already uses: a rate change
-- is a new tariff row with its own window, never an edit to history.
CREATE TABLE IF NOT EXISTS energy_tariffs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  meter_type     TEXT NOT NULL CHECK (meter_type IN ('electricity','water','gas','ev')),
  name           TEXT NOT NULL,
  rate_per_unit  NUMERIC(18,4) NOT NULL CHECK (rate_per_unit >= 0),
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS energy_tariffs_lookup_idx ON energy_tariffs (tenant_id, meter_type, effective_from);
ALTER TABLE energy_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_tariffs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON energy_tariffs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS energy_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  meter_id          UUID NOT NULL REFERENCES energy_meters(id),
  reading_date      DATE NOT NULL,
  reading_value     NUMERIC(18,4) NOT NULL,
  consumption       NUMERIC(18,4) NOT NULL,
  is_correction     BOOLEAN NOT NULL DEFAULT false,
  corrects_reading_id UUID REFERENCES energy_readings(id),
  -- active: the current truth for this period. corrected: superseded by a
  -- later correction — kept, never deleted, so the chain stays auditable.
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','corrected')),
  billed            BOOLEAN NOT NULL DEFAULT false,
  recorded_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS energy_readings_meter_idx ON energy_readings (tenant_id, meter_id, reading_date);
ALTER TABLE energy_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_readings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON energy_readings
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS energy_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  reading_id  UUID NOT NULL REFERENCES energy_readings(id),
  tariff_id   UUID NOT NULL REFERENCES energy_tariffs(id),
  amount      NUMERIC(18,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','voided')),
  voided_at   TIMESTAMPTZ,
  voided_by   UUID REFERENCES users(id),
  void_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS energy_charges_reading_idx ON energy_charges (tenant_id, reading_id);
ALTER TABLE energy_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON energy_charges
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ── Fuel retail: tanks, nozzles, deliveries, shift reconciliation ──

CREATE TABLE IF NOT EXISTS fuel_tanks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  work_id        UUID NOT NULL,
  tank_number    TEXT NOT NULL,
  fuel_type      TEXT NOT NULL CHECK (fuel_type IN ('petrol','diesel','kerosene')),
  capacity_litres NUMERIC(18,2) NOT NULL CHECK (capacity_litres > 0),
  current_volume_litres NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
ALTER TABLE fuel_tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_tanks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel_tanks
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS fuel_nozzles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  tank_id       UUID NOT NULL REFERENCES fuel_tanks(id),
  nozzle_number TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fuel_nozzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_nozzles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel_nozzles
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS fuel_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  tank_id           UUID NOT NULL REFERENCES fuel_tanks(id),
  delivered_litres  NUMERIC(18,2) NOT NULL CHECK (delivered_litres > 0),
  supplier_reference TEXT,
  delivered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fuel_deliveries_tank_idx ON fuel_deliveries (tenant_id, tank_id);
ALTER TABLE fuel_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel_deliveries
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS fuel_shifts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  work_id              UUID NOT NULL,
  nozzle_id            UUID NOT NULL REFERENCES fuel_nozzles(id),
  opened_by            UUID REFERENCES users(id),
  opening_totalizer    NUMERIC(18,2) NOT NULL,
  closing_totalizer    NUMERIC(18,2),
  litres_dispensed     NUMERIC(18,2),
  -- A real signal, not an invented measurement: positive only when the
  -- nozzle meter claims more fuel left the tank than the tank's own
  -- recorded volume could have supplied — a genuine discrepancy worth
  -- investigating, not a fabricated dip-reading.
  tank_variance_litres NUMERIC(18,2),
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at            TIMESTAMPTZ,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS fuel_shifts_nozzle_idx ON fuel_shifts (tenant_id, nozzle_id, status);
ALTER TABLE fuel_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fuel_shifts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ── EV charging: connectors, sessions, settlement ──

CREATE TABLE IF NOT EXISTS ev_connectors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  work_id          UUID NOT NULL,
  connector_number TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','charging','faulted')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
ALTER TABLE ev_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ev_connectors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ev_connectors
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS ev_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  connector_id UUID NOT NULL REFERENCES ev_connectors(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  energy_kwh   NUMERIC(18,4),
  tariff_id    UUID REFERENCES energy_tariffs(id),
  amount       NUMERIC(18,2),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','settled')),
  started_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ev_sessions_connector_idx ON ev_sessions (tenant_id, connector_id);
ALTER TABLE ev_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ev_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ev_sessions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
