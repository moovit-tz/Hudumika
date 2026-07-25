-- 110_seal_documents_exams_stockaccount_ops.sql
-- SEAL Increment 4: the four items explicitly deferred out of Increments 2
-- and 3 (see their own header comments) — document vault, examination
-- management, periodic stock-account submission, and the more
-- physical-operations-flavored trio (reefer monitoring, dangerous-goods
-- segregation, yard slotting). AGV orchestration and a true offline-first
-- gate console remain out of scope — this platform has no PWA/local-sync
-- infrastructure to extend (same standing deferral noted in 107), and AGV
-- orchestration is a physical-automation integration with no counterpart
-- system in this codebase to connect to.

-- ── Document vault ───────────────────────────────────────────────────────
-- Generalized (entity_type/entity_id) rather than a dedicated FK column per
-- entity, because a single document (e.g. a bill of lading) legitimately
-- attaches to more than one kind of SEAL record over its life. Reuses the
-- platform's real MinioIntegration.uploadCloudFile/getSignedUrl/deleteDocument
-- for actual storage (apps/api/src/integrations/minio.ts) — this table only
-- holds the metadata + storage_key, exactly like case_documents
-- (003_supporting.sql) does for ClearOS, just not hard-FK'd to one entity kind.
CREATE TABLE seal_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('lot','consignment','container','customs_entry','compartment')),
  entity_id     UUID NOT NULL,
  doc_type      TEXT NOT NULL DEFAULT 'other'
                CHECK (doc_type IN (
                  'bill_of_lading','commercial_invoice','packing_list','certificate_of_origin',
                  'import_permit','phytosanitary_certificate','warehousing_entry',
                  'customs_declaration','examination_report','stock_account_report','other'
                )),
  filename      TEXT NOT NULL,
  storage_key   TEXT NOT NULL,
  size_bytes    INTEGER,
  status        TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','VERIFIED','REJECTED')),
  notes         TEXT,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_documents_tenant ON seal_documents(tenant_id);
CREATE INDEX idx_seal_documents_entity ON seal_documents(tenant_id, entity_type, entity_id);

ALTER TABLE seal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_documents ON seal_documents
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Examination management ──────────────────────────────────────────────
-- One customs entry can only be under one active examination at a time
-- (a second one only makes sense after the first is resolved), but keeps
-- full history rather than being a single mutable column on the entry —
-- selectivity channel is assigned once per submission and is itself part
-- of that history.
CREATE TABLE seal_examinations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customs_entry_id      UUID NOT NULL REFERENCES seal_customs_entries(id) ON DELETE CASCADE,
  selectivity_channel   TEXT NOT NULL DEFAULT 'GREEN' CHECK (selectivity_channel IN ('GREEN','YELLOW','RED')),
  examination_type      TEXT NOT NULL DEFAULT 'DOCUMENT' CHECK (examination_type IN ('DOCUMENT','PHYSICAL','SCAN')),
  status                TEXT NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED','SCHEDULED','IN_PROGRESS','COMPLETED','WAIVED')),
  officer_name          TEXT,
  officer_reference     TEXT,
  scheduled_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  outcome               TEXT CHECK (outcome IN ('CLEARED','DISCREPANCY_FOUND','SEIZURE_RECOMMENDED')),
  findings              TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_examinations_tenant ON seal_examinations(tenant_id);
CREATE INDEX idx_seal_examinations_entry ON seal_examinations(customs_entry_id);
CREATE INDEX idx_seal_examinations_status ON seal_examinations(tenant_id, status);

ALTER TABLE seal_examinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_examinations ON seal_examinations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Periodic stock-account submission ───────────────────────────────────
-- The recurring compliance report a bonded operator submits to customs:
-- opening/closing balances per lot for a compartment over a period,
-- reconstructed from the append-only seal_movements ledger — never
-- hand-entered, so it's reproducible the same way duty computation is
-- (spec §5.7's "never a bare total" principle applied to reporting).
CREATE TABLE seal_stock_account_periods (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id        UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED')),
  opening_lot_count     INTEGER NOT NULL DEFAULT 0,
  closing_lot_count     INTEGER NOT NULL DEFAULT 0,
  total_duty_at_risk    NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_tax_at_risk     NUMERIC(18,4) NOT NULL DEFAULT 0,
  generated_at          TIMESTAMPTZ,
  submission_reference  TEXT,
  submitted_at          TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (compartment_id, period_start, period_end)
);
CREATE INDEX idx_seal_stock_account_periods_tenant ON seal_stock_account_periods(tenant_id);
CREATE INDEX idx_seal_stock_account_periods_compartment ON seal_stock_account_periods(compartment_id);

ALTER TABLE seal_stock_account_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_stock_account_periods ON seal_stock_account_periods
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_stock_account_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id               UUID NOT NULL REFERENCES seal_stock_account_periods(id) ON DELETE CASCADE,
  lot_id                  UUID NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  opening_qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  received_qty            NUMERIC(18,4) NOT NULL DEFAULT 0,
  released_qty            NUMERIC(18,4) NOT NULL DEFAULT 0,
  adjusted_qty            NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_customs_status  TEXT,
  duty_at_risk            NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_at_risk             NUMERIC(18,4) NOT NULL DEFAULT 0
);
CREATE INDEX idx_seal_stock_account_lines_period ON seal_stock_account_lines(period_id);
CREATE INDEX idx_seal_stock_account_lines_tenant ON seal_stock_account_lines(tenant_id);

