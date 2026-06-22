-- ── Migration 008: Shipment Tasks, Time Entries, and TANSAD column ──────────

-- Add TANSAD number to shipment_cases if not present
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS tansad_number VARCHAR(100);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS port_of_loading VARCHAR(200);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS port_of_discharge VARCHAR(200);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS gross_weight_kg NUMERIC(14,3);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS cif_value_usd NUMERIC(14,2);
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS container_numbers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- ── Shipment Tasks ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL,
  title TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',   -- open | in_progress | complete | blocked
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low | medium | high | urgent
  assigned_to VARCHAR(255),
  due_date DATE,
  note TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_shipment ON shipment_tasks(shipment_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON shipment_tasks(tenant_id);

-- ── Shipment Time Entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL,
  member VARCHAR(255) NOT NULL,
  task_ref VARCHAR(255),
  hours NUMERIC(6,2) NOT NULL,
  note TEXT,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_shipment ON shipment_time_entries(shipment_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant ON shipment_time_entries(tenant_id);
