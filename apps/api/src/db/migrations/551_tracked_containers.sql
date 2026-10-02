-- Migration 551: Tracked containers with real DB persistence
-- Replaces the in-memory Map<string,any> in tracker.routes.ts

-- ── Main container registry ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracked_containers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  container_number TEXT       NOT NULL,
  iso_code        TEXT        NOT NULL DEFAULT '20G1',
  size_type       TEXT        NOT NULL DEFAULT 'Dry Standard - 20 feet Container',
  ownership       TEXT        NOT NULL DEFAULT 'Privately Owned / Line Lease',
  condition       TEXT        NOT NULL DEFAULT 'cargo_worthy',

  -- Carrier identity
  carrier_name    TEXT,
  carrier_code    TEXT,
  color_hex       TEXT,

  -- Lifecycle
  lifecycle_stage TEXT        NOT NULL DEFAULT 'AVAILABLE_AT_DEPOT',

  -- Cross-app links (shipment_cases is partitioned → bare UUID, no FK constraint)
  shipment_id     UUID,
  customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL,

  -- Physical specs (JSON so we can add fields without schema change)
  dimensions      JSONB       NOT NULL DEFAULT '{}',
  compliance      JSONB       NOT NULL DEFAULT '{}',
  current_depot   JSONB       NOT NULL DEFAULT '{}',
  classification  JSONB       NOT NULL DEFAULT '{}',
  cargo_breakdown JSONB       NOT NULL DEFAULT '{}',

  -- Notes
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE (tenant_id, container_number)
);

ALTER TABLE tracked_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_containers FORCE ROW LEVEL SECURITY;

CREATE POLICY tc_tenant ON tracked_containers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX idx_tc_tenant  ON tracked_containers(tenant_id);
CREATE INDEX idx_tc_shipment ON tracked_containers(shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX idx_tc_customer ON tracked_containers(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_tc_stage   ON tracked_containers(tenant_id, lifecycle_stage);

-- ── Survey / inspection reports ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS container_survey_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  container_id    UUID        NOT NULL REFERENCES tracked_containers(id) ON DELETE CASCADE,

  grade           TEXT        NOT NULL DEFAULT 'Grade A',
  rating_label    TEXT,
  survey_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  surveyor_name   TEXT,
  surveyor_notes  TEXT,
  photos          JSONB       NOT NULL DEFAULT '[]',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE container_survey_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_survey_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY csr_tenant ON container_survey_reports
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX idx_csr_container ON container_survey_reports(container_id);

-- ── Repair log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS container_repairs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  container_id    UUID        NOT NULL REFERENCES tracked_containers(id) ON DELETE CASCADE,

  description     TEXT        NOT NULL,
  repair_type     TEXT        NOT NULL DEFAULT 'cosmetic',
  repair_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved        BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE container_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_repairs FORCE ROW LEVEL SECURITY;

CREATE POLICY cr_tenant ON container_repairs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX idx_cr_container ON container_repairs(container_id);

-- ── Stage / lifecycle history ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS container_stage_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  container_id    UUID        NOT NULL REFERENCES tracked_containers(id) ON DELETE CASCADE,

  stage           TEXT        NOT NULL,
  location        TEXT,
  notes           TEXT,
  recorded_by     UUID        REFERENCES users(id) ON DELETE SET NULL,

  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE container_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_stage_history FORCE ROW LEVEL SECURITY;

CREATE POLICY csh_tenant ON container_stage_history
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX idx_csh_container   ON container_stage_history(container_id);
CREATE INDEX idx_csh_recorded_at ON container_stage_history(container_id, recorded_at DESC);
