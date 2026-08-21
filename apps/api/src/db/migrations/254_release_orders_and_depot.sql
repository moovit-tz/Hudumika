-- Structured Release Order / Delivery Order + container/equipment depot
-- management (M6 of the ClearOS roadmap).
--
-- Before this migration, "release order" / "delivery order" existed only
-- as a DocType tag on case_documents (003_supporting.sql) — an uploaded
-- file with no structured fields (no container list, no validity window,
-- no release conditions) — and 'do_application' as a bare workflow stage
-- name. release_orders is the real, structured record; case_documents is
-- untouched and still exists for actual scanned/uploaded paperwork.
--
-- containers is embedded JSONB using the exact same shape as
-- packages/types/src/core.ts's Container interface (number/size/
-- seal_number/weight_kg) — this IS the platform's one container shape,
-- reused rather than reinvented, the same way shipment_cases.containers
-- already stores it.
--
-- Depot/equipment management is deliberately a NEW, separate concept, not
-- a merge of the three existing per-shipment container tables
-- (shipment_cases.containers JSONB, container_tracking, seal_containers).
-- 107_seal_gate_and_bond.sql's own header already established this
-- precedent explicitly: different moments in the supply chain, soft-linked
-- later rather than unified. depot_equipment is empty/available equipment
-- sitting at a depot, not yet tied to any shipment — a genuinely different
-- question from "which containers does shipment X have."
--
-- equipment_interchange_receipts replaces SEAL's free-text eir_reference +
-- unpersisted print-only HTML (SealConsignmentDetail.tsx's handlePrintEir)
-- with a real, queryable record — soft-linked via subject_type/subject_id
-- to whichever of the three container tables it concerns, same convention
-- as 252/253's subject_type/subject_id (no FK — see those migrations'
-- headers for why).
--
-- Both tenant-scoped tables get RLS, same policy shape as every other
-- tenant table in this schema.

CREATE TABLE IF NOT EXISTS release_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type VARCHAR(20) NOT NULL DEFAULT 'shipment',   -- 'shipment' | 'adhoc'
  subject_id UUID,
  order_type VARCHAR(20) NOT NULL,                        -- 'RELEASE_ORDER' | 'DELIVERY_ORDER'
  consignee_name TEXT NOT NULL,
  consignee_address TEXT,
  containers JSONB NOT NULL DEFAULT '[]'::jsonb,          -- Container[] — same shape as shipment_cases.containers
  release_conditions TEXT,
  valid_from DATE,
  valid_until DATE,
  carrier_name TEXT,
  vessel_voyage TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',            -- draft | issued | used | expired | cancelled
  order_number VARCHAR(100),
  issued_by UUID,
  issued_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depot_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  equipment_number VARCHAR(20) NOT NULL,
  equipment_type VARCHAR(20) NOT NULL,       -- CONTAINER_20FT | CONTAINER_40FT | CONTAINER_40HC | CHASSIS | GENSET | OTHER
  condition VARCHAR(20) NOT NULL DEFAULT 'GOOD',  -- GOOD | DAMAGED | UNDER_REPAIR
  location TEXT,                             -- depot/yard name — free text, no depot-facility entity in this platform
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE | ALLOCATED | OUT | MAINTENANCE
  owner_carrier TEXT,
  last_movement_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, equipment_number)
);

CREATE TABLE IF NOT EXISTS equipment_interchange_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type VARCHAR(20) NOT NULL DEFAULT 'adhoc',   -- 'depot_equipment' | 'container_tracking' | 'seal_container' | 'adhoc'
  subject_id UUID,
  equipment_number VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL,            -- GATE_IN | GATE_OUT
  party_name TEXT NOT NULL,
  condition_at_interchange VARCHAR(20) NOT NULL DEFAULT 'GOOD',  -- GOOD | DAMAGED
  damage_notes TEXT,
  seal_number VARCHAR(30),
  driver_name TEXT,
  vehicle_reg TEXT,
  signature_name TEXT,
  reference_number VARCHAR(100),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_orders_tenant ON release_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_release_orders_subject ON release_orders(tenant_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_depot_equipment_tenant ON depot_equipment(tenant_id);
CREATE INDEX IF NOT EXISTS idx_depot_equipment_status ON depot_equipment(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_eir_tenant ON equipment_interchange_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eir_subject ON equipment_interchange_receipts(tenant_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_eir_equipment ON equipment_interchange_receipts(tenant_id, equipment_number);

ALTER TABLE release_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE depot_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE depot_equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE equipment_interchange_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_interchange_receipts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'release_orders'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON release_orders
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'depot_equipment'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON depot_equipment
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'equipment_interchange_receipts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON equipment_interchange_receipts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
