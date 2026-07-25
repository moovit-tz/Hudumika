-- 106_seal_bonded_warehouse.sql
-- SEAL — bonded/customs-controlled warehouse (Increment 1: "the ledger").
-- Scope deliberately limited to spec Increment 1: perimeter hierarchy, lots
-- with a customs_status, and a single append-only dual-ledger movements
-- table carrying both a physical effect (location/qty) and an optional
-- fiscal effect (customs status/duty). No duty engine, no customs-authority
-- adapters, no guarantees/bond-headroom, no billing — those are later
-- increments per the spec's own build order (SEAL_bonded_wms_spec_and_prompt.md
-- §12). Table names are prefixed seal_ to avoid any confusion with the
-- unrelated warehouse_locations/cargo_manifests tables added in
-- 058_warehouse_and_cargo.sql (Tracking app's bin/dock-scheduling + 3D
-- load-planning feature — no customs concept at all, not reused here).

CREATE TABLE seal_compartments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                  VARCHAR(50) NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  warehouse_type        TEXT NOT NULL DEFAULT 'public_bonded'
                        CHECK (warehouse_type IN ('public_bonded','private_bonded','cfs','icd','virtual_icd','free_zone','duty_free_retail','excise')),
  licence_number        VARCHAR(100),
  licence_expiry        DATE,
  customs_office_code   VARCHAR(50),
  jurisdiction          CHAR(2) NOT NULL DEFAULT 'TZ',
  default_storage_days  INTEGER NOT NULL DEFAULT 180,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_seal_compartments_tenant ON seal_compartments(tenant_id);

ALTER TABLE seal_compartments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_compartments ON seal_compartments
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_zones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  code           VARCHAR(50) NOT NULL,
  name           VARCHAR(200) NOT NULL,
  zone_type      TEXT NOT NULL DEFAULT 'bulk'
                 CHECK (zone_type IN ('receiving','bulk','pick','vas','quarantine','outbound','yard')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (compartment_id, code)
);
CREATE INDEX idx_seal_zones_tenant ON seal_zones(tenant_id);
CREATE INDEX idx_seal_zones_compartment ON seal_zones(compartment_id);

ALTER TABLE seal_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_zones ON seal_zones
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_locations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  zone_id        UUID NOT NULL REFERENCES seal_zones(id) ON DELETE CASCADE,
  code           VARCHAR(50) NOT NULL,
  location_type  TEXT NOT NULL DEFAULT 'rack'
                 CHECK (location_type IN ('rack','floor','yard_slot','tank','dock','staging')),
  max_weight_kg  NUMERIC(12,2),
  is_pickable    BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (compartment_id, code)
);
CREATE INDEX idx_seal_locations_tenant ON seal_locations(tenant_id);
CREATE INDEX idx_seal_locations_zone ON seal_locations(zone_id);

