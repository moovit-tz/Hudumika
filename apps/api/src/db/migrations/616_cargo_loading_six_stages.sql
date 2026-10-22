-- 616_cargo_loading_six_stages.sql
-- Cargo Loading 6-stage lifecycle and traceable dispatch extensions

ALTER TABLE cargo_manifests
  ADD COLUMN IF NOT EXISTS stage VARCHAR(30) NOT NULL DEFAULT 'JOB_SELECTION',
  ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) DEFAULT 'SHIPMENT',
  ADD COLUMN IF NOT EXISTS booking_id UUID,
  ADD COLUMN IF NOT EXISTS release_doc_id UUID,
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loading_bay VARCHAR(100),
  ADD COLUMN IF NOT EXISTS dock_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS seal_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS secondary_seal_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS planner_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS loader_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS checker_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS dispatcher_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exceptions_acknowledged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discrepancy_notes TEXT,
  ADD COLUMN IF NOT EXISTS damage_notes TEXT,
  ADD COLUMN IF NOT EXISTS verification_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cargo_items
  ADD COLUMN IF NOT EXISTS unit_type VARCHAR(40) NOT NULL DEFAULT 'PALLET',
  ADD COLUMN IF NOT EXISTS loaded_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damage_description TEXT,
  ADD COLUMN IF NOT EXISTS stacking_max INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS is_fragile BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handling_instructions VARCHAR(300),
  ADD COLUMN IF NOT EXISTS source_ref VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_stage ON cargo_manifests (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_cargo_manifests_status ON cargo_manifests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cargo_manifests_booking ON cargo_manifests (booking_id);
CREATE INDEX IF NOT EXISTS idx_cargo_manifests_release ON cargo_manifests (release_doc_id);