ALTER TABLE seal_stock_account_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_stock_account_lines ON seal_stock_account_lines
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Dangerous-goods fields + segregation rules ──────────────────────────
ALTER TABLE seal_lots ADD COLUMN is_dangerous_goods BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE seal_lots ADD COLUMN un_number VARCHAR(10);
ALTER TABLE seal_lots ADD COLUMN imdg_class TEXT;

-- Real IMDG segregation classes (not the full IMDG Code segregation table,
-- which runs to dozens of sub-hazard combinations — a representative,
-- genuinely-sourced subset of the most common incompatibilities, expandable
-- later without a schema change).
CREATE TABLE seal_dg_segregation_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_a       TEXT NOT NULL,
  class_b       TEXT NOT NULL,
  compatible    BOOLEAN NOT NULL DEFAULT false,
  note          TEXT,
  UNIQUE (class_a, class_b)
);
INSERT INTO seal_dg_segregation_rules (class_a, class_b, compatible, note) VALUES
  ('1', '3', false, 'Explosives away from flammable liquids'),
  ('1', '5.1', false, 'Explosives away from oxidizers'),
  ('2.1', '2.3', false, 'Flammable gas away from toxic gas'),
  ('3', '5.1', false, 'Flammable liquids away from oxidizers'),
  ('3', '8', false, 'Flammable liquids away from corrosives (segregate)'),
  ('4.1', '5.1', false, 'Flammable solids away from oxidizers'),
  ('4.3', '3', false, 'Water-reactive away from flammable liquids'),
  ('5.1', '5.1', true,  'Oxidizers may co-locate with each other'),
  ('6.1', '3', false, 'Toxic substances away from flammable liquids'),
  ('8', '4.3', false, 'Corrosives away from water-reactive substances');
-- Not RLS'd — this is a reference table (like hs_codes), not tenant data.

-- ── Reefer monitoring ────────────────────────────────────────────────────
ALTER TABLE seal_lots ADD COLUMN requires_reefer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE seal_lots ADD COLUMN reefer_setpoint_c NUMERIC(5,2);

CREATE TABLE seal_reefer_readings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id        UUID NOT NULL REFERENCES seal_lots(id) ON DELETE CASCADE,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature_c NUMERIC(5,2) NOT NULL,
  within_range  BOOLEAN NOT NULL,
  recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  note          TEXT
);
CREATE INDEX idx_seal_reefer_readings_lot ON seal_reefer_readings(lot_id, recorded_at DESC);
CREATE INDEX idx_seal_reefer_readings_tenant ON seal_reefer_readings(tenant_id);

ALTER TABLE seal_reefer_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_reefer_readings ON seal_reefer_readings
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Yard slotting ────────────────────────────────────────────────────────
-- Container-level (not lot-level) — a yard slot/bay is where a container
-- sits before/during devanning, a different physical location from the
-- seal_locations rack/bin a devanned lot is put away into.
CREATE TABLE seal_yard_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id  UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE CASCADE,
  code            VARCHAR(50) NOT NULL,
  capacity_teu    INTEGER NOT NULL DEFAULT 1,
  active          BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (compartment_id, code)
);
CREATE INDEX idx_seal_yard_slots_tenant ON seal_yard_slots(tenant_id);
CREATE INDEX idx_seal_yard_slots_compartment ON seal_yard_slots(compartment_id);

ALTER TABLE seal_yard_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_yard_slots ON seal_yard_slots
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE seal_containers ADD COLUMN yard_slot_id UUID REFERENCES seal_yard_slots(id) ON DELETE SET NULL;
