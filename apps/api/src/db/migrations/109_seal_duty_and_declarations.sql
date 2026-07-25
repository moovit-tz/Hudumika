-- 109_seal_duty_and_declarations.sql
-- SEAL Increment 3 (adapted): the declaration lifecycle. Reuses the
-- platform's REAL, already-populated jurisdiction pack — `hs_codes`
-- (036_hs_customs.sql: 5,977 EAC CET 2022 tariff lines with
-- import_duty_rate/excise_rate/rdl_rate/cpf_rate/vat_rate) and its
-- getHsCode() lookup, the same source ClearOS's own landed-cost engine
-- (customs.service.ts) already reads — rather than inventing a parallel,
-- empty seal_tariff_lines table. No rate is written in application code
-- either way; this just points at the real one instead of a redundant new
-- one. Deliberately NOT reusing ClearOS's own `declarations` table
-- (004_declarations.sql): that aggregate is import-clearance-shaped
-- (tancis_ref, tansad_number, selectivity_channel — a shipment moving
-- through the port into free circulation). SEAL's declaration is an
-- ex-warehouse release FROM an existing bonded lot — a different trigger,
-- needs to drive seal_lots.customs_status via SealService, and the two
-- shouldn't be forced into one schema just because both involve duty.
--
-- Scope trimmed from the full spec Increment 3: document vault,
-- examination management, and periodic stock-account submission are
-- deferred — not required for this increment's own exit criterion (a
-- declaration is built, computed, submitted, released, and the lot's
-- fiscal status changes as a consequence, with the computation
-- reproducible from stored inputs).

CREATE TABLE seal_customs_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id               UUID NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  procedure_code       TEXT NOT NULL DEFAULT 'EX_WAREHOUSE_HOME_USE'
                       CHECK (procedure_code IN ('EX_WAREHOUSE_HOME_USE','EX_WAREHOUSE_RE_EXPORT','EX_WAREHOUSE_TRANSFER')),
  jurisdiction         CHAR(2) NOT NULL DEFAULT 'TZ',
  declaration_date     DATE NOT NULL,
  hs_code              VARCHAR(20) NOT NULL,
  -- Snapshot of the hs_codes row actually used, for point-in-time lookup —
  -- the real reproducibility guarantee is the `computation` JSONB below,
  -- which is never recomputed once stored.
  hs_code_ref_id       UUID REFERENCES hs_codes(id),
  country_of_origin    CHAR(2),
  invoice_value        NUMERIC(18,4) NOT NULL,
  freight              NUMERIC(18,4) NOT NULL DEFAULT 0,
  insurance            NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency             CHAR(3) NOT NULL,
  fx_rate              NUMERIC(18,6) NOT NULL,   -- to TZS; fixed at declaration_date, never drifts
  valuation_method      TEXT NOT NULL DEFAULT 'transaction_value',
  -- Full itemized computation, snapshotted at compute time (spec §5.7:
  -- "store the tariff version, FX rate, and rule-set version with the
  -- result — re-running a two-year-old declaration must give the
  -- identical number").
  computation          JSONB,
  status               TEXT NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT','SUBMITTED','QUERIED','ASSESSED','PAID','RELEASED','CANCELLED')),
  submission_reference TEXT,   -- the manual adapter's tracked reference
  payment_reference    TEXT,
  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_customs_entries_tenant ON seal_customs_entries(tenant_id);
CREATE INDEX idx_seal_customs_entries_lot ON seal_customs_entries(lot_id);
CREATE INDEX idx_seal_customs_entries_status ON seal_customs_entries(tenant_id, status);

ALTER TABLE seal_customs_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_customs_entries ON seal_customs_entries
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
