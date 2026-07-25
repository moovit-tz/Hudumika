-- 107_seal_gate_and_bond.sql
-- SEAL Increment 2 (adapted): guarantees & bond headroom, and the
-- pre-arrival → gate → devanning pipeline that feeds Increment 1's lot
-- ledger. Scope trimmed from the full spec Increment 2: gate-in/out and
-- devanning are built as normal online pages (this codebase has no
-- offline-first PWA infrastructure anywhere to extend — a real local
-- write-ahead-log + conflict-resolution model is a standing deferral, not
-- attempted here). Reefer monitoring, dangerous-goods segregation, and yard
-- slotting/mapping are likewise deferred — not required for this
-- increment's own exit criterion (pre-alert → devanned lots with a
-- decremented bond).
--
-- Deliberately NOT reusing ClearOS/CargoTracker's `container_tracking`
-- table (005_demurrage_quotations_consignments.sql): that table tracks
-- demurrage/detention *billed by a shipping line at a port terminal*
-- before a container is picked up — a different moment in the supply
-- chain from a container physically gating in to *this* bonded facility.
-- They can be linked later (a SEAL container's originating shipment is
-- already soft-referenced the same way seal_lots.shipment_case_id is).

CREATE TABLE seal_guarantees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instrument_type TEXT NOT NULL CHECK (instrument_type IN ('cash','bank_guarantee','insurance_bond','corporate_undertaking')),
  issuer          VARCHAR(200),
  reference       VARCHAR(100) NOT NULL,
  face_value      NUMERIC(18,4) NOT NULL,
  currency        CHAR(3) NOT NULL,
  effective_from  DATE NOT NULL,
  expires_on      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);
CREATE INDEX idx_seal_guarantees_tenant ON seal_guarantees(tenant_id);

ALTER TABLE seal_guarantees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_guarantees ON seal_guarantees
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE seal_compartments ADD COLUMN guarantee_id UUID REFERENCES seal_guarantees(id) ON DELETE SET NULL;

-- Audit trail for headroom overrides (spec §2.4's "hard block ... with an
-- override that requires named authorization and writes an audit record").
CREATE TABLE seal_bond_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guarantee_id UUID NOT NULL REFERENCES seal_guarantees(id) ON DELETE CASCADE,
  actor_id     UUID,
  reason       TEXT NOT NULL,
  shortfall    NUMERIC(18,4) NOT NULL,
  currency     CHAR(3) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_bond_overrides_tenant ON seal_bond_overrides(tenant_id);

ALTER TABLE seal_bond_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_bond_overrides ON seal_bond_overrides
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Pre-arrival → gate → devanning pipeline ─────────────────────────────

CREATE TABLE seal_consignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id        UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE RESTRICT,
  owner_id              UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  shipment_case_id      UUID, -- soft reference, same reasoning as seal_lots.shipment_case_id
  transport_doc_type    TEXT NOT NULL DEFAULT 'BL' CHECK (transport_doc_type IN ('BL','AWB','CMR','RAIL_WAYBILL')),
  transport_doc_number  VARCHAR(100),
  status                TEXT NOT NULL DEFAULT 'EXPECTED' CHECK (status IN (
                          'EXPECTED','ARRIVED_AT_GATE','GATE_IN_COMPLETE','IN_YARD','AWAITING_CUSTOMS',
                          'UNDER_EXAMINATION','RELEASED_FOR_DEVANNING','DEVANNING','DEVANNED','EMPTY_RETURNED',
                          'HELD_BY_CUSTOMS','HELD_BY_AGENCY','DAMAGED','SHORT_SHIPPED','REJECTED_AT_GATE'
                        )),
  expected_arrival      DATE,
  goods_description     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_consignments_tenant ON seal_consignments(tenant_id);
CREATE INDEX idx_seal_consignments_compartment_status ON seal_consignments(compartment_id, status);

ALTER TABLE seal_consignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_consignments ON seal_consignments
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_containers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consignment_id   UUID NOT NULL REFERENCES seal_consignments(id) ON DELETE CASCADE,
  container_number VARCHAR(11) NOT NULL,
  container_size   TEXT NOT NULL DEFAULT '40GP' CHECK (container_size IN ('20GP','40GP','40HC','45HC','20RF','40RF','OTHER')),
  seal_number      VARCHAR(50),
  gross_weight_kg  NUMERIC(10,2),
  tare_weight_kg   NUMERIC(10,2),
  net_weight_kg    NUMERIC(10,2),
  vgm_weight_kg    NUMERIC(10,2),
  gate_in_at       TIMESTAMPTZ,
  gate_out_at      TIMESTAMPTZ,
  eir_reference    VARCHAR(50),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_containers_tenant ON seal_containers(tenant_id);
CREATE INDEX idx_seal_containers_consignment ON seal_containers(consignment_id);

ALTER TABLE seal_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_containers ON seal_containers
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id   UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  consignment_id   UUID REFERENCES seal_consignments(id) ON DELETE SET NULL,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('INBOUND','OUTBOUND')),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')),
  reference        VARCHAR(200),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_appointments_tenant ON seal_appointments(tenant_id);
CREATE INDEX idx_seal_appointments_scheduled ON seal_appointments(scheduled_at);

ALTER TABLE seal_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_appointments ON seal_appointments
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_discrepancies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  container_id     UUID NOT NULL REFERENCES seal_containers(id) ON DELETE CASCADE,
  discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN ('shortage','overage','damage','misdescription','weight_variance')),
  severity         TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','fiscal_relevant')),
  description      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'raised' CHECK (status IN ('raised','investigating','resolved')),
  resolution_note  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_discrepancies_tenant ON seal_discrepancies(tenant_id);
CREATE INDEX idx_seal_discrepancies_container ON seal_discrepancies(container_id);

ALTER TABLE seal_discrepancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_discrepancies ON seal_discrepancies
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
