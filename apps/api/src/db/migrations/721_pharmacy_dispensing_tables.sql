-- Pharmaceutical (industry-readiness backlog item 23), the dispensing
-- half per the business's own scope decision (both dispensing AND
-- manufacturing are in scope). Manufacturing substantially reuses
-- finance_production_recipes/finance_quality_inspections/
-- finance_production_stages, already built and already hardened this
-- session (the completion-gate fix in finance-production.service.ts). This
-- migration is the genuinely new half: pharmacy counter dispensing against
-- a prescription, with the backlog's own named controls — batch/expiry/
-- FEFO, quarantine/recall, and an attributable pharmacist-approval gate —
-- enforced for real against the inventory_stock_levels batch/expiry data
-- this platform already stores but never enforced anywhere until now.

-- A tenant's own medicine catalog: structured strength/form/pack, not
-- free-text job fields (the backlog's own P1). Deliberately NOT a national/
-- global drug database — this platform has no such reference data, and
-- inventing one would fabricate exactly the kind of regulatory claim the
-- backlog warns against. item_id links the catalog entry to real,
-- stock-tracked inventory.
CREATE TABLE IF NOT EXISTS pharmacy_medications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  item_id       UUID NOT NULL REFERENCES inventory_items(id),
  name          TEXT NOT NULL,
  strength      TEXT NOT NULL,
  form          TEXT NOT NULL CHECK (form IN ('tablet','capsule','syrup','injection','cream','drops','inhaler','other')),
  pack_size     TEXT,
  controlled    BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacy_medications_item_idx ON pharmacy_medications (tenant_id, item_id);
ALTER TABLE pharmacy_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_medications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pharmacy_medications
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- A counter prescription, deliberately independent of health_encounters —
-- a pharmacy dispenses prescriptions written by any prescriber, not only
-- ones created inside this platform's own Healthcare module (the
-- backlog's own P0: "split pharmacy dispensing from pharmaceutical
-- manufacturing" implies dispensing is also its own thing, separate from
-- a clinical visit). prescriber_name/license are recorded as given, never
-- validated against a real licensing registry this platform doesn't have.
CREATE TABLE IF NOT EXISTS pharmacy_prescriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  work_id           UUID NOT NULL,
  medication_id     UUID NOT NULL REFERENCES pharmacy_medications(id),
  patient_name      TEXT NOT NULL,
  patient_contact   TEXT,
  prescriber_name   TEXT NOT NULL,
  prescriber_license TEXT,
  dosage            TEXT NOT NULL,
  quantity_prescribed NUMERIC(18,4) NOT NULL CHECK (quantity_prescribed > 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','dispensed','rejected','returned')),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS pharmacy_prescriptions_med_idx ON pharmacy_prescriptions (tenant_id, medication_id);
ALTER TABLE pharmacy_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_prescriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pharmacy_prescriptions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- The actual dispensing event — one row per prescription once filled,
-- carrying exactly which batch it came from (for recall traceability) and
-- whether a substitution happened and why.
CREATE TABLE IF NOT EXISTS pharmacy_dispensations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  prescription_id   UUID NOT NULL REFERENCES pharmacy_prescriptions(id),
  item_id           UUID NOT NULL REFERENCES inventory_items(id),
  batch_no          TEXT NOT NULL,
  quantity          NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  substituted_item_id UUID REFERENCES inventory_items(id),
  substitution_reason TEXT,
  dispensed_by      UUID REFERENCES users(id),
  dispensed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  movement_id       BIGINT, -- the real inventory_movements row this dispensing actually posted
  returned_at       TIMESTAMPTZ,
  returned_by       UUID REFERENCES users(id),
  return_movement_id BIGINT
);
CREATE INDEX IF NOT EXISTS pharmacy_dispensations_batch_idx ON pharmacy_dispensations (tenant_id, item_id, batch_no);
ALTER TABLE pharmacy_dispensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_dispensations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pharmacy_dispensations
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Quarantine/recall at the batch level, independent of any one allocation
-- — the backlog's own "quarantine/recall and controlled-product access".
-- An active hold on an item+batch blocks dispensing from it outright;
-- releasing it is a real, attributed action, not a silent flag flip.
CREATE TABLE IF NOT EXISTS pharmacy_batch_holds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  item_id     UUID NOT NULL REFERENCES inventory_items(id),
  batch_no    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  reason      TEXT NOT NULL,
  held_by     UUID REFERENCES users(id),
  held_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_by UUID REFERENCES users(id),
  released_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pharmacy_batch_holds_lookup_idx ON pharmacy_batch_holds (tenant_id, item_id, batch_no, status);
ALTER TABLE pharmacy_batch_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_batch_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pharmacy_batch_holds
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
