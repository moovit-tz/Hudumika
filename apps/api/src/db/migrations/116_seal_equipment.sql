-- 116_seal_equipment.sql
-- Warehouse equipment/tools (forklifts, pallet jacks, scanners, racking
-- hardware, HVAC/reefer plant) with maintenance history and condition
-- tracking. Deliberately its own table, distinct from Tracking/Fleet's
-- `vehicles` (road trucks) and its unrelated `warehouse_locations`/
-- `parts_stock` (a different, spare-parts-for-trucks system) — same naming
-- collision this session's planning pass already flagged once for the
-- switcher/dashboard work. "Alerts" (due for service, out of service) are
-- computed live from next_service_due_date/status, never a separate stored
-- flag that could drift out of sync.
CREATE TABLE seal_equipment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id        UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  equipment_type         TEXT NOT NULL CHECK (equipment_type IN (
                          'forklift','pallet_jack','reach_truck','scanner','racking','conveyor',
                          'reefer_unit','generator','hvac','scale','other'
                        )),
  asset_tag             VARCHAR(100) NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  status                TEXT NOT NULL DEFAULT 'operational'
                        CHECK (status IN ('operational','under_maintenance','out_of_service','retired')),
  condition             TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','fair','poor')),
  last_service_date     DATE,
  next_service_due_date DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (compartment_id, asset_tag)
);
CREATE INDEX idx_seal_equipment_tenant ON seal_equipment(tenant_id);
CREATE INDEX idx_seal_equipment_compartment ON seal_equipment(compartment_id);

ALTER TABLE seal_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_equipment ON seal_equipment
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only-in-spirit history (no update/delete trigger — lighter than
-- seal_movements since a maintenance log correction is rare and low-stakes,
-- but every record is still a real logged event, never a rolled-up count).
CREATE TABLE seal_equipment_maintenance_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  equipment_id      UUID NOT NULL REFERENCES seal_equipment(id) ON DELETE CASCADE,
  maintenance_type  TEXT NOT NULL CHECK (maintenance_type IN ('inspection','repair','service','calibration')),
  performed_at      DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by      VARCHAR(255),
  description       TEXT,
  cost              NUMERIC(12,2),
  next_due_date     DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_equip_maint_tenant ON seal_equipment_maintenance_records(tenant_id);
CREATE INDEX idx_seal_equip_maint_equipment ON seal_equipment_maintenance_records(equipment_id, performed_at);

ALTER TABLE seal_equipment_maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_equip_maint ON seal_equipment_maintenance_records
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
