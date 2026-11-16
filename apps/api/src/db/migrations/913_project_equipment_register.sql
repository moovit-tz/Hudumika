-- Projects equipment register.
--
-- project_resources (448) stays the one durable identity per asset. This adds
-- the fields a register needs as real columns (they previously lived, where at
-- all, in the free-form metadata JSON from 586 — backfilled below), the
-- reservation → issue → return lifecycle on the existing allocations table,
-- and five append-only child records: events (assignment, location, change and
-- disposal history), meter readings, inspections, certificates, maintenance.
--
-- Ownership stays where it already is: depreciation and book value belong to
-- FinOps fixed_assets, GPS/telematics to Tracking vehicles, rental suppliers to
-- suppliers. Those are referenced (fixed_asset_id / vehicle_id /
-- owner_vendor_id), never copied. SEAL warehouse equipment is bound to a
-- warehouse compartment and is not a project asset, so it is not linked.
--
-- Rollback: drop the five project_equipment_* tables, drop the added columns,
-- restore the 448 allocation status CHECK (no ISSUED rows may remain).

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS ownership              VARCHAR(20) NOT NULL DEFAULT 'OWNED',
  ADD COLUMN IF NOT EXISTS rental_reference       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rental_start           DATE,
  ADD COLUMN IF NOT EXISTS rental_end             DATE,
  ADD COLUMN IF NOT EXISTS home_site              VARCHAR(200),
  ADD COLUMN IF NOT EXISTS current_location       VARCHAR(200),
  ADD COLUMN IF NOT EXISTS custodian_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condition              VARCHAR(20) NOT NULL DEFAULT 'GOOD',
  ADD COLUMN IF NOT EXISTS manufacturer           VARCHAR(120),
  ADD COLUMN IF NOT EXISTS year_built             INTEGER,
  ADD COLUMN IF NOT EXISTS registration_number    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS capacity_value         NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS capacity_unit          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS meter_unit             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS meter_reading          NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS meter_read_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspection_interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS next_inspection_due    DATE,
  ADD COLUMN IF NOT EXISTS service_interval_days  INTEGER,
  ADD COLUMN IF NOT EXISTS service_interval_meter NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS next_service_due       DATE,
  ADD COLUMN IF NOT EXISTS next_service_meter     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS fixed_asset_id         UUID REFERENCES fixed_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id             UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposal_reason        TEXT,
  ADD COLUMN IF NOT EXISTS notes                  TEXT;

