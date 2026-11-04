-- Tuma float system extensions.
--
-- This file originally re-created tuma_float_accounts/tuma_float_settings/
-- tuma_float_transactions/tuma_beneficiaries/tuma_beneficiary_transactions/
-- tuma_user_beneficiaries a second time; 656_tuma_domain_tables.sql (already
-- applied, and the schema tuma-parcels.routes.ts's float endpoints actually
-- query) already covers all six, so recreating them here just collided
-- (`relation "tuma_float_accounts" already exists`). Trimmed to the four
-- tables 656 never created. Neither tuma_payment_providers nor
-- tuma_float_transaction_logs is referenced by any route file yet — kept
-- because they were real, deliberate work, not because anything depends on
-- them. tuma_user_offices/tuma_user_regions depend on tuma_booking_offices
-- (656) and tuma_regions (673, runs before this file) respectively.

-- ── Payment providers ───────────────────────────────────────
CREATE TABLE tuma_payment_providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Float transaction log (immutable ledger) ────────────────
CREATE TABLE tuma_float_transaction_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  float_account_id  UUID NOT NULL REFERENCES tuma_float_accounts(id),
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN (
    'FLOAT_CREATED','FLOAT_TOPPED_UP','FLOAT_ADJUSTED',
    'PARCEL_RECEIVED','PARCEL_CANCELED','POOL_TRANSFER',
    'MANUAL_DEDUCTION','STATUS_CHANGE','BENEFICIARY_DEDUCTION'
  )),
  amount            NUMERIC(12,2) NOT NULL,
  balance_before    NUMERIC(12,2) NOT NULL,
  balance_after     NUMERIC(12,2) NOT NULL,
  reference_type    TEXT,
  reference_id      TEXT,
  description       TEXT,
  metadata          JSONB,
  performed_by_id   UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tuma_float_log_account ON tuma_float_transaction_logs(float_account_id);
CREATE INDEX tuma_float_log_type ON tuma_float_transaction_logs(transaction_type);
CREATE INDEX tuma_float_log_date ON tuma_float_transaction_logs(created_at);

ALTER TABLE tuma_float_transaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_float_transaction_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_float_transaction_logs_tenant ON tuma_float_transaction_logs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Agent office assignments ────────────────────────────────
CREATE TABLE tuma_user_offices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  office_id   UUID NOT NULL REFERENCES tuma_booking_offices(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, office_id)
);

ALTER TABLE tuma_user_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_user_offices FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_user_offices_tenant ON tuma_user_offices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Agent region assignments ────────────────────────────────
CREATE TABLE tuma_user_regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  region_id   UUID NOT NULL REFERENCES tuma_regions(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, region_id)
);

ALTER TABLE tuma_user_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuma_user_regions FORCE ROW LEVEL SECURITY;
CREATE POLICY tuma_user_regions_tenant ON tuma_user_regions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