ALTER TABLE seal_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_locations ON seal_locations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- THE CENTRAL ENTITY (spec §4.1). One quantity of one product, one owner,
-- one customs status, one storage clock.
CREATE TABLE seal_lots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id    UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE RESTRICT,
  owner_id          UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  -- Soft reference to an existing ClearOS clearance case this lot originated
  -- from, if any. Not a hard FK: shipment_cases is partitioned by created_at
  -- with a composite (id, created_at) primary key, so a plain single-column
  -- FK to it isn't possible without either widening this column to carry
  -- created_at too or adding a new unique index on that core partitioned
  -- table — both riskier than a soft, app-validated reference for a first
  -- pass. Looked up by id + tenant_id when displayed, same as any other
  -- cross-app reference in this codebase (see 097_comply_customer_link.sql's
  -- reasoning for the equivalent nullable-FK pattern).
  shipment_case_id  UUID,
  description       TEXT NOT NULL,
  hs_code           VARCHAR(20),
  country_of_origin CHAR(2),
  marks_and_numbers TEXT,
  customs_status    TEXT NOT NULL
                    CHECK (customs_status IN (
                      'FOREIGN_DUTY_SUSPENDED','FOREIGN_DUTY_PAID','TRANSIT','TEMPORARY_ADMISSION',
                      'INWARD_PROCESSING','OUTWARD_PROCESSING','EXPORT_DECLARED','EXPORTED',
                      'DOMESTIC','ZONE_RESTRICTED','ABANDONED','SEIZED','DESTROYED'
                    )),
  -- Free-text for now — no CustomsEntry/declaration aggregate yet (spec
  -- Increment 3). A real declaration workflow supersedes this column later;
  -- until then it just records whatever reference evidences the transition.
  entry_reference   TEXT,
  procedure_code    VARCHAR(20),
  current_location_id UUID REFERENCES seal_locations(id) ON DELETE SET NULL,
  qty_on_hand       NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_allocated     NUMERIC(18,4) NOT NULL DEFAULT 0,
  uom               VARCHAR(20) NOT NULL DEFAULT 'PCS',
  customs_value     NUMERIC(18,4),
  currency          CHAR(3),
  -- Populated by the duty engine in a later increment; zero/null until then.
  duty_at_risk      NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_at_risk       NUMERIC(18,4) NOT NULL DEFAULT 0,
  batch             VARCHAR(100),
  serial            VARCHAR(100),
  expiry_date       DATE,
  warehoused_on     DATE,
  expires_on        DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_lots_tenant ON seal_lots(tenant_id);
CREATE INDEX idx_seal_lots_compartment_status ON seal_lots(compartment_id, customs_status, expires_on);
CREATE INDEX idx_seal_lots_owner ON seal_lots(owner_id);

ALTER TABLE seal_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_lots ON seal_lots
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- THE DUAL LEDGER (spec §4.2). One append-only table; every row carries a
-- physical effect (location/qty) and an optional fiscal effect (customs
-- status/duty). The inventory view and the customs stock account are both
-- just projections over these same rows — never a second synchronized table.
CREATE TABLE seal_movements (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id           UUID,
  actor_type         TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','system','api_client')),
  movement_type      TEXT NOT NULL CHECK (movement_type IN (
                       'receipt','putaway','pick','transfer','adjust','release','destroy','status_change'
                     )),
  lot_id             UUID NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  -- physical effect
  from_location_id   UUID REFERENCES seal_locations(id),
  to_location_id     UUID REFERENCES seal_locations(id),
  qty_delta          NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- fiscal effect (nullable — a pure location move has no fiscal effect)
  from_customs_status TEXT,
  to_customs_status   TEXT,
  entry_reference     TEXT,
  duty_delta          NUMERIC(18,4),
  tax_delta           NUMERIC(18,4),
  -- provenance
  reason_code        TEXT,
  reference          TEXT,
  -- hash chain (spec §8.3): hash = sha256(prev_hash || canonical_json(payload) || occurred_at || actor_id),
  -- scoped per lot_id so each lot's history is independently verifiable.
  prev_hash          TEXT,
  hash               TEXT NOT NULL
);
CREATE INDEX idx_seal_movements_tenant ON seal_movements(tenant_id);
CREATE INDEX idx_seal_movements_lot ON seal_movements(lot_id, occurred_at);

ALTER TABLE seal_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_movements ON seal_movements
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only enforcement at the database layer, not by convention
-- (spec: "enforced by database permissions and a trigger"). Corrections
-- are compensating movements, never edits.
CREATE OR REPLACE FUNCTION seal_movements_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'seal_movements is append-only — % is not permitted (use a compensating movement instead)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seal_movements_no_update
  BEFORE UPDATE ON seal_movements
  FOR EACH ROW EXECUTE FUNCTION seal_movements_block_mutation();

CREATE TRIGGER seal_movements_no_delete
  BEFORE DELETE ON seal_movements
  FOR EACH ROW EXECUTE FUNCTION seal_movements_block_mutation();
