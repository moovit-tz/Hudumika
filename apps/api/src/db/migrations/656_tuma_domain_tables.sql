-- Migration 656: Tuma — parcel logistics domain tables
-- Ported from tuma-api Prisma schema (commit e0b56c1), adapted to Hudumika
-- conventions: UUIDs, tenant_id + RLS, withTenant() required, timestamptz.

-- ── Parcel types (classification: "Document", "Fragile", "Heavy" etc.) ──

CREATE TABLE tuma_parcel_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  description   TEXT,
  min_weight    NUMERIC(10,2),
  max_weight    NUMERIC(10,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_parcel_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_parcel_types FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_parcel_types_tenant ON tuma_parcel_types
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Booking offices (physical pick-up / drop-off points) ──

CREATE TABLE tuma_booking_offices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  code          TEXT,
  address       TEXT,
  phone         TEXT,
  district_id   UUID,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  lat           NUMERIC(10,7),
  lng           NUMERIC(10,7),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_booking_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_booking_offices FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_booking_offices_tenant ON tuma_booking_offices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Fleet: brands, models, fleet types, vehicles ──

CREATE TABLE tuma_vehicle_brands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_vehicle_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_vehicle_brands FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_vehicle_brands_tenant ON tuma_vehicle_brands
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_vehicle_models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  brand_id      UUID NOT NULL REFERENCES tuma_vehicle_brands(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_vehicle_models FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_vehicle_models_tenant ON tuma_vehicle_models
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_fleet_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_fleet_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_fleet_types FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_fleet_types_tenant ON tuma_fleet_types
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_vehicles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  registration_number   TEXT NOT NULL,
  seats                 INT,
  year                  INT,
  color                 TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','maintenance','retired')),
  fleet_type_id         UUID REFERENCES tuma_fleet_types(id),
  brand_id              UUID REFERENCES tuma_vehicle_brands(id),
  model_id              UUID REFERENCES tuma_vehicle_models(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_vehicles FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_vehicles_tenant ON tuma_vehicles
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Agents (field operators — mapped to Hudumika users table via user_id) ──

CREATE TABLE tuma_agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  agent_role    TEXT NOT NULL DEFAULT 'agent'
                CHECK (agent_role IN ('super_agent','agent','trip_agent')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  max_devices   INT NOT NULL DEFAULT 2,
  device_id     TEXT,
  office_id     UUID REFERENCES tuma_booking_offices(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
ALTER TABLE tuma_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_agents FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_agents_tenant ON tuma_agents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Parcels (core business object — the 6-state lifecycle) ──

CREATE TABLE tuma_parcels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  parcel_number     TEXT NOT NULL,
  name              TEXT,
  description       TEXT,
  weight            NUMERIC(10,2),
  value             NUMERIC(14,2),
  price             NUMERIC(14,2),
  units             INT NOT NULL DEFAULT 1,
  sender_name       TEXT,
  sender_phone      TEXT,
  recipient_name    TEXT,
  recipient_phone   TEXT,
  status            TEXT NOT NULL DEFAULT 'RECEIVED'
                    CHECK (status IN ('RECEIVED','DISPATCHED','OFFLOADED',
                                       'DELIVERED','PICKED_UP','CANCELED')),
  origin_office_id  UUID REFERENCES tuma_booking_offices(id),
  dest_office_id    UUID REFERENCES tuma_booking_offices(id),
  vehicle_id        UUID REFERENCES tuma_vehicles(id),
  parcel_type_id    UUID REFERENCES tuma_parcel_types(id),
  dispatcher_id     UUID REFERENCES users(id),
  offloader_id      UUID REFERENCES users(id),
  deliverer_id      UUID REFERENCES users(id),
  canceler_id       UUID REFERENCES users(id),
  travel_date       TIMESTAMPTZ,
  delivered_date    TIMESTAMPTZ,
  picked_up_date    TIMESTAMPTZ,
  canceled_at       TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, parcel_number)
);
ALTER TABLE tuma_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_parcels FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_parcels_tenant ON tuma_parcels
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_tuma_parcels_status ON tuma_parcels(tenant_id, status);
CREATE INDEX idx_tuma_parcels_parcel_number ON tuma_parcels(tenant_id, parcel_number);

-- ── Parcel tracking (status history / audit trail) ──

CREATE TABLE tuma_parcel_tracking (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  parcel_id     UUID NOT NULL REFERENCES tuma_parcels(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  location      TEXT,
  description   TEXT,
  actor_id      UUID REFERENCES users(id),
  tracked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_parcel_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_parcel_tracking FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_parcel_tracking_tenant ON tuma_parcel_tracking
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_tuma_parcel_tracking_parcel ON tuma_parcel_tracking(parcel_id);

-- ── Parcel counter (daily sequential number generator, tenant-scoped) ──

CREATE TABLE tuma_parcel_counters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  counter_date  DATE NOT NULL,
  count         INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, counter_date)
);
ALTER TABLE tuma_parcel_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_parcel_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_parcel_counters_tenant ON tuma_parcel_counters
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Parcel handover (chain-of-custody between agents) ──

CREATE TABLE tuma_parcel_handovers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  parcel_id     UUID NOT NULL REFERENCES tuma_parcels(id),
  from_user_id  UUID NOT NULL REFERENCES users(id),
  to_user_id    UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
ALTER TABLE tuma_parcel_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_parcel_handovers FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_parcel_handovers_tenant ON tuma_parcel_handovers
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Float system (agent working capital) ──

CREATE TABLE tuma_float_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  total_float       NUMERIC(14,2) NOT NULL DEFAULT 0,
  used_float        NUMERIC(14,2) NOT NULL DEFAULT 0,
  available_float   NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_pool           BOOLEAN NOT NULL DEFAULT false,
  pool_id           UUID REFERENCES tuma_float_accounts(id),
  last_replenished  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
ALTER TABLE tuma_float_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_float_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_float_accounts_tenant ON tuma_float_accounts
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_float_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  min_float           NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_float           NUMERIC(14,2) NOT NULL DEFAULT 1000000,
  auto_replenish      BOOLEAN NOT NULL DEFAULT false,
  replenish_threshold NUMERIC(14,2),
  replenish_amount    NUMERIC(14,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_float_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_float_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_float_settings_tenant ON tuma_float_settings
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_float_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  float_account_id        UUID NOT NULL REFERENCES tuma_float_accounts(id),
  amount                  NUMERIC(14,2) NOT NULL,
  type                    TEXT NOT NULL
                          CHECK (type IN ('REPLENISHMENT','DEDUCTION','COMMISSION',
                                          'ADJUSTMENT','POOL_ASSIGNMENT')),
  description             TEXT,
  balance_after           NUMERIC(14,2),
  payment_provider        TEXT,
  payment_reference       TEXT,
  payment_status          TEXT CHECK (payment_status IN ('PAID','PENDING','FAILED')),
  performed_by            UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_float_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_float_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_float_transactions_tenant ON tuma_float_transactions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE INDEX idx_tuma_float_txn_account ON tuma_float_transactions(float_account_id);

-- ── Beneficiary settlement (revenue-share recipients) ──

CREATE TABLE tuma_beneficiaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  name              TEXT NOT NULL,
  account_type      TEXT,
  account_number    TEXT,
  bank_name         TEXT,
  rate              NUMERIC(5,4),
  frequency         TEXT NOT NULL DEFAULT 'MONTHLY'
                    CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY')),
  total_collected   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deducted    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_remaining   NUMERIC(14,2) NOT NULL DEFAULT 0,
  missed_deductions INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','COMPLETED','OVERDUE','PAUSED','CANCELLED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_beneficiaries FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_beneficiaries_tenant ON tuma_beneficiaries
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_user_beneficiaries (
  user_id       UUID NOT NULL REFERENCES users(id),
  beneficiary_id UUID NOT NULL REFERENCES tuma_beneficiaries(id),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  PRIMARY KEY (user_id, beneficiary_id)
);
ALTER TABLE tuma_user_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_user_beneficiaries FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_user_beneficiaries_tenant ON tuma_user_beneficiaries
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_beneficiary_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  beneficiary_id  UUID NOT NULL REFERENCES tuma_beneficiaries(id),
  amount          NUMERIC(14,2) NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('CREDIT','DEBIT')),
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  reference       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_beneficiary_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_beneficiary_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_beneficiary_transactions_tenant ON tuma_beneficiary_transactions
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Shifts (agent work schedules) ──

CREATE TABLE tuma_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_shifts_tenant ON tuma_shifts
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE tuma_user_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  shift_id      UUID NOT NULL REFERENCES tuma_shifts(id),
  assigned_by   UUID REFERENCES users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tuma_user_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_user_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_user_shifts_tenant ON tuma_user_shifts
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