ALTER TABLE project_resources DROP CONSTRAINT IF EXISTS project_resources_ownership_check;
ALTER TABLE project_resources ADD CONSTRAINT project_resources_ownership_check CHECK (ownership IN ('OWNED', 'RENTED', 'LEASED'));
ALTER TABLE project_resources DROP CONSTRAINT IF EXISTS project_resources_condition_check;
ALTER TABLE project_resources ADD CONSTRAINT project_resources_condition_check CHECK (condition IN ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'));
ALTER TABLE project_resources DROP CONSTRAINT IF EXISTS project_resources_meter_unit_check;
ALTER TABLE project_resources ADD CONSTRAINT project_resources_meter_unit_check CHECK (meter_unit IS NULL OR meter_unit IN ('HOURS', 'KM', 'MILES', 'CYCLES'));
ALTER TABLE project_resources DROP CONSTRAINT IF EXISTS project_resources_rental_check;
ALTER TABLE project_resources ADD CONSTRAINT project_resources_rental_check CHECK (rental_end IS NULL OR rental_start IS NULL OR rental_end >= rental_start);
ALTER TABLE project_resources DROP CONSTRAINT IF EXISTS project_resources_disposed_check;
ALTER TABLE project_resources ADD CONSTRAINT project_resources_disposed_check CHECK (disposed_at IS NULL OR status = 'DECOMMISSIONED');

-- Backfill from the 586 metadata keys the old fleet form wrote.
UPDATE project_resources SET
  current_location = COALESCE(current_location, NULLIF(metadata->>'location', '')),
  registration_number = COALESCE(registration_number, NULLIF(metadata->>'license_plate', '')),
  next_service_due = COALESCE(next_service_due, CASE WHEN metadata->>'next_maintenance_date' ~ '^\d{4}-\d{2}-\d{2}' THEN (metadata->>'next_maintenance_date')::date END),
  custodian_id = COALESCE(custodian_id, CASE WHEN metadata->>'user_id' ~* '^[0-9a-f-]{36}$' AND EXISTS (SELECT 1 FROM users u WHERE u.id = (metadata->>'user_id')::uuid AND u.tenant_id = project_resources.tenant_id) THEN (metadata->>'user_id')::uuid END)
WHERE metadata <> '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_resources_custodian ON project_resources(tenant_id, custodian_id) WHERE custodian_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resources_due ON project_resources(tenant_id, next_inspection_due, next_service_due);

-- Allocation lifecycle: REQUESTED → CONFIRMED (reserved) → ISSUED → COMPLETED (returned); RELEASED = cancelled.
ALTER TABLE project_resource_allocations
  ADD COLUMN IF NOT EXISTS request_key      VARCHAR(80),
  ADD COLUMN IF NOT EXISTS requested_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issued_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handed_to        UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_condition  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS issue_meter      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS returned_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_condition VARCHAR(20),
  ADD COLUMN IF NOT EXISTS return_meter     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cancelled_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason    TEXT;

ALTER TABLE project_resource_allocations DROP CONSTRAINT IF EXISTS project_resource_allocations_status_check;
ALTER TABLE project_resource_allocations ADD CONSTRAINT project_resource_allocations_status_check
  CHECK (status IN ('REQUESTED', 'CONFIRMED', 'ISSUED', 'COMPLETED', 'RELEASED'));
ALTER TABLE project_resource_allocations DROP CONSTRAINT IF EXISTS project_resource_allocations_dates_check;
ALTER TABLE project_resource_allocations ADD CONSTRAINT project_resource_allocations_dates_check CHECK (end_date >= start_date);
-- A retried request (same key) returns the first allocation instead of booking twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_res_alloc_request_key ON project_resource_allocations(tenant_id, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_res_alloc_resource_live ON project_resource_allocations(tenant_id, resource_id, start_date, end_date) WHERE status IN ('REQUESTED', 'CONFIRMED', 'ISSUED');

CREATE TABLE IF NOT EXISTS project_equipment_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id      UUID NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  allocation_id    UUID REFERENCES project_resource_allocations(id) ON DELETE SET NULL,
  project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type       VARCHAR(40) NOT NULL,
  from_location    VARCHAR(200),
  to_location      VARCHAR(200),
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  impersonated_by  UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_events_resource ON project_equipment_events(tenant_id, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_equipment_readings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id    UUID NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  allocation_id  UUID REFERENCES project_resource_allocations(id) ON DELETE SET NULL,
  reading        NUMERIC(14,2) NOT NULL CHECK (reading >= 0),
  unit           VARCHAR(20) NOT NULL CHECK (unit IN ('HOURS', 'KM', 'MILES', 'CYCLES')),
  source         VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'ISSUE', 'RETURN', 'SERVICE', 'IMPORT')),
  read_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_readings_resource ON project_equipment_readings(tenant_id, resource_id, read_at DESC);

CREATE TABLE IF NOT EXISTS project_equipment_inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id      UUID NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  allocation_id    UUID REFERENCES project_resource_allocations(id) ON DELETE SET NULL,
  inspection_type  VARCHAR(20) NOT NULL CHECK (inspection_type IN ('PRE_USE', 'PERIODIC', 'RETURN', 'STATUTORY')),
  result           VARCHAR(20) NOT NULL CHECK (result IN ('PASS', 'PASS_WITH_DEFECTS', 'FAIL')),
  defects          TEXT,
  next_due         DATE,
  inspected_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  inspected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (result <> 'FAIL' OR coalesce(trim(defects), '') <> '')
);
CREATE INDEX IF NOT EXISTS idx_equipment_inspections_resource ON project_equipment_inspections(tenant_id, resource_id, inspected_at DESC);

CREATE TABLE IF NOT EXISTS project_equipment_certificates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id        UUID NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  certificate_type   VARCHAR(80) NOT NULL,
  reference          VARCHAR(120),
  issuer             VARCHAR(200),
  issued_on          DATE,
  expires_on         DATE,
  blocks_assignment  BOOLEAN NOT NULL DEFAULT TRUE,
  file_id            UUID REFERENCES cloud_files(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX IF NOT EXISTS idx_equipment_certs_expiry ON project_equipment_certificates(tenant_id, expires_on);

CREATE TABLE IF NOT EXISTS project_equipment_maintenance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id       UUID NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  kind              VARCHAR(20) NOT NULL CHECK (kind IN ('SERVICE', 'REPAIR', 'BREAKDOWN')),
  status            VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  description       TEXT NOT NULL,
  scheduled_for     DATE,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  downtime_hours    NUMERIC(10,2) CHECK (downtime_hours IS NULL OR downtime_hours >= 0),
  meter_at_service  NUMERIC(14,2),
  cost              NUMERIC(14,2) CHECK (cost IS NULL OR cost >= 0),
  currency          VARCHAR(10),
  vendor_id         UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_maint_resource ON project_equipment_maintenance(tenant_id, resource_id, status);
-- One open repair/service at a time keeps "in maintenance" unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_maint_open ON project_equipment_maintenance(tenant_id, resource_id) WHERE status = 'IN_PROGRESS';

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['project_equipment_events', 'project_equipment_readings', 'project_equipment_inspections',
                             'project_equipment_certificates', 'project_equipment_maintenance'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid);', tbl);
  END LOOP;
END $$;

-- History, readings and inspections are evidence: never edited or deleted
-- except by the tenant itself being removed.
CREATE OR REPLACE FUNCTION project_equipment_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE links TEXT[] := ARRAY['allocation_id', 'project_id', 'actor_id', 'recorded_by', 'inspected_by'];
BEGIN
  -- ON DELETE SET NULL from a removed project, allocation or user only blanks a link.
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - links) = (to_jsonb(OLD) - links) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM project_resources WHERE id = OLD.resource_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['project_equipment_events', 'project_equipment_readings', 'project_equipment_inspections'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', tbl || '_append_only', tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION project_equipment_append_only();', tbl || '_append_only', tbl);
  END LOOP;
END $$;
